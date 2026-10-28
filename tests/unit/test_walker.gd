extends GutTest

const Walker := preload("res://scripts/walker.gd")
const StreetGraph := preload("res://scripts/street_graph.gd")
const Fixture := preload("res://tests/support/osm_fixture.gd")
const Trips := preload("res://scripts/trips.gd")
const Geo := preload("res://scripts/geo.gd")

var graph: StreetGraph
var walker: Walker


func before_each() -> void:
	graph = StreetGraph.new()
	graph.add_overpass(Fixture.data(), Fixture.BBOX)
	walker = Walker.new(graph)
	walker.rng.seed = 1


func test_speed_is_200_meters_per_minute() -> void:
	assert_almost_eq(Walker.SPEED_MPS * 60.0, 200.0, 0.0001)


func test_walks_partway_along_the_street() -> void:
	walker.start_at(2)
	assert_eq(walker.advance(50.0), 0.0)
	assert_eq(walker.to_node, 1)
	assert_almost_eq(walker.progress_m, 50.0, 0.0001)
	assert_almost_eq(walker.total_m, 50.0, 0.0001)
	assert_eq(walker.street_name(), "Main St")


func test_position_is_interpolated() -> void:
	walker.start_at(2)
	walker.advance(graph.edge_length(2, 1) / 2.0)
	var p := walker.position()
	assert_almost_eq(p[0], 42.0005, 1e-6)
	assert_almost_eq(p[1], 23.0, 1e-9)


func test_heads_for_the_goal_by_the_shortest_route() -> void:
	walker.start_at(2)
	walker.set_goal(42.0, 23.00135)  # node 3
	walker.advance(graph.edge_length(2, 1) + 1.0)
	assert_eq(walker.from_node, 1)
	assert_eq(walker.to_node, 3)


## Heads for a place of note at node 3: only places make him stop.
func _head_for_cafe() -> void:
	walker.set_goal(42.0, 23.00135)
	walker.place = {"name": "Cafe East", "class": "cafe", "subclass": "cafe", "rank": 1, "lat": 42.0, "lon": 23.00135}


func test_rests_a_minute_on_arrival() -> void:
	walker.start_at(2)
	_head_for_cafe()
	var trip := graph.edge_length(2, 1) + graph.edge_length(1, 3)
	walker.advance(trip)
	assert_eq(walker.from_node, 3)
	assert_true(walker.is_resting())
	assert_almost_eq(Walker.REST_M, 200.0, 0.001)
	walker.advance(Walker.REST_M - 1.0)
	assert_true(walker.is_resting())
	assert_eq(walker.from_node, 3)
	assert_eq(walker.to_node, -1)
	assert_almost_eq(walker.total_m, trip, 0.001)


func test_picks_a_new_goal_inside_the_city_after_resting() -> void:
	walker.bounds = [41.995, 22.995, 42.005, 23.005]
	walker.start_at(2)
	_head_for_cafe()
	walker.advance(graph.edge_length(2, 1) + graph.edge_length(1, 3) + Walker.REST_M + 1.0)
	assert_false(walker.is_resting())
	assert_ne(walker.goal, [42.0, 23.00135])
	assert_between(walker.goal[0], 41.995, 42.005)
	assert_between(walker.goal[1], 22.995, 23.005)


func test_random_goals_cover_the_city() -> void:
	walker.bounds = [41.0, 22.0, 43.0, 24.0]
	var north := 0
	for s in range(100):
		walker.rng.seed = s
		walker.pick_goal()
		assert_between(walker.goal[0], 41.0, 43.0)
		assert_between(walker.goal[1], 22.0, 24.0)
		if walker.goal[0] > 42.0:
			north += 1
	assert_between(north, 30, 70)


func test_unreachable_place_ends_at_the_closest_street() -> void:
	walker.start_at(4)
	walker.set_goal(42.05, 23.0)  # far north, no streets lead there
	walker.place = {"name": "Island", "class": "cafe", "subclass": "cafe", "rank": 1, "lat": 42.05, "lon": 23.0}
	walker.advance(graph.edge_length(4, 1) + graph.edge_length(1, 2))
	assert_eq(walker.from_node, 2)
	assert_true(walker.is_resting())


func test_walks_to_the_edge_of_loaded_streets_towards_a_far_goal() -> void:
	var g := _long_street(10)
	var w := Walker.new(g)
	w.start_at(0)
	w.set_goal(42.0, 23.2)
	w.advance(100000.0)
	assert_true(w.needs_data(), "waits where the loaded streets end")
	var p: Array = g.nodes[w.from_node]
	assert_gt(p[1], 23.0)
	assert_false(w.is_resting())


