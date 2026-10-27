## Game loop: picks a city, keeps the walker moving in real time (including
## time spent with the app closed), downloads streets as he nears new ground.
extends Node2D

const Walker := preload("res://scripts/walker.gd")
const OsmApi := preload("res://scripts/osm_api.gd")
const MapView := preload("res://scripts/map_view.gd")
const Character := preload("res://scripts/character.gd")
const Hud := preload("res://scripts/hud.gd")
const StreetGraph := preload("res://scripts/street_graph.gd")
const StreetLoader := preload("res://scripts/street_loader.gd")
const DiskCache := preload("res://scripts/disk_cache.gd")

const SAVE_PATH := "user://save.json"
const STREET_CACHE_DIR := "user://streets/"
const SAVE_EVERY_S := 5.0
## Cells kept loaded around him: 2 means 5 x 5 cells, about 6 x 4.5 km.
const STREET_RING := 2
## Wider while fast-forwarding, since he covers ground much faster.
const CATCH_UP_STREET_RING := 3
## The map zooms out to this while catching up, so far fewer tiles are needed.
const CATCH_UP_ZOOM := 15

var api: OsmApi  # set before adding to the tree to swap in a fake (tests)
var save_path := SAVE_PATH
var street_cache_dir := STREET_CACHE_DIR
var offline_tiles := false  # tests skip tile downloads
var map: MapView
var character: Character
var camera: Camera2D
var hud: Hud
var loader: StreetLoader

var walker: Walker
var city := ""
var last_tick := 0.0  # unix time the walk was last advanced to
var pending_m := 0.0  # meters owed to the walk but not walked yet
var player_zoom := 17  # the zoom the player picked; the map differs while catching up
var _catch_up_total_m := 0.0  # owed distance when the current catch-up began
var _fast_forward_mps := 0.0  # > 0 while catching up
var _save_timer := 0.0
var _next_log_ms := 0
var _real_mps := 0.0
var _speed_m := 0.0
var _speed_s := 0.0
const LOG_EVERY_MS := 5000  # loading details also go to the browser console


func _ready() -> void:
	if api == null:
		api = OsmApi.new()
	add_child(api)
	loader = StreetLoader.new()
	loader.api = api
	loader.cache = DiskCache.new(street_cache_dir)
	add_child(loader)
	map = MapView.new()
	map.offline = offline_tiles
	add_child(map)
	character = Character.new()
	add_child(character)
	camera = Camera2D.new()
	add_child(camera)
	hud = Hud.new()
	add_child(hud)
	hud.search_requested.connect(_on_search)
	hud.city_chosen.connect(_start_city)
	hud.zoom_changed.connect(_on_zoom)
	hud.reset_confirmed.connect(_reset)
	if not _load():
		hud.show_picker()
	print("OSM Walker ready")


func _on_zoom(step: int) -> void:
	player_zoom = clampi(player_zoom + step, 3, 19)
	if not is_catching_up():
		map.set_zoom(player_zoom)


func _on_search(text: String) -> void:
	hud.show_results(await api.search_places(text))


func _start_city(city_name: String, lat: float, lon: float) -> void:
	hud.show_picker("Finding streets in %s…" % city_name)
	var w := Walker.new()
	loader.graph = w.graph
	loader.reset_failures()
	var home := StreetGraph.cell_of(lat, lon)
	while not w.graph.cells.has(home):
		if loader.has_failed(home):
			loader.reset_failures()
			hud.show_picker("Couldn't load streets. Check your connection and try again.")
			return
		loader.request(StreetGraph.cells_by_priority(lat, lon, STREET_RING))
		hud.show_picker("Finding streets in %s…\n\n%s" % [city_name, Hud.detail_text(_server_details({
			"doing": "waiting for the streets where he starts: " + loader.cell_state(home)}))])
		await get_tree().process_frame
	var start := w.graph.nearest_node(lat, lon)
	if start == -1:
		hud.show_picker("No walkable streets there. Try another place.")
		return
	w.start_at(start)
	walker = w
	city = city_name
	last_tick = Time.get_unix_time_from_system()
	pending_m = 0.0
	_end_catch_up()
	map.set_origin(lat, lon)
	hud.show_game(city)
	_save()
	print("Started walking in ", city)


