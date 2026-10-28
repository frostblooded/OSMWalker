## Walkable street network built from Overpass API JSON.
## Nodes are keyed by OSM node id, so overlapping downloads merge cleanly.
## Streets come in fixed grid cells (map tiles at CELL_ZOOM), so downloads
## never overlap, add up, and can be cached by name.
extends RefCounted

const Geo := preload("res://scripts/geo.gd")

## A z15 tile is about 1.2 x 0.9 km at 42°N.
const CELL_ZOOM := 15
## Nudges (lon, lat) in degrees, about 1 cm, to see every cell a point touches.
const EDGE_EPS := [Vector2(-1e-7, -1e-7), Vector2(1e-7, -1e-7), Vector2(-1e-7, 1e-7), Vector2(1e-7, 1e-7)]

var nodes := {}  # id -> [lat, lon]
var adjacency := {}  # id -> {neighbor_id: true}
var edge_names := {}  # "lo:hi" -> street name
var cells := {}  # Vector2i -> true, every cell whose streets are all loaded
var places := {}  # Vector2i -> [{name, class, subclass, rank, lat, lon}], places of note per cell


static func cell_of(lat: float, lon: float) -> Vector2i:
	return Geo.tile_of(lat, lon, CELL_ZOOM)


## [south, west, north, east] around a set of cells.
static func cells_bbox(list: Array) -> Array:
	var box := [INF, INF, -INF, -INF]
	for c in list:
		var b := Geo.tile_bbox(c, CELL_ZOOM)
		box = [minf(box[0], b[0]), minf(box[1], b[1]), maxf(box[2], b[2]), maxf(box[3], b[3])]
	return box


## Cells within `ring` cells of the point, most urgent first: his own cell,
## then by distance, with cells ahead of `heading` (x east, y south) pulled forward.
static func cells_by_priority(lat: float, lon: float, ring: int, heading := Vector2.ZERO) -> Array:
	var home := cell_of(lat, lon)
	var p := Vector2(Geo.lon_to_px(lon, CELL_ZOOM), Geo.lat_to_px(lat, CELL_ZOOM)) / Geo.TILE_SIZE
	var dir := heading.normalized()
	var scored := []
	for dy in range(-ring, ring + 1):
		for dx in range(-ring, ring + 1):
			var c := home + Vector2i(dx, dy)
			var off := Vector2(c.x + 0.5, c.y + 0.5) - p
			var score := -1.0 if c == home else off.length() - 0.5 * off.dot(dir)
			scored.append([score, c])
	scored.sort_custom(func(a, b): return a[0] < b[0])
	return scored.map(func(s): return s[1])


## Splits an Overpass response into compact per-cell data. Each cell gets
## every way that has a node inside it, with all of that way's nodes, so the
## links of every node in the cell are complete, and the places inside it.
static func compact_cells(data: Dictionary, list: Array) -> Dictionary:
	var b := CellBuilder.new(data, list)
	b.step(1 << 62)
	return b.out


## compact_cells in slices, so a big download can be split over frames.
class CellBuilder:
	var out := {}  # cell -> compact data, complete once step() returns true
	var _els: Array
	var _phase := 0  # 0: nodes, 1: ways
	var _i := 0
	var _coords := {}  # id -> [lat, lon]
	var _node_cell := {}  # id -> cell
	var _seen := {}  # cell -> {id: true}

	func _init(data: Dictionary, list: Array) -> void:
		_els = data.get("elements", [])
		for c in list:
			out[c] = {"ids": PackedInt64Array(), "coords": PackedFloat64Array(), "ways": [], "places": []}
			_seen[c] = {}
		for p in data.get("places", []):
			var c := Geo.tile_of(p["lat"], p["lon"], CELL_ZOOM)
			if out.has(c):
				out[c]["places"].append(p)

	## Works for about budget_us microseconds. True when finished.
	func step(budget_us: int) -> bool:
		var start := Time.get_ticks_usec()
		var n := float(1 << CELL_ZOOM)
		while _phase < 2:
			while _i < _els.size():
				var el: Dictionary = _els[_i]
				_i += 1
				if _phase == 0 and el.get("type") == "node":
					var lat := float(el["lat"])
					var lon := float(el["lon"])
					var id := int(el["id"])
					_coords[id] = [lat, lon]
					var r := deg_to_rad(lat)
					_node_cell[id] = Vector2i(floori((lon + 180.0) / 360.0 * n), floori((1.0 - log(tan(r) + 1.0 / cos(r)) / PI) / 2.0 * n))
				elif _phase == 1 and el.get("type") == "way":
					_add_way(el)
				if (_i & 127) == 0 and Time.get_ticks_usec() - start > budget_us:
					return false
			_phase += 1
			_i = 0
		return true

	func _add_way(el: Dictionary) -> void:
		var tags: Dictionary = el.get("tags", {})
		var name: String = tags.get("name", tags.get("ref", ""))
		var ids := PackedInt64Array()
		var touched := {}
		for raw in el.get("nodes", []):
			var id := int(raw)
			if _coords.has(id):
				ids.append(id)
				var c: Vector2i = _node_cell[id]
				if out.has(c):
					touched[c] = true
		for c in touched:
			var cell: Dictionary = out[c]
			var seen: Dictionary = _seen[c]
			cell["ways"].append([name, ids])
			for id in ids:
				if not seen.has(id):
					seen[id] = true
					cell["ids"].append(id)
					var p: Array = _coords[id]
					cell["coords"].append(p[0])
					cell["coords"].append(p[1])


