## Places of note (shops, cafes, sights...) from the tiles' POI layer, and
## walking to them.
extends GutTest

const VectorTile := preload("res://scripts/vector_tile.gd")
const OfmStreets := preload("res://scripts/ofm_streets.gd")
const StreetGraph := preload("res://scripts/street_graph.gd")
const StreetLoader := preload("res://scripts/street_loader.gd")
const DiskCache := preload("res://scripts/disk_cache.gd")
const FakeOsmApi := preload("res://tests/support/fake_osm_api.gd")
const Walker := preload("res://scripts/walker.gd")
const Hud := preload("res://scripts/hud.gd")
const Fixture := preload("res://tests/support/osm_fixture.gd")
const Geo := preload("res://scripts/geo.gd")

const TILE := Vector2i(9253, 6039)
const DIR := "user://test_places_cache/"


static func _poi(tags: Dictionary, x: int, y: int) -> Dictionary:
	return {"tags": tags, "points": PackedInt32Array([x, y])}


static func _layers(pois: Array) -> Dictionary:
	return {"poi": {"extent": 4096, "features": pois}}


static func _place(name: String, lat: float, lon: float, rank := 1) -> Dictionary:
	return {"name": name, "class": "cafe", "subclass": "cafe", "rank": rank, "lat": lat, "lon": lon}


func after_all() -> void:
	DiskCache.new(DIR).clear()


func test_points_come_from_move_to_commands() -> void:
	# MoveTo with 2 points: (10, 20), then (10+5, 20-3).
	var geom := PackedInt32Array([(2 << 3) | 1, 20, 40, 10, 5])
	assert_eq(VectorTile._points(geom), PackedInt32Array([10, 20, 15, 17]))


func test_named_pois_become_places() -> void:
	var data := OfmStreets.from_layers(_layers([
		_poi({"name": "Cafe Bar", "class": "cafe", "subclass": "cafe", "rank": 3}, 2048, 1024),
	]), TILE)
	var places: Array = data["places"]
	assert_eq(places.size(), 1)
	var p: Dictionary = places[0]
	assert_eq(p["name"], "Cafe Bar")
	assert_eq(p["class"], "cafe")
	assert_eq(p["subclass"], "cafe")
	assert_eq(p["rank"], 3)
	assert_almost_eq(p["lat"], Geo.px_to_lat(TILE.y * 4096 + 1024, 18), 1e-9)
	assert_almost_eq(p["lon"], Geo.px_to_lon(TILE.x * 4096 + 2048, 18), 1e-9)


func test_skips_unnamed_pois_stops_and_points_outside_the_tile() -> void:
	var data := OfmStreets.from_layers(_layers([
		_poi({"class": "cafe", "subclass": "cafe"}, 100, 100),
		_poi({"name": "Main St", "class": "bus", "subclass": "bus_stop"}, 100, 100),
		_poi({"name": "Metro", "class": "entrance", "subclass": "subway_entrance"}, 100, 100),
		_poi({"name": "Next door", "class": "shop", "subclass": "bakery"}, -20, 100),
	]), TILE)
	assert_eq(data["places"], [])


func test_cells_keep_their_places() -> void:
	var home := StreetGraph.cell_of(42.0, 23.0)
	var data := Fixture.data()
	data["places"] = [_place("Here", 42.0001, 23.0001), _place("Far", 43.0, 24.0)]
	var compact := StreetGraph.compact_cells(data, [home])
	var back: Dictionary = bytes_to_var(var_to_bytes(compact[home]))
	var g := StreetGraph.new()
	g.add_cell(home, back)
	assert_eq(g.places_in([41.9, 22.9, 42.1, 23.1]).map(func(p): return p["name"]), ["Here"])
	assert_eq(g.places_in([42.5, 23.5, 43.5, 24.5]), [])


