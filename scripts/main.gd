## Game loop: picks a city, keeps the walker moving in real time (including
## time spent with the app closed), downloads streets as he nears new ground.
extends Node2D

const Walker := preload("res://scripts/walker.gd")
const Geo := preload("res://scripts/geo.gd")
const OsmApi := preload("res://scripts/osm_api.gd")
const MapView := preload("res://scripts/map_view.gd")
const Character := preload("res://scripts/character.gd")
const Hud := preload("res://scripts/hud.gd")

const SAVE_PATH := "user://save.json"
const FETCH_RADIUS_M := 800.0
const FETCH_RETRY_MS := 15000
const SAVE_EVERY_S := 5.0
const CATCH_UP_NOTICE_M := 30.0

var api: OsmApi  # set before adding to the tree to swap in a fake (tests)
var save_path := SAVE_PATH
var offline_tiles := false  # tests skip tile downloads
var map: MapView
var character: Character
var camera: Camera2D
var hud: Hud

var walker: Walker
var city := ""
var last_tick := 0.0  # unix time the walk was last advanced to
var pending_m := 0.0  # meters owed to the walk but not walked yet
var _fetching := false
var _next_fetch_ms := 0
var _save_timer := 0.0


func _ready() -> void:
	if api == null:
		api = OsmApi.new()
	add_child(api)
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
	hud.zoom_changed.connect(func(step): map.set_zoom(map.zoom + step))
	hud.reset_confirmed.connect(_reset)
	if not _load():
		hud.show_picker()
	print("OSM Walker ready")


func _on_search(text: String) -> void:
	hud.show_results(await api.search_places(text))


func _start_city(city_name: String, lat: float, lon: float) -> void:
	hud.show_picker("Finding streets in %s…" % city_name)
	var w := Walker.new()
	if not await _download_around(w, lat, lon):
		hud.show_picker("Couldn't load streets. Check your connection and try again.")
		return
	var start := w.graph.nearest_node(lat, lon)
	if start == -1:
		hud.show_picker("No walkable streets there. Try another place.")
		return
	w.start_at(start)
	walker = w
	city = city_name
	last_tick = Time.get_unix_time_from_system()
	pending_m = 0.0
	map.set_origin(lat, lon)
	hud.show_game(city)
	_save()
	print("Started walking in ", city)


func _reset() -> void:
	walker = null
	DirAccess.remove_absolute(save_path)
	map.clear()
	hud.show_picker()


func _download_around(w: Walker, lat: float, lon: float) -> bool:
	_fetching = true
	var bbox := Geo.bbox_around(lat, lon, FETCH_RADIUS_M)
	var data: Variant = await api.fetch_streets(bbox)
	_fetching = false
	if data is Dictionary:
		w.graph.add_overpass(data, bbox)
		return true
	_next_fetch_ms = Time.get_ticks_msec() + FETCH_RETRY_MS
	return false


func _process(delta: float) -> void:
	if OS.has_feature("web"):
		_publish_state()
	if walker == null:
		return
	# Wall-clock time, so minutes in the background or with the app closed count too.
	var now := Time.get_unix_time_from_system()
	pending_m = minf(pending_m + Walker.meters_for_elapsed(now - last_tick), Walker.meters_for_elapsed(Walker.MAX_CATCH_UP_S))
	last_tick = now
	if not _fetching:
		pending_m = walker.advance(pending_m)
		if pending_m > 0.0 and Time.get_ticks_msec() >= _next_fetch_ms:
			var here := walker.position()
			_download_around(walker, here[0], here[1])

	var p := walker.position()
	character.position = map.geo_to_local(p[0], p[1])
	character.walking = pending_m < CATCH_UP_NOTICE_M
	camera.position = character.position
	var view_size := get_viewport_rect().size
	map.show_area(Rect2(camera.position - view_size / 2.0, view_size))
	hud.set_street(walker.street_name())
	if pending_m >= CATCH_UP_NOTICE_M:
		hud.overlay_label.text = "Catching up: %.1f km walked while you were away…" % (pending_m / 1000.0)
	else:
		hud.overlay_label.text = ""

	_save_timer += delta
	if _save_timer >= SAVE_EVERY_S:
		_save_timer = 0.0
		_save()


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
		"city": city, "origin": [map.origin_lat, map.origin_lon], "zoom": map.zoom,
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
	city = d.get("city", "")
	last_tick = float(d.get("last_tick", Time.get_unix_time_from_system()))
	map.zoom = int(d.get("zoom", map.zoom))
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
