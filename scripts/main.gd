## Game loop: picks a city, keeps the walker moving in real time while the app
## is open (he waits where he is while it is closed), downloads streets as he nears new ground,
## and now and then sends him on a trip to another city. At each place he
## does an action that changes his stats (see stats.gd and activities.gd).
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
const PlacePin := preload("res://scripts/place_pin.gd")
const Stats := preload("res://scripts/stats.gd")
const Activities := preload("res://scripts/activities.gd")
const Geo := preload("res://scripts/geo.gd")
const CityFacts := preload("res://scripts/city_facts.gd")
const TrailView := preload("res://scripts/trail_view.gd")
const DebugLog := preload("res://scripts/debug_log.gd")

const SAVE_PATH := "user://save.json"
const STREET_CACHE_DIR := "user://streets/"
const SAVE_EVERY_S := 5.0
## Longest frame that counts as walking, so a hidden tab or a stall never jumps him ahead.
const MAX_STEP_S := 1.0
## Zoom used when a history entry is tapped, unless the player's is closer.
const HISTORY_SPOT_ZOOM := 16
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
var place_pin: Node2D
var trail_view: TrailView
var history_focus := []  # [lat, lon] of the tapped history entry, [] for the whole trail
var goal_view := false  # the map shows him and his goal instead of following him
var _goal_view_of := []  # [lat, lon] of the goal the view was opened for
var trips: Trips
var rng := RandomNumberGenerator.new()
var roll_source: Callable  # returns the trip roll in [0, 1); tests swap in fixed rolls
var stats := Stats.new()
var activities: Activities
var city_facts := []  # trivia actions for random spots, from Wikidata
var clock_hour := -1  # >= 0 pins the hour of day (tests)

var walker: Walker
var city := ""
var country := ""  # country code of where he is
var skip_roll := false  # true until the first destination after choosing a city
var player_zoom := 17  # the zoom the player picked; the map differs while travelling
var _save_timer := 0.0
var _next_log_ms := 0
const LOG_EVERY_MS := 5000  # loading details also go to the browser console
## How often the open debug panel is refreshed.
const DEBUG_EVERY_S := 1.0

var debug_log := DebugLog.new()
var _roll_info := {}  # how the trip dice went for the pick being made
var _forced := ""  # the debug button behind the pick being made, "" for none
var _debug_timer := 0.0


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
	place_pin = PlacePin.new()
	place_pin.visible = false
	add_child(place_pin)
	trail_view = TrailView.new()
	trail_view.visible = false
	add_child(trail_view)
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
	hud.history_toggled.connect(_on_history_toggled)
	hud.history_entry_tapped.connect(_on_history_tapped)
	hud.goal_tapped.connect(_on_goal_tapped)
	hud.back_tapped.connect(func(): goal_view = false)
	hud.debug_toggled.connect(func(open): if open: _refresh_debug())
	hud.debug_goal_pressed.connect(debug_new_goal)
	hud.debug_trip_pressed.connect(debug_trip)
	trips = Trips.shared()
	activities = Activities.shared()
	rng.randomize()
	if not _load():
		hud.show_picker()
	print("OSM Walker ready")


func _on_zoom(step: int) -> void:
	player_zoom = clampi(player_zoom + step, 3, 19)
	_apply_zoom()


func _on_history_toggled(open: bool) -> void:
	history_focus = []
	trail_view.highlight = -1
	trail_view.visible = open
	if walker:
		_apply_zoom()


func _on_history_tapped(i: int) -> void:
	var e: Dictionary = stats.history.entries[i]
	if e["at"].is_empty():
		return
	history_focus = e["at"]
	trail_view.highlight = stats.history.number(i)


## Tapping the goal line shows him and the goal together; tapping it again follows him.
func _on_goal_tapped() -> void:
	if walker == null:
		return
	_goal_view_of = _goal_target()
	goal_view = not goal_view and not _goal_view_of.is_empty()


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
	stats = Stats.new()
	debug_log = DebugLog.new()
	_attach(w)
	city = city_name
	country = trips.country_at(lat, lon)
	_learn_city(lat, lon)
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
	w.arrived.connect(_on_arrived)
	w.picked.connect(_on_picked)


func _hour() -> int:
	return clock_hour if clock_hour >= 0 else int(Time.get_datetime_dict_from_system()["hour"])


## At a destination: a first-visit bonus, then an action he can do there,
## which sets how long he stays.
func _on_arrived(place: Dictionary) -> void:
	_track()
	var bonus := stats.visit(place)
	if bonus > 0:
		stats.say("Reached %s for the first time (+%d XP)" % [place["name"], bonus])
	elif not place.is_empty():
		stats.say("Reached " + place["name"])
	var options := activities.for_place(place, country) + city_facts
	var action := Activities.choose(options, stats, _hour(), rng.randf())
	if action.is_empty():
		return
	stats.do(action, place.get("name", ""), rng)
	walker.rest_for(Activities.rest_minutes(action))


