## Draws OSM raster tiles around the camera. Positions are relative to `origin`
## so float32 Vector2 keeps sub-pixel precision anywhere on Earth.
##
## OSM's tile policy forbids fetching tiles nobody is looking at, so only
## on-screen tiles are requested. Every viewed tile is kept on disk and shown
## from there next time; a blurry low-zoom layer covers gaps while tiles load.
extends Node2D

const Problems := preload("res://scripts/problems.gd")
const Geo := preload("res://scripts/geo.gd")
const OsmApi := preload("res://scripts/osm_api.gd")
const DiskCache := preload("res://scripts/disk_cache.gd")

const TILE_URL := "https://tile.openstreetmap.org/%d/%d/%d.png"
const TILE_CACHE_DIR := "user://tiles/"
const MAX_PARALLEL := 4
const RETRY_MS := 10000
## Re-download cached tiles after 30 days (the OSM tile policy asks for at least 7).
const TILE_MAX_AGE_S := DiskCache.MAX_AGE_S
## About 15 KB each, so roughly 45 MB on disk.
const MAX_CACHED_FILES := 3000
## PNG decodes per frame, so a screenful of cached tiles does not hitch.
const DECODES_PER_FRAME := 4
## The placeholder layer is this many zoom levels out (one of its tiles covers 64).
const UNDERLAY_STEPS := 3

enum Kind { UNDERLAY, SHOW }

var zoom := 17
var offline := false  # draw nothing, request nothing (tests)
var origin_lat := 0.0
var origin_lon := 0.0
var cache: DiskCache
var _sprites := {}  # "z/x/y" -> Sprite2D (no texture until it is decoded)
var _jobs := {}  # key -> {z, x, y, prio}: tiles waiting for a download slot
var _decode: Array = []  # [key, png bytes] waiting to become textures
var _active := 0
var _failed := {}  # key -> msec of last failure, to back off instead of hammering
var _last_sig := ""
var _tile_failures := 0


func _ready() -> void:
	if not offline:
		cache = DiskCache.new(TILE_CACHE_DIR)
		cache.prune(MAX_CACHED_FILES)


func set_origin(lat: float, lon: float) -> void:
	origin_lat = lat
	origin_lon = lon
	clear()


func set_zoom(z: int) -> void:
	zoom = clampi(z, 3, 19)
	clear()


func clear() -> void:
	for s in _sprites.values():
		s.queue_free()
	_sprites.clear()
	_jobs.clear()
	_decode.clear()
	_last_sig = ""


func geo_to_local(lat: float, lon: float) -> Vector2:
	return Vector2(
		Geo.lon_to_px(lon, zoom) - Geo.lon_to_px(origin_lon, zoom),
		Geo.lat_to_px(lat, zoom) - Geo.lat_to_px(origin_lat, zoom))


## Closest zoom (12 at most) where both [lat, lon] points fit well inside `size`.
static func zoom_to_fit(a: Array, b: Array, size: Vector2) -> int:
	for z in range(12, 3, -1):
		var dx := absf(Geo.lon_to_px(a[1], z) - Geo.lon_to_px(b[1], z))
		var dy := absf(Geo.lat_to_px(a[0], z) - Geo.lat_to_px(b[0], z))
		if dx <= size.x * 0.7 and dy <= size.y * 0.7:
			return z
	return 3


## Closest zoom (`max_z` at most) where the box [south, west, north, east] fits well inside `size`.
static func zoom_to_fit_box(b: Array, size: Vector2, max_z: int) -> int:
	for z in range(max_z, 3, -1):
		var dx := absf(Geo.lon_to_px(b[3], z) - Geo.lon_to_px(b[1], z))
		var dy := absf(Geo.lat_to_px(b[0], z) - Geo.lat_to_px(b[2], z))
		if dx <= size.x * 0.8 and dy <= size.y * 0.8:
			return z
	return 3


## Tiles overlapping `view` (local px, origin at world px ox, oy), grown by `ring`.
static func tile_range(view: Rect2, ox: float, oy: float, ring: int, z := 19) -> Rect2i:
	var n := 1 << z
	var x0 := floori((ox + view.position.x) / Geo.TILE_SIZE) - ring
	var x1 := floori((ox + view.end.x) / Geo.TILE_SIZE) + ring
	var y0 := maxi(floori((oy + view.position.y) / Geo.TILE_SIZE) - ring, 0)
	var y1 := mini(floori((oy + view.end.y) / Geo.TILE_SIZE) + ring, n - 1)
	return Rect2i(x0, y0, x1 - x0 + 1, y1 - y0 + 1)


## Lower is sooner. Distances are in tiles of the main zoom; tiles ahead of
## `heading` are pulled forward, and the cheap placeholder layer goes first.
static func priority(tile_center: Vector2, focus: Vector2, kind: Kind, heading := Vector2.ZERO) -> float:
	var off := tile_center - focus
	var base := off.length() - 0.5 * off.dot(heading.normalized())
	return base if kind == Kind.UNDERLAY else base + 20.0


static func next_job(jobs: Dictionary) -> String:
	var best := ""
	var best_p := INF
	for key in jobs:
		if jobs[key]["prio"] < best_p:
			best_p = jobs[key]["prio"]
			best = key
	return best