func test_important_places_weigh_more() -> void:
	assert_almost_eq(Walker.rank_weight(_place("Landmark", 42.0, 23.0, 1)), 1.0, 1e-6)
	assert_almost_eq(Walker.rank_weight(_place("Corner shop", 42.0, 23.0, 9)), 1.0 / 9.0, 1e-6)
	assert_almost_eq(Walker.rank_weight(_place("No rank", 42.0, 23.0, 0)), 1.0, 1e-6)


func _walker_with_places(places: Array) -> Walker:
	var g := StreetGraph.new()
	g.add_overpass(Fixture.data(), Fixture.BBOX)
	g.places[StreetGraph.cell_of(42.0, 23.0)] = places
	var w := Walker.new(g)
	w.rng.seed = 1
	w.bounds = [41.995, 22.995, 42.005, 23.005]
	w.start_at(2)
	return w


func test_walks_to_a_place_and_rests_there() -> void:
	var w := _walker_with_places([_place("Cafe East", 42.0, 23.00135)])
	w.pick_goal()
	assert_eq(w.place["name"], "Cafe East")
	assert_eq(w.goal, [42.0, 23.00135])
	w.advance(w.graph.edge_length(2, 1) + w.graph.edge_length(1, 3))
	assert_true(w.is_resting())
	assert_eq(w.place["name"], "Cafe East", "still there while resting")


func test_always_heads_for_a_place_when_one_is_loaded() -> void:
	var w := _walker_with_places([_place("Cafe East", 42.0, 23.00135)])
	for s in 20:
		w.rng.seed = s
		w.pick_goal()
		assert_eq(w.place.get("name", ""), "Cafe East")


func test_no_places_loaded_falls_back_to_a_random_spot() -> void:
	var w := _walker_with_places([])
	w.place = _place("Old", 0.0, 0.0)
	w.pick_goal()
	assert_eq(w.place, {})
	assert_eq(w.goal.size(), 2)


func test_does_not_pick_the_place_he_is_at() -> void:
	var w := _walker_with_places([_place("Here", 42.001, 23.0), _place("Cafe East", 42.0, 23.00135, 50)])
	for s in 20:
		w.rng.seed = s
		w.pick_goal()
		assert_eq(w.place["name"], "Cafe East")


func test_place_survives_save_and_load() -> void:
	var w := _walker_with_places([_place("Cafe East", 42.0, 23.00135)])
	w.pick_goal()
	var restored := Walker.new()
	restored.load_dict(JSON.parse_string(JSON.stringify(w.to_dict())))
	assert_eq(restored.place["name"], "Cafe East")


func test_old_cached_cells_without_places_get_refreshed() -> void:
	DiskCache.new(DIR).clear()
	var home := StreetGraph.cell_of(42.0, 23.0)
	var compact: Dictionary = StreetGraph.compact_cells(Fixture.data(), [home])[home]
	compact.erase("places")
	DiskCache.new(DIR).put(StreetLoader.cache_name(home), var_to_bytes(compact))
	var api: FakeOsmApi = FakeOsmApi.new()
	add_child_autofree(api)
	var l := StreetLoader.new()
	l.api = api
	l.graph = StreetGraph.new()
	l.cache = DiskCache.new(DIR)
	add_child_autofree(l)
	l.request([home])
	assert_true(l.graph.cells.has(home), "streets show at once")
	assert_eq(api.street_requests.size(), 1, "and are fetched again for their places")


func test_hud_names_the_place() -> void:
	var hud: Hud = autofree(Hud.new())
	add_child(hud)
	hud.set_goal(Hud.goal_text("Cafe Bar", 500.0))
	assert_eq(hud.place_label.text, "Going to Cafe Bar · 500 m")
	assert_true(hud.place_label.visible)
	hud.set_goal(Hud.resting_text("Cafe Bar"))
	assert_eq(hud.place_label.text, "Resting at Cafe Bar")
	hud.set_goal("")
	assert_false(hud.place_label.visible)
