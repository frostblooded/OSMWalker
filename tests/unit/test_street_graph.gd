extends GutTest

const StreetGraph := preload("res://scripts/street_graph.gd")
const Geo := preload("res://scripts/geo.gd")
const Fixture := preload("res://tests/support/osm_fixture.gd")

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


func test_nodes_inside_loaded_cells_are_complete() -> void:
	assert_true(graph.is_complete(1))
	assert_false(graph.is_complete(999))


func test_only_cells_fully_inside_the_box_count_as_loaded() -> void:
	var g := StreetGraph.new()
	g.add_overpass(Fixture.data(), [41.9995, 22.999, 42.0005, 23.001])  # ~55 m around node 1
	assert_true(g.cells.is_empty())
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


func test_covers_needs_every_cell_in_reach() -> void:
	assert_true(graph.covers(42.0, 23.0, 300.0))
	assert_false(graph.covers(42.0, 23.0, 5000.0))
	assert_false(graph.covers(43.0, 23.0, 0.0))


func test_neighbouring_cells_add_up() -> void:
	# Two separate downloads side by side cover a point on their shared edge.
	var g := StreetGraph.new()
	var a := StreetGraph.cell_of(42.0, 23.0)
	var b := a + Vector2i(1, 0)
	var compact := StreetGraph.compact_cells(Fixture.data(), [a, b])
	var box: Array = Geo.tile_bbox(a, StreetGraph.CELL_ZOOM)
	var lat: float = (box[0] + box[2]) / 2.0
	var lon: float = box[3]  # the edge a shares with b
	g.add_cell(a, compact[a])
	assert_false(g.covers(lat, lon, 50.0))
	g.add_cell(b, compact[b])
	assert_true(g.covers(lat, lon, 50.0))


func test_compact_cells_keeps_ways_touching_each_cell() -> void:
	var home := StreetGraph.cell_of(42.0, 23.0)
	var far := home + Vector2i(5, 5)
	var compact := StreetGraph.compact_cells(Fixture.data(), [home, far])
	assert_eq((compact[home]["ways"] as Array).size(), 2)
	assert_eq((compact[far]["ways"] as Array).size(), 0)
	var g := StreetGraph.new()
	g.add_cell(home, compact[home])
	assert_eq(g.neighbors(1).size(), 4)
	assert_eq(g.edge_name(1, 2), "Main St")


func test_compact_cell_survives_bytes_round_trip() -> void:
	var home := StreetGraph.cell_of(42.0, 23.0)
	var compact: Dictionary = StreetGraph.compact_cells(Fixture.data(), [home])[home]
	var back: Dictionary = bytes_to_var(var_to_bytes(compact))
	var g := StreetGraph.new()
	g.add_cell(home, back)
	assert_eq(g.nodes.size(), 5)
	assert_eq(g.edge_name(1, 2), "Main St")


func test_cells_by_priority_puts_his_own_cell_first() -> void:
	var cells := StreetGraph.cells_by_priority(42.0, 23.0, 2)
	assert_eq(cells.size(), 25)
	assert_eq(cells[0], StreetGraph.cell_of(42.0, 23.0))


func test_cells_by_priority_prefers_cells_ahead() -> void:
	var home := StreetGraph.cell_of(42.0, 23.0)
	var east := StreetGraph.cells_by_priority(42.0, 23.0, 1, Vector2(1, 0))
	var west := StreetGraph.cells_by_priority(42.0, 23.0, 1, Vector2(-1, 0))
	var e := home + Vector2i(1, 0)
	var w := home + Vector2i(-1, 0)
	assert_eq(east[0], home)
	assert_lt(east.find(e), east.find(w))
	assert_lt(west.find(w), west.find(e))


func test_node_on_a_cell_edge_waits_for_both_cells() -> void:
	# Tile streets are cut exactly at the edge; that point links into both cells.
	var c := StreetGraph.cell_of(42.0, 23.0)
	var edge_lon: float = Geo.tile_bbox(c, StreetGraph.CELL_ZOOM)[3]
	var g := StreetGraph.new()
	g.add_cell(c, {"ids": PackedInt64Array([7, 8]), "coords": PackedFloat64Array([42.0, edge_lon - 0.001, 42.0, edge_lon]), "ways": [["", PackedInt64Array([7, 8])]]})
	assert_true(g.is_complete(7))
	assert_false(g.is_complete(8), "its east side isn't loaded yet")
	g.cells[c + Vector2i(1, 0)] = true
	assert_true(g.is_complete(8))
