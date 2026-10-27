## Draws OSM raster tiles around the camera. Positions are relative to `origin`
## so float32 Vector2 keeps sub-pixel precision anywhere on Earth.
extends Node2D

const Geo := preload("res://scripts/geo.gd")
const OsmApi := preload("res://scripts/osm_api.gd")
const TILE_URL := "https://tile.openstreetmap.org/%d/%d/%d.png"
const MAX_PARALLEL := 4
const MAX_CACHED := 200
const RETRY_MS := 10000

var zoom := 17
var offline := false  # draw nothing, request nothing (tests)
var origin_lat := 0.0
var origin_lon := 0.0
var _tiles := {}  # "z/x/y" -> Sprite2D (placeholder until its texture arrives)
var _queue: Array = []
var _active := 0
var _failed := {}  # key -> msec of last failure, to back off instead of hammering


func set_origin(lat: float, lon: float) -> void:
	origin_lat = lat
	origin_lon = lon
	clear()


func set_zoom(z: int) -> void:
	zoom = clampi(z, 3, 19)
	clear()


func clear() -> void:
	for s in _tiles.values():
		s.queue_free()
	_tiles.clear()
	_queue.clear()


func geo_to_local(lat: float, lon: float) -> Vector2:
	return Vector2(
		Geo.lon_to_px(lon, zoom) - Geo.lon_to_px(origin_lon, zoom),
		Geo.lat_to_px(lat, zoom) - Geo.lat_to_px(origin_lat, zoom))


## Requests every tile that overlaps `view` (a rect in local coordinates).
func show_area(view: Rect2) -> void:
	if offline:
		return
	var ox := Geo.lon_to_px(origin_lon, zoom)
	var oy := Geo.lat_to_px(origin_lat, zoom)
	var n := 1 << zoom
	var x0 := floori((ox + view.position.x) / Geo.TILE_SIZE)
	var x1 := floori((ox + view.end.x) / Geo.TILE_SIZE)
	var y0 := maxi(floori((oy + view.position.y) / Geo.TILE_SIZE), 0)
	var y1 := mini(floori((oy + view.end.y) / Geo.TILE_SIZE), n - 1)
	for ty in range(y0, y1 + 1):
		for tx in range(x0, x1 + 1):
			var key := "%d/%d/%d" % [zoom, tx, ty]
			if _tiles.has(key) or Time.get_ticks_msec() - _failed.get(key, -RETRY_MS) < RETRY_MS:
				continue
			var s := Sprite2D.new()
			s.centered = false
			s.position = Vector2(tx * Geo.TILE_SIZE - ox, ty * Geo.TILE_SIZE - oy)
			add_child(s)
			_tiles[key] = s
			_queue.append([key, posmod(tx, n), ty])
	_evict(view)
	_pump()


func _evict(view: Rect2) -> void:
	if _tiles.size() <= MAX_CACHED:
		return
	var keep := view.grow(Geo.TILE_SIZE * 2)
	for key in _tiles.keys():
		var s: Sprite2D = _tiles[key]
		if not keep.has_point(s.position):
			s.queue_free()
			_tiles.erase(key)


func _pump() -> void:
	while _active < MAX_PARALLEL and not _queue.is_empty():
		var job: Array = _queue.pop_back()  # newest first: what is on screen now
		if _tiles.has(job[0]):
			_load_tile(job[0], job[1], job[2])


func _load_tile(key: String, x: int, y: int) -> void:
	_active += 1
	var z := zoom
	var req := HTTPRequest.new()
	add_child(req)
	req.request(TILE_URL % [z, x, y], OsmApi.headers())
	var res: Array = await req.request_completed
	req.queue_free()
	_active -= 1
	if res[0] == HTTPRequest.RESULT_SUCCESS and res[1] == 200 and _tiles.has(key):
		var img := Image.new()
		if img.load_png_from_buffer(res[3]) == OK:
			_tiles[key].texture = ImageTexture.create_from_image(img)
	elif _tiles.has(key):
		_tiles[key].queue_free()
		_tiles.erase(key)
		_failed[key] = Time.get_ticks_msec()
	_pump()
