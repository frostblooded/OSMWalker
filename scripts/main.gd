## Game loop: picks a city, keeps the walker moving in real time while the app
## is open (he waits where he is while it is closed), downloads streets as he nears new ground,
## and now and then sends him on a trip to another city.
extends Node2D

const Walker := preload("res://scripts/walker.gd")
const OsmApi := preload("res://scripts/osm_api.gd")
const MapView := preload("res://scripts/map_view.gd")
const Character := preload("res://scripts/character.gd")
const Hud := preload("res://scripts/hud.gd")
const StreetGraph := preload("res://scripts/street_graph.gd")
const StreetLoader := preload("res://scripts/street_loader.gd")
const DiskCache := preload("res://scripts/disk_cache.gd")
const Trips := preload("res://scripts/trips.gd")

const SAVE_PATH := "user://save.json"
const STREET_CACHE_DIR := "user://streets/"
const SAVE_EVERY_S := 5.0
## Longest frame that counts as walking, so a hidden tab or a stall never jumps him ahead.
const MAX_STEP_S := 1.0
## Cells kept loaded around him: 2 means 5 x 5 cells, about 6 x 4.5 km.
const STREET_RING := 2
const TRIP_LINE_COLOR := Color(0.85, 0.2, 0.25, 0.85)
const TRIP_LINE_WIDTH := 8.0

var api: OsmApi  # set before adding to the tree to swap in a fake (tests)
var save_path := SAVE_PATH
var street_cache_dir := STREET_CACHE_DIR
var offline_tiles := false  # tests skip tile downloads
var map: MapView
var character: Character
var camera: Camera2D
var hud: Hud
var loader: StreetLoader
var trip_line: Line2D
var trips: Trips
var rng := RandomNumberGenerator.new()
var roll_source: Callable  # returns the trip roll in [0, 1); tests swap in fixed rolls

var walker: Walker
var city := ""
var country := ""  # country code of where he is
var skip_roll := false  # true until the first destination after choosing a city
var player_zoom := 17  # the zoom the player picked; the map differs while travelling
var _save_timer := 0.0
var _next_log_ms := 0
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
	trip_line = Line2D.new()
	trip_line.width = TRIP_LINE_WIDTH
	trip_line.default_color = TRIP_LINE_COLOR
	trip_line.visible = false
	add_child(trip_line)
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
	trips = Trips.shared()
	rng.randomize()
	if not _load():
		hud.show_picker()
	print("OSM Walker ready")


func _on_zoom(step: int) -> void:
	player_zoom = clampi(player_zoom + step, 3, 19)
	_apply_zoom()


func _on_search(text: String) -> void:
	hud.show_results(await api.search_places(text))


func _start_city(city_name: String, lat: float, lon: float, bbox: Array) -> void:
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
	w.bounds = Walker.city_bounds(lat, lon, bbox)
	_attach(w)
	city = city_name
	country = trips.country_at(lat, lon)
	skip_roll = true
	_apply_zoom()
	map.set_origin(lat, lon)
	hud.show_game(city)
	_save()
	print("Started walking in ", city)


func _attach(w: Walker) -> void:
	walker = w
	w.trip_planner = _plan_trip
	w.landed.connect(_on_landed)


## Asked on each new destination: maybe a city to travel to instead.
func _plan_trip() -> Dictionary:
	if skip_roll:
		skip_roll = false
		return {}
	var r: float = roll_source.call() if roll_source.is_valid() else rng.randf()
	var here := walker.position()
	var dest := trips.pick(Trips.roll(r), country, here[0], here[1], rng)
	if dest.is_empty():
		return {}
	print("Travelling to %s, %s" % [dest["name"], dest["country"]])
	return dest.merged({"bounds": Trips.city_bounds(dest)})


func _on_landed(dest: Dictionary) -> void:
	city = "%s, %s" % [dest["name"], dest["country"]]
	country = dest["code"]
	loader.graph = walker.graph
	loader.reset_failures()
	map.set_origin(dest["lat"], dest["lon"])
	hud.show_game(city)
	_save()
	print("Arrived in ", city)


func _reset() -> void:
	walker = null
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
	if not walker.is_traveling():
		var here := walker.position()
		loader.request(StreetGraph.cells_by_priority(here[0], here[1], STREET_RING, _goal_heading()))
	# He walks what is loaded and waits at the edge until more streets arrive.
	walker.advance(minf(delta, MAX_STEP_S) * Walker.SPEED_MPS)

	_apply_zoom()
	_show_trip_line()
	var p := walker.position()
	character.position = map.geo_to_local(p[0], p[1])
	character.walking = not walker.needs_data() and not walker.is_resting()
	camera.position = character.position
	var view_size := get_viewport_rect().size
	map.show_area(Rect2(camera.position - view_size / 2.0, view_size), _heading())
	if walker.is_traveling():
		hud.set_trip(walker.travel["to"]["name"])
	else:
		hud.set_street(walker.street_name())
	_show_status()

	_save_timer += delta
	if _save_timer >= SAVE_EVERY_S:
		_save_timer = 0.0
		_save()