## Health at zero: he wakes at the nearest known hospital, poorer.
func _faint() -> void:
	var here := walker.position()
	var hospital := {}
	var best := INF
	for p in walker.graph.places_in(walker.bounds):
		var d := Geo.distance_m(here[0], here[1], p["lat"], p["lon"])
		if p["class"] == "hospital" and d < best:
			best = d
			hospital = p
	stats.wake_in_hospital(hospital.get("name", ""))
	if walker.is_traveling():
		return
	if not hospital.is_empty():
		var node := walker.graph.nearest_node(hospital["lat"], hospital["lon"])
		if node != -1:
			walker.start_at(node)
			stats.history.break_trail()
			_track()
	walker.rest_for(Activities.MAX_MINUTES)
	walker.place = hospital


## Looks the city up on Wikidata in the background for trivia at random
## spots. An answer for a city he has since left is dropped.
func _learn_city(lat: float, lon: float) -> void:
	city_facts = []
	var asked := city
	var rows: Array = await api.fetch_city_facts(lat, lon)
	if city == asked:
		city_facts = CityFacts.actions(rows)


## Asked on each new destination: maybe a city to travel to instead.
func _plan_trip() -> Dictionary:
	if skip_roll:
		skip_roll = false
		_roll_info = {"skipped": "first pick in a new city"}
		return {}
	var r: float = roll_source.call() if roll_source.is_valid() else rng.randf()
	var kind := Trips.roll(r)
	_roll_info = {"roll": r, "outcome": ["stay", "city", "country"][kind]}
	if kind == Trips.Kind.STAY:
		return {}
	var here := walker.position()
	var dest := _trip_to(kind, here)
	if dest.is_empty():
		return {}
	_set_off(dest)
	return dest.merged({"bounds": Trips.city_bounds(dest)})


## A city for a trip of `kind`, with how many there were and its odds in
## _roll_info for the debug log.
func _trip_to(kind: Trips.Kind, here: Array) -> Dictionary:
	var opts := trips.options(kind, country, here[0], here[1])
	var dest := trips.pick(kind, country, here[0], here[1], rng)
	if dest.is_empty():
		_roll_info["no_trip"] = "no other city to go to"
		return {}
	var total: float = opts.reduce(func(acc, c): return acc + c["pop"], 0.0)
	_roll_info.merge({"options": opts.size(), "chance": dest["pop"] / maxf(total, 1.0)})
	return dest


func _set_off(dest: Dictionary) -> void:
	print("Travelling to %s, %s" % [dest["name"], dest["country"]])
	stats.say("Set off for %s, %s" % [dest["name"], dest["country"]])
	stats.history.break_trail()


## Each pick goes in the debug log with the trip roll that came before it.
func _on_picked(info: Dictionary) -> void:
	var e := _roll_info.merged(info)
	if _forced != "":
		e["forced"] = _forced
	debug_log.add(e)
	_roll_info = {}
	if hud.is_debug_open():
		_refresh_debug()


## Debug button: ends any rest or trip and picks a new goal now, rolling
## the trip dice again.
func debug_new_goal() -> void:
	if walker == null:
		return
	skip_roll = false
	_forced = "goal"
	walker.force_new_goal()
	_forced = ""


## Debug button: lands him at once in another city of the country
## (Trips.Kind.CITY) or abroad (Trips.Kind.COUNTRY).
func debug_trip(kind: int) -> void:
	if walker == null:
		return
	_roll_info = {}
	var dest := _trip_to(kind, walker.position())
	var e := _roll_info.merged({"forced": ["", "city", "country"][kind]})
	_roll_info = {}
	if dest.is_empty():
		debug_log.add(e)
		_refresh_debug()
		return
	e["trip"] = "%s, %s" % [dest["name"], dest["country"]]
	debug_log.add(e)
	_set_off(dest)
	walker.rest_m = 0.0
	walker.start_travel(dest.merged({"bounds": Trips.city_bounds(dest)}))
	walker.land_now()
	_refresh_debug()


func _on_landed(dest: Dictionary) -> void:
	city = "%s, %s" % [dest["name"], dest["country"]]
	country = dest["code"]
	_track()
	stats.say("Arrived in " + city)
	_learn_city(dest["lat"], dest["lon"])
	loader.graph = walker.graph
	loader.reset_failures()
	map.set_origin(dest["lat"], dest["lon"])
	hud.show_game(city)
	_save()
	print("Arrived in ", city)