func _reset() -> void:
	walker = null
	_end_catch_up()
	DirAccess.remove_absolute(save_path)
	map.clear()
	hud.set_status("")
	hud.show_picker()


func _process(delta: float) -> void:
	_step(delta)
	if OS.has_feature("web"):
		_publish_state()


func _step(delta: float) -> void:
	if walker == null:
		return
	# Wall-clock time, so minutes in the background or with the app closed count too.
	var now := Time.get_unix_time_from_system()
	pending_m = minf(pending_m + Walker.meters_for_elapsed(now - last_tick), Walker.meters_for_elapsed(Walker.MAX_CATCH_UP_S))
	last_tick = now
	if not is_catching_up() and pending_m >= Hud.CATCH_UP_MIN_M:
		_start_catch_up()
	var here := walker.position()
	var ring := CATCH_UP_STREET_RING if is_catching_up() else STREET_RING
	loader.request(StreetGraph.cells_by_priority(here[0], here[1], ring, _heading()))
	# He always walks what is loaded, even while more streets download.
	var budget := minf(pending_m, _fast_forward_mps * delta) if is_catching_up() else pending_m
	var walked := budget - walker.advance(budget)
	pending_m -= walked
	_measure_speed(walked, delta)
	if is_catching_up() and pending_m < 1.0:
		_end_catch_up()

	var p := walker.position()
	character.position = map.geo_to_local(p[0], p[1])
	character.walking = not walker.needs_data()
	camera.position = character.position
	var view_size := get_viewport_rect().size
	map.show_area(Rect2(camera.position - view_size / 2.0, view_size), _heading())
	hud.set_street(walker.street_name())
	_show_status()

	_save_timer += delta
	if _save_timer >= SAVE_EVERY_S:
		_save_timer = 0.0
		_save()


## Meters per second he really covered over the last second, to compare with the target.
func _measure_speed(walked: float, delta: float) -> void:
	_speed_m += walked
	_speed_s += delta
	if _speed_s >= 1.0:
		_real_mps = _speed_m / _speed_s
		_speed_m = 0.0
		_speed_s = 0.0


func is_catching_up() -> bool:
	return _fast_forward_mps > 0.0


func _start_catch_up() -> void:
	_catch_up_total_m = pending_m
	_fast_forward_mps = Walker.fast_forward_mps(pending_m)
	if map.zoom > CATCH_UP_ZOOM:
		map.set_zoom(CATCH_UP_ZOOM)


func _end_catch_up() -> void:
	_fast_forward_mps = 0.0
	_catch_up_total_m = 0.0
	if map and map.zoom != player_zoom:
		map.set_zoom(player_zoom)


## Direction he is walking on screen (x east, y south), or zero while standing.
func _heading() -> Vector2:
	if walker.to_node == -1:
		return Vector2.ZERO
	var a: Array = walker.graph.nodes[walker.from_node]
	var b: Array = walker.graph.nodes[walker.to_node]
	return (map.geo_to_local(b[0], b[1]) - map.geo_to_local(a[0], a[1])).normalized()


func _show_status() -> void:
	var catch_up := Hud.catch_up_text(pending_m) if is_catching_up() else ""
	if catch_up == "" and not walker.needs_data():
		hud.set_status("")
		return
	var details := Hud.detail_text(loading_details())
	if OS.has_feature("web") and Time.get_ticks_msec() >= _next_log_ms:
		_next_log_ms = Time.get_ticks_msec() + LOG_EVERY_MS
		print("[loading] ", details.replace("\n", " | "))
	if catch_up != "":
		_catch_up_total_m = maxf(_catch_up_total_m, pending_m)
		hud.set_status(catch_up, Hud.Bar.PROGRESS, Hud.catch_up_fraction(_catch_up_total_m, pending_m), details)
	elif loader.is_failing():
		hud.set_status("Can't reach the map server. Retrying…", Hud.Bar.NONE, 0.0, details)
	else:
		hud.set_status("Loading streets…", Hud.Bar.BUSY, 0.0, details)


