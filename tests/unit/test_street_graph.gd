extends GutTest

const StreetGraph := preload("res://scripts/street_graph.gd")
const Fixture := preload("res://tests/unit/osm_fixture.gd")

var graph: StreetGraph


func before_each() -> void:
	graph = StreetGraph.new()
	graph.add_overpass(Fixture.data(), Fixture.BBOX)


func test_parses_nodes_and_links() -> void:
	assert_eq(graph.nodes.size(), 5)
	assert_eq(graph.neighbors(1).size(), 4)
	assert_eq(graph.neighbors(5), [1])


func test_edge_names() -> void:
	assert_eq(graph.edge_name(1, 2), "Main St")
	assert_eq(graph.edge_name(2, 1), "Main St")
	assert_eq(graph.edge_name(1, 3), "")


func test_edge_length() -> void:
	assert_almost_eq(graph.edge_length(1, 2), 111.2, 0.5)


func test_nodes_inside_loaded_area_are_complete() -> void:
	assert_true(graph.is_complete(1))
	assert_false(graph.is_complete(999))


func test_nodes_near_the_edge_of_loaded_area_are_not_complete() -> void:
	var g := StreetGraph.new()
	g.add_overpass(Fixture.data(), [41.9995, 22.999, 42.0005, 23.001])  # ~55 m around node 1
	assert_false(g.is_complete(1))


func test_merging_overlapping_downloads_does_not_duplicate() -> void:
	graph.add_overpass(Fixture.data(), Fixture.BBOX)
	assert_eq(graph.nodes.size(), 5)
	assert_eq(graph.neighbors(1).size(), 4)


func test_nearest_node() -> void:
	assert_eq(graph.nearest_node(42.0009, 23.0), 2)
	assert_eq(graph.nearest_node(42.00001, 23.00001), 1)


func test_nearest_node_on_empty_graph() -> void:
	assert_eq(StreetGraph.new().nearest_node(42.0, 23.0), -1)