func _reset() -> void:
	walker = null
	stats = Stats.new()
	debug_log = DebugLog.new()
	DirAccess.remove_absolute(save_path)
	map.clear()
	trail_view.visible = false
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
	var dt := minf(delta, MAX_STEP_S)
	var before := walker.total_m
	walker.advance(dt * Walker.SPEED_MPS)
	stats.pass_time(dt / 60.0, walker.total_m - before)
	if not walker.is_traveling():
		_track()
	if stats.fainted():
		_faint()
	hud.set_stats(stats)

	if goal_view and (_goal_target() != _goal_view_of or trail_view.visible):
		goal_view = false  # a new goal, a trip or the history ends it
	hud.set_goal_view(goal_view)
	_apply_zoom()
	_show_trip_line()
	var p := walker.position()
	character.position = map.geo_to_local(p[0], p[1])
	character.walking = not walker.needs_data() and not walker.is_resting()
	var view_size := get_viewport_rect().size
	if trail_view.visible:
		camera.position = _history_center(view_size)
	elif goal_view:
		camera.position = _goal_center()
	else:
		camera.position = character.position
	if trail_view.visible:
		trail_view.show_history(stats.history, map)
	map.show_area(Rect2(camera.position - view_size / 2.0, view_size), _heading())
	if walker.is_traveling():
		hud.set_trip(walker.travel["to"]["name"])
	else:
		hud.set_street(walker.street_name(), walker.is_resting())
	hud.set_wait(walker.rest_left_s() if walker.is_resting() and not walker.is_traveling() else -1.0, walker.rest_fraction())
	_show_place()
	_show_status()
	_debug_timer += delta
	if hud.is_debug_open() and _debug_timer >= DEBUG_EVERY_S:
		_debug_timer = 0.0
		_refresh_debug()

	_save_timer += delta
	if _save_timer >= SAVE_EVERY_S:
		_save_timer = 0.0
		_save()


## His spot goes in the history and extends the trail.
func _track() -> void:
	var p := walker.position()
	stats.history.move_to(p[0], p[1])


## The map left showing above the history panel, between it and the top panel.
func _history_area(view_size: Vector2) -> Vector2:
	return Vector2(view_size.x, maxf(view_size.y / 2.0 - hud.top_height(), 1.0))


## Camera spot that puts the tapped entry, or the whole trail, mid-way in the map above the panel.
func _history_center(view_size: Vector2) -> Vector2:
	var at := history_focus
	if at.is_empty():
		var b: Array = stats.history.bounds()
		at = [(b[0] + b[2]) / 2.0, (b[1] + b[3]) / 2.0] if not b.is_empty() else walker.position()
	return map.geo_to_local(at[0], at[1]) + Vector2(0, view_size.y / 4.0 - hud.top_height() / 2.0)


## The map left showing below the top panel.
func _map_area(view_size: Vector2) -> Vector2:
	return Vector2(view_size.x, maxf(view_size.y - hud.top_height(), 1.0))


## [south, west, north, east] around him and his goal.
func _goal_box() -> Array:
	var p := walker.position()
	var g := _goal_view_of
	return [minf(p[0], g[0]), minf(p[1], g[1]), maxf(p[0], g[0]), maxf(p[1], g[1])]


## Camera spot that puts him and his goal mid-way in the map below the top panel.
func _goal_center() -> Vector2:
	var b := _goal_box()
	return map.geo_to_local((b[0] + b[2]) / 2.0, (b[1] + b[3]) / 2.0) - Vector2(0, hud.top_height() / 2.0)


## The player's zoom, far out to show a trip, fitting him and his goal, or fitting the trail while the history is open.
func _wanted_zoom() -> int:
	if trail_view and trail_view.visible:
		if not history_focus.is_empty():
			return maxi(player_zoom, HISTORY_SPOT_ZOOM)
		var b: Array = stats.history.bounds()
		if not b.is_empty():
			return MapView.zoom_to_fit_box(b, _history_area(get_viewport_rect().size), player_zoom)
		return player_zoom
	if walker and walker.is_traveling():
		var to: Dictionary = walker.travel["to"]
		return MapView.zoom_to_fit(walker.travel["from"], [to["lat"], to["lon"]], get_viewport_rect().size)
	if goal_view:
		return MapView.zoom_to_fit_box(_goal_box(), _map_area(get_viewport_rect().size), player_zoom)
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


## Where he is heading or resting: a line on the HUD and a pin on the map.
func _show_place() -> void:
	var at := _goal_target()
	place_pin.visible = not at.is_empty()
	if at.is_empty():
		hud.set_goal("")
		return
	place_pin.position = map.geo_to_local(at[0], at[1])
	var name: String = walker.place.get("name", "")
	if walker.is_resting():
		hud.set_goal(Hud.resting_text(name) if name != "" else "")
	else:
		var here := walker.position()
		hud.set_goal(Hud.goal_text(name, Geo.distance_m(here[0], here[1], at[0], at[1])))