## Everything the loading details show: catch-up progress, what he is doing,
## street and tile downloads, and the latest server answer and error.
func loading_details() -> Dictionary:
	var d := _server_details({"tiles": map.tile_stats(), "fps": Engine.get_frames_per_second(), "real_mps": _real_mps})
	if is_catching_up():
		d["total_m"] = maxf(_catch_up_total_m, pending_m)
		d["pending_m"] = pending_m
		d["speed_mps"] = _fast_forward_mps
	if walker.needs_data():
		var p: Array = walker.graph.nodes[walker.from_node]
		d["doing"] = "waiting for streets here: " + loader.cell_state(StreetGraph.cell_of(p[0], p[1]))
	elif is_catching_up():
		d["doing"] = "fast-forwarding along " + (walker.street_name() if walker.street_name() != "" else "a street")
	else:
		d["doing"] = "walking"
	return d


## Adds street download numbers and the latest server answer and error to `d`.
func _server_details(d: Dictionary) -> Dictionary:
	d["streets"] = loader.stats()
	d["last_ok"] = api.last_ok
	if not api.last_error.is_empty():
		d["last_error"] = api.last_error.merged({"ago_s": (Time.get_ticks_msec() - api.last_error["at_ms"]) / 1000})
	return d


func _notification(what: int) -> void:
	if what in [NOTIFICATION_WM_CLOSE_REQUEST, NOTIFICATION_APPLICATION_PAUSED, NOTIFICATION_APPLICATION_FOCUS_OUT]:
		_save()


func _save() -> void:
	if walker == null:
		return
	var f := FileAccess.open(save_path, FileAccess.WRITE)
	if f == null:
		return
	f.store_string(JSON.stringify({
		"city": city, "origin": [map.origin_lat, map.origin_lon], "zoom": player_zoom,
		# Owed meters are folded back into the clock so they survive a restart.
		"last_tick": last_tick - pending_m / Walker.SPEED_MPS,
		"walker": walker.to_dict(),
	}))


func _load() -> bool:
	if not FileAccess.file_exists(save_path):
		return false
	var d: Variant = JSON.parse_string(FileAccess.get_file_as_string(save_path))
	if not d is Dictionary or not d.has("walker"):
		return false
	walker = Walker.new()
	walker.load_dict(d["walker"])
	if not walker.graph.has_node(walker.from_node):
		walker = null
		return false
	loader.graph = walker.graph
	city = d.get("city", "")
	last_tick = float(d.get("last_tick", Time.get_unix_time_from_system()))
	player_zoom = int(d.get("zoom", player_zoom))
	map.zoom = player_zoom
	map.set_origin(d["origin"][0], d["origin"][1])
	hud.show_game(city)
	return true


## Snapshot of what is on screen, for the browser e2e test. Rects are in
## window pixels; the test divides by devicePixelRatio to get CSS pixels.
func debug_state() -> Dictionary:
	var xf := get_viewport().get_final_transform()
	var rects := {}
	var controls := hud.debug_controls()
	for key in controls:
		var c: Control = controls[key]
		if c and c.is_visible_in_tree():
			var r := c.get_global_rect()
			var pos := xf * r.position
			var size := r.size * xf.get_scale()
			rects[key] = [pos.x, pos.y, size.x, size.y]
	return {
		"screen": "game" if walker else "picker",
		"city": city,
		"street": hud.street_label.text,
		"total_m": walker.total_m if walker else 0.0,
		"confirm_visible": hud.is_confirm_open(),
		"confirm_enabled": hud.is_confirm_enabled(),
		"rects": rects,
	}


func _publish_state() -> void:
	JavaScriptBridge.eval("window.osmwalkerState = %s;" % JSON.stringify(debug_state()), true)