func test_gives_up_on_a_trip_that_drags_on() -> void:
	walker.start_at(1)
	walker.set_goal(42.0, 23.00135)
	walker.place = {"name": "Far", "class": "cafe", "subclass": "cafe", "rank": 1, "lat": 42.0, "lon": 23.00135}
	walker.trip_m = Walker.trip_limit_m(walker.trip_start_m) + 1.0
	walker.advance(1.0)
	assert_false(walker.is_resting(), "giving up is not a stop")
	assert_ne(walker.goal, [42.0, 23.00135])


func test_walks_past_a_random_spot_without_stopping() -> void:
	walker.bounds = [41.995, 22.995, 42.005, 23.005]
	walker.start_at(2)
	walker.set_goal(42.0, 23.00135)
	var fired := []
	walker.arrived.connect(func(p): fired.append(p))
	walker.advance(graph.edge_length(2, 1) + graph.edge_length(1, 3) + 1.0)
	assert_false(walker.is_resting())
	assert_eq(fired, [])
	assert_ne(walker.goal, [42.0, 23.00135], "already heading somewhere new")


func test_random_spots_he_cannot_get_closer_to_do_not_hang() -> void:
	walker.bounds = [43.0, 24.0, 43.1, 24.1]  # far off, node 5 or so is always closest
	walker.start_at(1)
	walker.advance(5000.0)
	assert_false(walker.is_resting())


func test_no_stop_lasts_more_than_a_minute() -> void:
	walker.start_at(3)
	walker.rest_for(15.0)
	assert_almost_eq(walker.rest_m, Walker.REST_M, 0.001)


func test_rest_countdown() -> void:
	walker.start_at(2)
	_head_for_cafe()
	walker.advance(graph.edge_length(2, 1) + graph.edge_length(1, 3) + Walker.REST_M / 4.0)
	assert_almost_eq(walker.rest_left_s(), 45.0, 0.01)
	assert_almost_eq(walker.rest_fraction(), 0.25, 0.001)


func test_old_save_with_a_long_rest_is_cut_to_a_minute() -> void:
	walker.start_at(3)
	var d := walker.to_dict()
	d["rest_m"] = 3000.0
	var restored := Walker.new()
	restored.load_dict(d)
	assert_almost_eq(restored.rest_m, Walker.REST_M, 0.001)
	assert_almost_eq(restored.rest_fraction(), 0.0, 0.001)


## East-west street of `n` nodes 500 m apart from (42.0, 23.0), only the first
## couple of kilometers loaded.
func _long_street(n: int) -> StreetGraph:
	var g := StreetGraph.new()
	for i in n:
		g.nodes[i] = [42.0, 23.0 + i * 0.00604]
		if i > 0:
			g._link(i - 1, i)
	for i in 4:
		var p: Array = g.nodes[i]
		g.cells[StreetGraph.cell_of(p[0], p[1])] = true
	return g


func test_turns_around_at_a_dead_end() -> void:
	walker.start_at(1)
	walker.set_goal(42.0, 23.00135)  # node 3
	walker.prev_node = 3
	walker.to_node = 5
	walker.advance(graph.edge_length(1, 5) + 10.0)
	assert_eq(walker.from_node, 5)
	assert_eq(walker.to_node, 1)
	assert_almost_eq(walker.progress_m, 10.0, 0.0001)


func test_long_walk_keeps_total_distance() -> void:
	walker.bounds = [41.995, 22.995, 42.005, 23.005]
	walker.start_at(1)
	assert_eq(walker.advance(5000.0), 0.0)
	assert_almost_eq(walker.total_m + walker.rested_m, 5000.0, 0.001)
	assert_gt(walker.total_m, 0.0)


func test_waits_for_map_data_near_unloaded_area() -> void:
	var g := StreetGraph.new()
	g.add_overpass(Fixture.data(), [41.9995, 22.999, 42.0005, 23.001])
	var w := Walker.new(g)
	w.start_at(1)
	assert_true(w.needs_data())
	assert_eq(w.advance(100.0), 100.0)
	assert_eq(w.total_m, 0.0)


func test_resumes_after_map_data_arrives() -> void:
	var g := StreetGraph.new()
	g.add_overpass(Fixture.data(), [41.9995, 22.999, 42.0005, 23.001])
	var w := Walker.new(g)
	w.start_at(1)
	var left := w.advance(100.0)
	g.add_overpass(Fixture.data(), Fixture.BBOX)
	assert_eq(w.advance(left), 0.0)
	assert_almost_eq(w.total_m, 100.0, 0.001)