## Adds one cell's compact data and marks the cell loaded.
func add_cell(cell: Vector2i, compact: Dictionary) -> void:
	var ids: PackedInt64Array = compact.get("ids", PackedInt64Array())
	var xy: PackedFloat64Array = compact.get("coords", PackedFloat64Array())
	for i in ids.size():
		nodes[ids[i]] = [xy[i * 2], xy[i * 2 + 1]]
	for way in compact.get("ways", []):
		var name: String = way[0]
		var way_nodes: PackedInt64Array = way[1]
		for i in range(way_nodes.size() - 1):
			var a := way_nodes[i]
			var b := way_nodes[i + 1]
			if a == b or not nodes.has(a) or not nodes.has(b):
				continue
			_link(a, b)
			if name != "":
				edge_names[_key(a, b)] = name
	places[cell] = compact.get("places", [])
	cells[cell] = true


## Places of note in loaded cells inside [south, west, north, east].
func places_in(box: Array) -> Array:
	var out := []
	for list in places.values():
		for p in list:
			if p["lat"] >= box[0] and p["lat"] <= box[2] and p["lon"] >= box[1] and p["lon"] <= box[3]:
				out.append(p)
	return out


## Merges an Overpass response covering `bbox`. Only cells entirely inside the
## box count as loaded. Returns their compact data, keyed by cell.
func add_overpass(data: Dictionary, bbox: Array) -> Dictionary:
	var nw := cell_of(bbox[2], bbox[1])
	var se := cell_of(bbox[0], bbox[3])
	var inside := []
	for y in range(nw.y, se.y + 1):
		for x in range(nw.x, se.x + 1):
			var b := Geo.tile_bbox(Vector2i(x, y), CELL_ZOOM)
			if b[0] >= bbox[0] and b[1] >= bbox[1] and b[2] <= bbox[2] and b[3] <= bbox[3]:
				inside.append(Vector2i(x, y))
	var compact := compact_cells(data, inside)
	for c in compact:
		add_cell(c, compact[c])
	return compact


func _link(a: int, b: int) -> void:
	if not adjacency.has(a):
		adjacency[a] = {}
	if not adjacency.has(b):
		adjacency[b] = {}
	adjacency[a][b] = true
	adjacency[b][a] = true


static func _key(a: int, b: int) -> String:
	return "%d:%d" % [mini(a, b), maxi(a, b)]


func has_node(id: int) -> bool:
	return nodes.has(id)


func neighbors(id: int) -> Array:
	return adjacency.get(id, {}).keys()


func edge_length(a: int, b: int) -> float:
	var pa: Array = nodes[a]
	var pb: Array = nodes[b]
	return Geo.distance_m(pa[0], pa[1], pb[0], pb[1])


func edge_name(a: int, b: int) -> String:
	return edge_names.get(_key(a, b), "")


## True when the node's cell is loaded, so all its links are known. A node on
## a cell's edge (where tile streets are cut) needs the cells on both sides.
func is_complete(id: int) -> bool:
	if not nodes.has(id):
		return false
	var p: Array = nodes[id]
	for d in EDGE_EPS:
		if not cells.has(cell_of(p[0] + d.y, p[1] + d.x)):
			return false
	return true


## True when every cell within margin_m of the point is loaded.
func covers(lat: float, lon: float, margin_m: float) -> bool:
	var m := Geo.bbox_around(lat, lon, margin_m)
	var nw := cell_of(m[2], m[1])
	var se := cell_of(m[0], m[3])
	for y in range(nw.y, se.y + 1):
		for x in range(nw.x, se.x + 1):
			if not cells.has(Vector2i(x, y)):
				return false
	return true


## Closest node that has at least one street attached, or -1 if none.
func nearest_node(lat: float, lon: float) -> int:
	var best := -1
	var best_d := INF
	for id in adjacency:
		if adjacency[id].is_empty():
			continue
		var p: Array = nodes[id]
		var d := Geo.distance_m(lat, lon, p[0], p[1])
		if d < best_d:
			best_d = d
			best = id
	return best