## Shows every tile that overlaps `view` (a rect in local coordinates).
func show_area(view: Rect2, heading := Vector2.ZERO) -> void:
	if offline:
		return
	var ox := Geo.lon_to_px(origin_lon, zoom)
	var oy := Geo.lat_to_px(origin_lat, zoom)
	var uz := maxi(zoom - UNDERLAY_STEPS, 0)
	var f := float(1 << (zoom - uz))
	var main := tile_range(view, ox, oy, 0, zoom)
	var under := tile_range(Rect2(view.position / f, view.size / f), ox / f, oy / f, 0, uz)
	var sig := "%d %s %s" % [zoom, main, under]
	if sig != _last_sig:
		_last_sig = sig
		var focus := (Vector2(ox, oy) + view.get_center()) / Geo.TILE_SIZE
		_want(main, zoom, 1.0, Kind.SHOW, focus, heading)
		_want(under, uz, f, Kind.UNDERLAY, focus, heading)
		# Forget what scrolled away (with a tile of slack, so small pans don't reload).
		var keep := {}
		_keys(main.grow(1), zoom, keep)
		_keys(under.grow(1), uz, keep)
		for key in _sprites.keys():
			if not keep.has(key):
				_sprites[key].queue_free()
				_sprites.erase(key)
		for key in _jobs.keys():
			if not keep.has(key):
				_jobs.erase(key)
	_pump()


static func _keys(r: Rect2i, z: int, out: Dictionary) -> void:
	for ty in range(r.position.y, r.end.y):
		for tx in range(r.position.x, r.end.x):
			out["%d/%d/%d" % [z, tx, ty]] = true


## Puts up a sprite for each tile in `r`, filled from disk or queued for download.
func _want(r: Rect2i, z: int, scale_f: float, kind: Kind, focus: Vector2, heading: Vector2) -> void:
	var n := 1 << z
	var ox := Geo.lon_to_px(origin_lon, zoom)
	var oy := Geo.lat_to_px(origin_lat, zoom)
	var now := int(Time.get_unix_time_from_system())
	for ty in range(r.position.y, r.end.y):
		for tx in range(r.position.x, r.end.x):
			var key := "%d/%d/%d" % [z, tx, ty]
			if _sprites.has(key):
				continue
			var s := Sprite2D.new()
			s.centered = false
			s.scale = Vector2(scale_f, scale_f)
			s.position = Vector2(tx, ty) * Geo.TILE_SIZE * scale_f - Vector2(ox, oy)
			s.z_index = -1 if kind == Kind.UNDERLAY else 0
			add_child(s)
			_sprites[key] = s
			var x := posmod(tx, n)
			var cached := cache.read(_file(z, x, ty))
			if not cached.is_empty():
				_decode.append([key, cached["bytes"]])
				if not DiskCache.is_stale(cached["t"], now, TILE_MAX_AGE_S):
					continue
			if Time.get_ticks_msec() - _failed.get(key, -RETRY_MS) < RETRY_MS:
				continue
			var center := Vector2(tx + 0.5, ty + 0.5) * scale_f
			_jobs[key] = {"z": z, "x": x, "y": ty, "prio": priority(center, focus, kind, heading)}


static func _file(z: int, x: int, y: int) -> String:
	return "%d_%d_%d.png" % [z, x, y]


func _pump() -> void:
	while _active < MAX_PARALLEL and not _jobs.is_empty():
		var key := next_job(_jobs)
		var job: Dictionary = _jobs[key]
		_jobs.erase(key)
		_load_tile(key, job["z"], job["x"], job["y"])


func _process(_delta: float) -> void:
	for i in DECODES_PER_FRAME:
		if _decode.is_empty():
			return
		var d: Array = _decode.pop_front()
		if not _sprites.has(d[0]):
			continue
		var img := Image.new()
		if img.load_png_from_buffer(d[1]) == OK:
			_sprites[d[0]].texture = ImageTexture.create_from_image(img)


func _load_tile(key: String, z: int, x: int, y: int) -> void:
	_active += 1
	var req := HTTPRequest.new()
	add_child(req)
	req.request(TILE_URL % [z, x, y], OsmApi.headers())
	var res: Array = await req.request_completed
	req.queue_free()
	_active -= 1
	if res[0] == HTTPRequest.RESULT_SUCCESS and res[1] == 200:
		cache.put(_file(z, x, y), res[3])
		if _sprites.has(key):
			_decode.append([key, res[3]])
	else:
		_failed[key] = Time.get_ticks_msec()
		_tile_failures += 1
		if not offline:
			Problems.warn_now("Map tile download failed: %s" % OsmApi.describe_failure(res[0], res[1]))
	_pump()


## Numbers for the on-screen loading details (detailed tiles only, not the placeholder layer).
func tile_stats() -> Dictionary:
	var prefix := "%d/" % zoom
	var on_screen := 0
	var loaded := 0
	for key in _sprites:
		if key.begins_with(prefix):
			on_screen += 1
			if _sprites[key].texture:
				loaded += 1
	return {"on_screen": on_screen, "loaded": loaded, "downloading": _active, "queued": _jobs.size(), "failed": _tile_failures}