## [lat, lon] of the place of note or random spot he is heading to or
## resting at, [] while he has none or travels to another city.
func _goal_target() -> Array:
	if walker.is_traveling():
		return []
	if not walker.place.is_empty():
		return [walker.place["lat"], walker.place["lon"]]
	return walker.goal


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
		"walker": walker.to_dict(), "stats": stats.to_dict(), "debug_log": debug_log.to_array(),
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
	stats = Stats.new()
	stats.load_dict(d.get("stats", {}))
	debug_log.load_array(d.get("debug_log", []))
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
	_learn_city(d["origin"][0], d["origin"][1])
	hud.show_game(city)
	return true


func _refresh_debug() -> void:
	hud.set_debug(debug_text())


## Everything known about the current city and how his last goals were
## picked, newest first, for the debug panel.
func debug_text() -> String:
	var out := ["City: " + city, "Country: " + country]
	if walker:
		var b := walker.bounds
		if b.size() == 4:
			out.append("City box: S %.4f, W %.4f, N %.4f, E %.4f (%.1f × %.1f km)" % [b[0], b[1], b[2], b[3],
				Geo.distance_m(b[0], b[1], b[0], b[3]) / 1000.0, Geo.distance_m(b[0], b[1], b[2], b[1]) / 1000.0])
		var here := walker.position()
		out.append("He is at %.5f, %.5f, %s" % [here[0], here[1], _doing_text()])
		var places := walker.graph.places_in(b) if b.size() == 4 else []
		var kinds := {}
		for p in places:
			kinds[p["class"]] = kinds.get(p["class"], 0) + 1
		var top := kinds.keys()
		top.sort_custom(func(x, y): return kinds[x] > kinds[y])
		out.append("Loaded: %d street cells, %d places in the city box%s" % [walker.graph.cells.size(), places.size(),
			" (" + ", ".join(top.slice(0, 6).map(func(k): return "%s %d" % [k, kinds[k]])) + ")" if not top.is_empty() else ""])
	out.append("Trivia from Wikidata: %d facts" % city_facts.size())
	for f in city_facts:
		out.append("  · " + f["name"])
	out.append("Trip dice each pick: %d%% country, %d%% city, else stay%s" % [
		Trips.COUNTRY_CHANCE * 100, Trips.CITY_CHANCE * 100, "; next pick skips the dice" if skip_roll else ""])
	out.append("")
	out.append("Goal picks, newest first:")
	var bias: int = Time.get_time_zone_from_system().get("bias", 0)
	for i in range(debug_log.entries.size() - 1, -1, -1):
		out.append("")
		out.append("\n".join(DebugLog.lines(debug_log.entries[i], bias)))
	if debug_log.entries.is_empty():
		out.append("None yet.")
	return "\n".join(out)


func _doing_text() -> String:
	if walker.is_traveling():
		return "travelling to %s, %.0f km left" % [walker.travel["to"]["name"], walker.travel["left_m"] / Walker.SPEED_MPS * Trips.TRAVEL_MPS / 1000.0]
	if walker.is_resting():
		return "staying %.0f s more at %s" % [walker.rest_left_s(), walker.place.get("name", "a spot")]
	var target := _goal_target()
	if target.is_empty():
		return "no goal yet"
	var here := walker.position()
	return "heading for %s %.0f m away (walked %.0f m of at most %.0f m)" % [
		walker.place.get("name", "a random spot"), Geo.distance_m(here[0], here[1], target[0], target[1]),
		walker.trip_m, Walker.trip_limit_m(walker.trip_start_m)]


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
		"place": walker.place.get("name", "") if walker else "",
		"goal_line": hud.place_label.text if hud.place_label.is_visible_in_tree() else "",
		"goal_view": goal_view,
		"sheet_open": hud.is_sheet_open(),
		"city_facts": city_facts.size(),
		"total_m": walker.total_m if walker else 0.0,
		"confirm_visible": hud.is_confirm_open(),
		"history_open": hud.is_history_open(),
		"debug_open": hud.is_debug_open(),
		"debug_picks": debug_log.entries.size(),
		"history_entries": stats.history.entries.size(),
		"trail_markers": trail_view.markers.size() if trail_view.visible else 0,
		"confirm_enabled": hud.is_confirm_enabled(),
		"overlaps": hud.overlapping_texts(),
		"rects": rects,
	}


func _publish_state() -> void:
	JavaScriptBridge.eval("window.osmwalkerState = %s;" % JSON.stringify(debug_state()), true)