## The player's zoom, or far out to show a trip.
func _wanted_zoom() -> int:
	if walker and walker.is_traveling():
		var to: Dictionary = walker.travel["to"]
		return MapView.zoom_to_fit(walker.travel["from"], [to["lat"], to["lon"]], get_viewport_rect().size)
	return player_zoom


func _apply_zoom() -> void:
	var z := _wanted_zoom()
	if map.zoom != z:
		map.set_zoom(z)


## While travelling, a straight line from where he left to where he is going.
func _show_trip_line() -> void:
	trip_line.visible = walker.is_traveling()
	if trip_line.visible:
		var a: Array = walker.travel["from"]
		var to: Dictionary = walker.travel["to"]
		trip_line.points = PackedVector2Array([map.geo_to_local(a[0], a[1]), map.geo_to_local(to["lat"], to["lon"])])


## Direction to where he is heading (x east, y south), so streets that way load first.
func _goal_heading() -> Vector2:
	if walker.goal.is_empty():
		return _heading()
	var here := walker.position()
	return (map.geo_to_local(walker.goal[0], walker.goal[1]) - map.geo_to_local(here[0], here[1])).normalized()


## Direction he is walking on screen (x east, y south), or zero while standing.
func _heading() -> Vector2:
	if walker.to_node == -1:
		return Vector2.ZERO
	var a: Array = walker.graph.nodes[walker.from_node]
	var b: Array = walker.graph.nodes[walker.to_node]
	return (map.geo_to_local(b[0], b[1]) - map.geo_to_local(a[0], a[1])).normalized()


func _show_status() -> void:
	if not walker.needs_data():
		hud.set_status("")
		return
	var details := Hud.detail_text(loading_details())
	if OS.has_feature("web") and Time.get_ticks_msec() >= _next_log_ms:
		_next_log_ms = Time.get_ticks_msec() + LOG_EVERY_MS
		print("[loading] ", details.replace("\n", " | "))
	if loader.is_failing():
		hud.set_status("Can't reach the map server. Retrying…", Hud.Bar.NONE, 0.0, details)
	else:
		hud.set_status("Loading streets…", Hud.Bar.BUSY, 0.0, details)


## Everything the loading details show: what he is doing,
## street and tile downloads, and the latest server answer and error.
func loading_details() -> Dictionary:
	var d := _server_details({"tiles": map.tile_stats()})
	if walker.is_traveling():
		d["doing"] = "travelling to " + walker.travel["to"]["name"]
	elif walker.needs_data():
		var p: Array = walker.graph.nodes[walker.from_node]
		d["doing"] = "waiting for streets here: " + loader.cell_state(StreetGraph.cell_of(p[0], p[1]))
	else:
		d["doing"] = "walking"
	return d


## Adds street download numbers and the latest server answer and error to `d`.
func _server_details(d: Dictionary) -> Dictionary:
	d["streets"] = loader.stats()
	d["last_ok"] = api.last_ok
	var servers := {}
	for host in api.server_stats:
		var st: Dictionary = api.server_stats[host]
		servers[host] = st.merged({"resting": Time.get_ticks_msec() < st["rest_until_ms"]})
	d["servers"] = servers
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
		"city": city, "country": country, "skip_roll": skip_roll, "origin": [map.origin_lat, map.origin_lon], "zoom": player_zoom,
		"walker": walker.to_dict(),
	}))


func _load() -> bool:
	if not FileAccess.file_exists(save_path):
		return false
	var d: Variant = JSON.parse_string(FileAccess.get_file_as_string(save_path))
	if not d is Dictionary or not d.has("walker"):
		return false
	var w := Walker.new()
	w.load_dict(d["walker"])
	if not w.graph.has_node(w.from_node):
		return false
	_attach(w)
	loader.graph = walker.graph
	city = d.get("city", "")
	player_zoom = int(d.get("zoom", player_zoom))
	map.zoom = player_zoom
	map.set_origin(d["origin"][0], d["origin"][1])
	if walker.bounds.size() != 4:
		# Saved before destinations existed: the city is the area around where he started.
		walker.bounds = Walker.city_bounds(d["origin"][0], d["origin"][1], [])
	country = d.get("country", "")
	if country == "":
		country = trips.country_at(d["origin"][0], d["origin"][1])
	skip_roll = bool(d.get("skip_roll", false))
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
