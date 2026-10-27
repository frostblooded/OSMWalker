extends GutTest

const Walker := preload("res://scripts/walker.gd")
const StreetGraph := preload("res://scripts/street_graph.gd")
const Fixture := preload("res://tests/unit/osm_fixture.gd")

var graph: StreetGraph
var walker: Walker


func before_each() -> void:
	graph = StreetGraph.new()
	graph.add_overpass(Fixture.data(), Fixture.BBOX)
	walker = Walker.new(graph)
	walker.rng.seed = 1


func test_speed_is_200_meters_per_minute() -> void:
	assert_almost_eq(Walker.meters_for_elapsed(60.0), 200.0, 0.0001)


func test_catch_up_is_capped_at_24_hours() -> void:
	assert_almost_eq(Walker.meters_for_elapsed(3 * 86400.0), 288000.0, 0.01)
	assert_eq(Walker.meters_for_elapsed(-50.0), 0.0)


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


func test_never_goes_straight_back_at_an_intersection() -> void:
	for s in range(50):
		walker.rng.seed = s
		walker.start_at(2)
		walker.advance(graph.edge_length(2, 1) + 1.0)
		assert_eq(walker.from_node, 1)
		assert_ne(walker.to_node, 2, "seed %d went back the way it came" % s)


func test_picks_every_direction_at_random() -> void:
	var seen := {}
	for s in range(100):
		walker.rng.seed = s
		walker.start_at(2)
		walker.advance(graph.edge_length(2, 1) + 1.0)
		seen[walker.to_node] = true
	assert_eq(seen.keys().size(), 3)


func test_turns_around_at_a_dead_end() -> void:
	walker.start_at(1)
	walker.prev_node = 3
	walker.to_node = 5
	walker.advance(graph.edge_length(1, 5) + 10.0)
	assert_eq(walker.from_node, 5)
	assert_eq(walker.to_node, 1)
	assert_almost_eq(walker.progress_m, 10.0, 0.0001)


func test_long_walk_keeps_total_distance() -> void:
	walker.start_at(1)
	assert_eq(walker.advance(5000.0), 0.0)
	assert_almost_eq(walker.total_m, 5000.0, 0.001)


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
	walker.start_at(2)
	walker.advance(30.0)
	var saved: Dictionary = JSON.parse_string(JSON.stringify(walker.to_dict()))
	var restored := Walker.new()
	restored.load_dict(saved)
	assert_eq(restored.from_node, 2)
	assert_eq(restored.to_node, 1)
	assert_almost_eq(restored.total_m, 30.0, 0.0001)
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
