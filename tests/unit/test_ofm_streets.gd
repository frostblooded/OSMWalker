## Streets from OpenFreeMap vector tiles.
extends GutTest

const VectorTile := preload("res://scripts/vector_tile.gd")
const OfmStreets := preload("res://scripts/ofm_streets.gd")
const StreetGraph := preload("res://scripts/street_graph.gd")
const Geo := preload("res://scripts/geo.gd")

## Real tiles from Sofia (only the two street layers kept), side by side.
const WEST := Vector2i(9253, 6039)
const EAST := Vector2i(9254, 6039)


static func _pbf(tile: Vector2i) -> PackedByteArray:
	return FileAccess.get_file_as_bytes("res://tests/fixtures/ofm/14_%d_%d.pbf" % [tile.x, tile.y])


static func _layers(street: Dictionary, names := []) -> Dictionary:
	return {
		"transportation": {"extent": 4096, "features": [street]},
		"transportation_name": {"extent": 4096, "features": names},
	}


static func _ways(data: Dictionary) -> Array:
	return data["elements"].filter(func(e): return e["type"] == "way")


static func _nodes(data: Dictionary) -> Dictionary:
	var out := {}
	for e in data["elements"]:
		if e["type"] == "node":
			out[e["id"]] = e
	return out


func test_decodes_line_features_and_tags() -> void:
	var d := VectorTile.decode(_pbf(WEST), ["transportation"])
	assert_eq(d.keys(), ["transportation"])
	assert_eq(d["transportation"]["extent"], 4096)
	var f: Dictionary = d["transportation"]["features"][0]
	assert_true(f["tags"].has("class"))
	assert_gte(f["lines"][0].size(), 4)


func test_keeps_walkable_streets_only() -> void:
	var line := [PackedInt32Array([100, 100, 200, 100])]
	for c in [["minor", null], ["path", "footway"], ["primary", null]]:
		var data := OfmStreets.from_layers(_layers({"tags": {"class": c[0], "subclass": c[1]}, "lines": line}), WEST)
		assert_eq(_ways(data).size(), 1, str(c))
	for c in [["motorway", null], ["transit", "subway"], ["path", "platform"], ["busway", null]]:
		var data := OfmStreets.from_layers(_layers({"tags": {"class": c[0], "subclass": c[1]}, "lines": line}), WEST)
		assert_eq(_ways(data).size(), 0, str(c))


func test_same_point_gets_same_id_in_both_tiles() -> void:
	# A point at x=4090 in the west tile is x=-6 in the east tile's buffer.
	var line := {"tags": {"class": "minor"}, "lines": [PackedInt32Array([4000, 500, 4090, 600])]}
	var west := OfmStreets.from_layers(_layers(line), WEST)
	var id := OfmStreets.node_id(WEST.x * 4096 + 4090, WEST.y * 4096 + 600)
	assert_true(_nodes(west).has(id))
	assert_eq(OfmStreets.node_id(EAST.x * 4096 - 6, EAST.y * 4096 + 600), id)


func test_street_crossing_the_edge_meets_in_the_middle() -> void:
	# One street seen by both tiles: each clips it where its own buffer ends.
	var west := OfmStreets.from_layers(_layers({"tags": {"class": "minor"}, "lines": [PackedInt32Array([3900, 1000, 4160, 1131])]}), WEST)
	var east := OfmStreets.from_layers(_layers({"tags": {"class": "minor"}, "lines": [PackedInt32Array([-64, 1067, 300, 1250])]}), EAST)
	var w_ids: Array = _ways(west)[0]["nodes"]
	var e_ids: Array = _ways(east)[0]["nodes"]
	assert_eq(w_ids.size(), 2)
	assert_eq(e_ids.size(), 2)
	assert_eq(w_ids[-1], e_ids[0], "both tiles cut it at the same edge point")
	var cut: Dictionary = _nodes(west)[w_ids[-1]]
	assert_almost_eq(cut["lon"], Geo.tile_bbox(WEST, 14)[3], 1e-9, "on the shared edge")


func test_parts_outside_the_tile_are_dropped() -> void:
	var data := OfmStreets.from_layers(_layers({"tags": {"class": "minor"}, "lines": [PackedInt32Array([-60, 10, -10, 10])]}), WEST)
	assert_eq(_ways(data).size(), 0)


func test_names_come_from_the_name_layer() -> void:
	var line := PackedInt32Array([100, 100, 200, 100, 300, 150])
	var named := {"tags": {"name": "Vitosha", "class": "minor"}, "lines": [PackedInt32Array([100, 100, 200, 100])]}
	var data := OfmStreets.from_layers(_layers({"tags": {"class": "minor"}, "lines": [line]}, [named]), WEST)
	var ways := _ways(data)
	assert_eq(ways.size(), 2, "split where the name changes")
	assert_eq(ways[0]["tags"].get("name"), "Vitosha")
	assert_eq(ways[1]["tags"].get("name", ""), "")
	assert_eq(ways[0]["nodes"][-1], ways[1]["nodes"][0], "still joined")


func test_ids_never_clash_with_osm_ids() -> void:
	assert_gt(OfmStreets.node_id(0, 0), 100_000_000_000)


func test_real_sofia_tiles_make_one_connected_network() -> void:
	var g := StreetGraph.new()
	var cells := []
	for t in [WEST, EAST]:
		var kids := [t * 2, t * 2 + Vector2i(1, 0), t * 2 + Vector2i(0, 1), t * 2 + Vector2i(1, 1)]
		var compact := StreetGraph.compact_cells(OfmStreets.from_pbf(_pbf(t), t), kids)
		for c in compact:
			g.add_cell(c, compact[c])
		cells.append_array(kids)
	assert_gt(g.adjacency.size(), 3000, "a city centre has thousands of street nodes")
	# Streets join across the tile seam.
	var seam_lon: float = Geo.tile_bbox(WEST, 14)[3]
	var crossings := 0
	for id in g.adjacency:
		var p: Array = g.nodes[id]
		if absf(p[1] - seam_lon) < 1e-7 and g.neighbors(id).size() >= 2:
			crossings += 1
	assert_gt(crossings, 20, "streets cross the seam")
	# Most of it is one network: a walk can reach most nodes from the centre.
	var start := g.nearest_node(42.687, 23.319)
	var seen := {start: true}
	var todo := [start]
	while not todo.is_empty():
		for n in g.neighbors(todo.pop_back()):
			if not seen.has(n):
				seen[n] = true
				todo.append(n)
	assert_gt(seen.size(), g.adjacency.size() * 0.8)
	# And most street segments have names.
	var named := 0
	for k in g.edge_names:
		named += 1
	assert_gt(named, 1000)


func test_converting_a_dense_tile_is_quick() -> void:
	var t0 := Time.get_ticks_msec()
	OfmStreets.from_pbf(_pbf(WEST), WEST)
	assert_lt(Time.get_ticks_msec() - t0, 500)