func test_save_and_restore_into_empty_graph() -> void:
	walker.bounds = [41.995, 22.995, 42.005, 23.005]
	walker.start_at(2)
	walker.set_goal(42.0, 23.00135)
	walker.advance(30.0)
	var saved: Dictionary = JSON.parse_string(JSON.stringify(walker.to_dict()))
	var restored := Walker.new()
	restored.load_dict(saved)
	assert_eq(restored.from_node, 2)
	assert_eq(restored.to_node, 1)
	assert_almost_eq(restored.total_m, 30.0, 0.0001)
	assert_eq(restored.goal, [42.0, 23.00135])
	assert_eq(restored.bounds, walker.bounds)
	assert_eq(restored.route, walker.route)
	var a := walker.position()
	var b := restored.position()
	assert_almost_eq(b[0], a[0], 1e-9)
	assert_almost_eq(b[1], a[1], 1e-9)
	# Finishes the current street, then waits for the map to load.
	restored.advance(500.0)
	assert_eq(restored.from_node, 1)
	assert_true(restored.needs_data())


func test_isolated_node_hops_to_nearest_street() -> void:
	graph.nodes[77] = [42.00001, 23.00001]
	walker.start_at(77)
	walker.advance(10.0)
	assert_ne(walker.from_node, 77)
	assert_almost_eq(walker.total_m, 10.0, 0.0001)


func test_save_keeps_the_rest() -> void:
	walker.start_at(3)
	_head_for_cafe()
	walker.advance(50.0)
	var restored := Walker.new()
	restored.load_dict(JSON.parse_string(JSON.stringify(walker.to_dict())))
	assert_true(restored.is_resting())
	assert_almost_eq(restored.rest_m, Walker.REST_M - 50.0, 0.001)


func test_city_bounds_come_from_the_search_box() -> void:
	assert_eq(Walker.city_bounds(42.0, 23.0, [41.9, 22.9, 42.1, 23.1]), [41.9, 22.9, 42.1, 23.1])


func test_tiny_or_missing_city_box_grows_to_a_walkable_area() -> void:
	for box in [[], [42.0, 23.0, 42.0, 23.0]]:
		var b := Walker.city_bounds(42.0, 23.0, box)
		assert_almost_eq(b[2] - b[0], 2.0 * rad_to_deg(Walker.MIN_CITY_RADIUS_M / 6371008.8), 1e-4)
		assert_true(b[0] < 42.0 and b[2] > 42.0 and b[1] < 23.0 and b[3] > 23.0)


func test_huge_city_box_is_capped() -> void:
	var b := Walker.city_bounds(42.0, 23.0, [30.0, 10.0, 50.0, 40.0])
	assert_almost_eq(b[2] - b[0], 2.0 * rad_to_deg(Walker.MAX_CITY_RADIUS_M / 6371008.8), 1e-4)


const TRIP := {"name": "Fartown", "code": "XXX", "country": "X-land", "lat": 43.0, "lon": 24.0,
	"pop": 50000, "bounds": [42.99, 23.99, 43.01, 24.01]}


func test_trip_planner_can_send_him_away_instead_of_to_a_goal() -> void:
	var asked := [0]
	walker.trip_planner = func(): asked[0] += 1; return TRIP
	walker.start_at(2)
	walker.advance(10.0)
	assert_eq(asked[0], 1)
	assert_true(walker.is_traveling())
	assert_eq(walker.goal, [])
	assert_false(walker.needs_data())


func test_no_trip_keeps_him_walking_to_a_goal() -> void:
	walker.trip_planner = func(): return {}
	walker.start_at(2)
	walker.advance(10.0)
	assert_false(walker.is_traveling())
	assert_eq(walker.goal.size(), 2)


func test_travel_uses_up_walking_time_along_a_straight_line() -> void:
	walker.start_at(2)
	walker.start_travel(TRIP)
	var trip_m: float = walker.travel["total_m"]
	assert_almost_eq(trip_m, Trips.travel_s(Geo.distance_m(42.0, 23.0, 43.0, 24.0)) * Walker.SPEED_MPS, 1.0)
	var total := walker.total_m
	assert_eq(walker.advance(trip_m / 2.0), 0.0)
	assert_true(walker.is_traveling())
	assert_eq(walker.total_m, total, "travel is not walking")
	var p := walker.position()
	assert_between(p[0], 42.4, 42.6)
	assert_almost_eq(p[1], 23.5, 0.001)
	assert_eq(walker.street_name(), "")


func test_arriving_starts_him_in_the_new_city_waiting_for_streets() -> void:
	walker.start_at(2)
	walker.start_travel(TRIP)
	watch_signals(walker)
	walker.advance(walker.travel["total_m"] + 50.0)
	assert_signal_emitted_with_parameters(walker, "landed", [TRIP])
	assert_false(walker.is_traveling())
	assert_ne(walker.graph, graph, "a fresh street graph for the new city")
	assert_eq(walker.position(), [43.0, 24.0])
	assert_eq(walker.bounds, [42.99, 23.99, 43.01, 24.01])
	assert_true(walker.needs_data())


func test_travel_survives_save_and_load() -> void:
	walker.start_at(2)
	walker.start_travel(TRIP)
	walker.advance(1000.0)
	var d: Dictionary = JSON.parse_string(JSON.stringify(walker.to_dict()))
	var again := Walker.new()
	again.load_dict(d)
	assert_true(again.is_traveling())
	assert_eq(again.position(), walker.position())
	assert_eq(again.travel["to"]["name"], "Fartown")


func test_tells_how_a_place_was_picked() -> void:
	var picks := []
	walker.picked.connect(func(info): picks.append(info))
	walker.start_at(2)
	walker.bounds = [41.99, 22.99, 42.01, 23.01]
	graph.places[StreetGraph.cell_of(42.0, 23.0)] = [
		{"name": "Cafe East", "class": "cafe", "subclass": "cafe", "rank": 1, "lat": 42.0, "lon": 23.00135},
		{"name": "Here", "class": "cafe", "subclass": "cafe", "rank": 1, "lat": graph.nodes[2][0], "lon": graph.nodes[2][1]}]
	walker.pick_goal()
	assert_eq(picks.size(), 1)
	var info: Dictionary = picks[0]
	assert_eq(info["place"], "Cafe East")
	assert_eq(info["in_box"], 2)
	assert_eq(info["too_close"], 1)
	assert_almost_eq(info["total_weight"], info["weight"], 1e-6)  # the only option
	assert_almost_eq(info["dist_w"], Walker.distance_weight(info["dist_m"]), 1e-6)
	assert_eq(info["heading_w"], 1.0)  # no leg walked yet
	assert_true(info.has("r"))


func test_places_weigh_by_rank_alone_before_he_stands_anywhere() -> void:
	walker.bounds = [41.99, 22.99, 42.01, 23.01]
	graph.places[StreetGraph.cell_of(42.0, 23.0)] = [
		{"name": "Cafe East", "class": "cafe", "subclass": "cafe", "rank": 2, "lat": 42.0, "lon": 23.00135}]
	assert_eq(walker.weigh(graph.places[StreetGraph.cell_of(42.0, 23.0)][0])["weight"], 0.5)


func test_tells_why_a_random_spot_was_picked() -> void:
	var picks := []
	walker.picked.connect(func(info): picks.append(info))
	walker.start_at(2)
	walker.bounds = [41.99, 22.99, 42.01, 23.01]
	walker.pick_goal()
	assert_eq(picks[0]["fallback"], "no places loaded in the city box yet")
	assert_eq(picks[0]["spot"], walker.goal)
	graph.places[StreetGraph.cell_of(42.0, 23.0)] = [
		{"name": "Here", "class": "cafe", "subclass": "cafe", "rank": 1, "lat": graph.nodes[2][0], "lon": graph.nodes[2][1]}]
	walker.pick_goal()
	assert_eq(picks[1]["fallback"], "every loaded place is within 30 m of him")


func test_tells_about_a_trip() -> void:
	var picks := []
	walker.picked.connect(func(info): picks.append(info))
	walker.start_at(2)
	walker.trip_planner = func(): return {"name": "Far", "country": "Farland", "lat": 43.0, "lon": 24.0}
	walker.pick_goal()
	assert_eq(picks[0]["trip"], "Far, Farland")


func test_a_forced_new_goal_ends_his_rest() -> void:
	walker.start_at(2)
	walker.bounds = [41.99, 22.99, 42.01, 23.01]
	walker.rest_for(1.0)
	walker.force_new_goal()
	assert_false(walker.is_resting())
	assert_eq(walker.goal.size(), 2)


func test_a_forced_new_goal_lands_a_trip_first() -> void:
	var landed := []
	walker.landed.connect(func(c): landed.append(c))
	walker.start_at(2)
	walker.start_travel({"name": "Far", "country": "Farland", "lat": 43.0, "lon": 24.0})
	walker.force_new_goal()
	assert_false(walker.is_traveling())
	assert_eq(landed.size(), 1)
	assert_eq(walker.goal.size(), 2)


func test_land_now_ends_the_trip_at_once() -> void:
	walker.start_at(2)
	walker.start_travel({"name": "Far", "country": "Farland", "lat": 43.0, "lon": 24.0})
	walker.land_now()
	assert_false(walker.is_traveling())
	assert_eq(walker.position(), [43.0, 24.0])
