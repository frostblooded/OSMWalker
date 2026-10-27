## Turns an OpenFreeMap (OpenMapTiles schema) vector tile into Overpass-style
## JSON, so the street graph cannot tell the two sources apart.
##
## Tiles carry no OSM node ids, so a node's id is its position on the tile
## grid: the same point gets the same id in every tile. Lines are clipped at
## the tile's edge, and the cut point is snapped so both neighbours agree on it.
extends RefCounted

const VectorTile := preload("res://scripts/vector_tile.gd")
const Geo := preload("res://scripts/geo.gd")

const TILE_ZOOM := 14
## Positions are kept in units of 1/4096 of a z14 tile, which are pixels at zoom 18.
const UNIT_ZOOM := 18
const UNITS := 4096
const LAYERS := ["transportation", "transportation_name"]
const WALKABLE := ["primary", "secondary", "tertiary", "minor", "service", "track", "path"]
const NOT_WALKABLE_SUBCLASS := ["platform", "corridor"]
## Edge cuts are rounded to this many units (about 2 m), so the two tiles'
## slightly different clipped copies of a street meet at the same point.
const SNAP := 4
## How close (in grid units, about 0.6 m) a dead end or other node must be to
## a segment to be joined onto it.
const JOIN_TOL := 1.5
const GRID := 64.0
## Keeps grid ids apart from OSM node ids.
const ID_BASE := 1 << 60


static func node_id(gx: int, gy: int) -> int:
	return ID_BASE + (gx << 27) + gy


## Overpass-style {"elements": [...]} for one z14 tile's pbf bytes.
static func from_pbf(bytes: PackedByteArray, tile: Vector2i) -> Dictionary:
	return from_layers(VectorTile.decode(bytes, LAYERS), tile)


static func from_layers(layers: Dictionary, tile: Vector2i) -> Dictionary:
	var names := _segment_names(layers.get("transportation_name", {}), tile)
	var t: Dictionary = layers.get("transportation", {})
	var scale: float = float(UNITS) / t.get("extent", UNITS)
	var nodes := {}  # id -> [lat, lon]
	var ways := []
	for f in t.get("features", []):
		var tags: Dictionary = f["tags"]
		if not WALKABLE.has(tags.get("class")) or NOT_WALKABLE_SUBCLASS.has(tags.get("subclass")):
			continue
		for line in f["lines"]:
			_add_line(line, scale, tile, names, nodes, ways)
	ways = join_junctions(ways)
	var elements := []
	for id in nodes:
		elements.append({"type": "node", "id": id, "lat": nodes[id][0], "lon": nodes[id][1]})
	for w in ways:
		elements.append({"type": "way", "nodes": w[1], "tags": {"name": w[0]} if w[0] != "" else {}})
	return {"elements": elements}


## Tiles drop some junction points, so a side street can end on the middle of
## another street's segment without sharing a node. Splits that segment at
## the street's end (and at any node lying right on a segment), so they connect.
static func join_junctions(ways: Array) -> Array:
	var degree := {}
	for w in ways:
		var ids: Array = w[1]
		for i in ids.size() - 1:
			degree[ids[i]] = degree.get(ids[i], 0) + 1
			degree[ids[i + 1]] = degree.get(ids[i + 1], 0) + 1
	var grid := {}  # cell key -> dead-end ids in it
	for n in degree:
		if degree[n] == 1:
			var c := (pos_of(n) / GRID).floor()
			var k := int(c.x) * 4194304 + int(c.y)
			if not grid.has(k):
				grid[k] = []
			grid[k].append(n)
	var best := {}  # dead end -> [distance, way, segment, t, u, v]
	for w in ways.size():
		var ids: Array = ways[w][1]
		for i in ids.size() - 1:
			var u: int = ids[i]
			var v: int = ids[i + 1]
			var a := pos_of(u)
			var b := pos_of(v)
			var lo := ((a.min(b) - Vector2.ONE * JOIN_TOL) / GRID).floor()
			var hi := ((a.max(b) + Vector2.ONE * JOIN_TOL) / GRID).floor()
			for cx in range(int(lo.x), int(hi.x) + 1):
				for cy in range(int(lo.y), int(hi.y) + 1):
					for n in grid.get(cx * 4194304 + cy, []):
						if n == u or n == v:
							continue
						var p := pos_of(n)
						var q := Geometry2D.get_closest_point_to_segment(p, a, b)
						var d := q.distance_to(p)
						if d <= JOIN_TOL and d < best.get(n, [INF])[0]:
							best[n] = [d, w, i, a.distance_to(q) / maxf(a.distance_to(b), 0.001), u, v]
	var splits := {}  # Vector2i(way, segment) -> [[t, id], ...]
	var extra := []
	for n in best:
		var e: Array = best[n]
		var t: float = e[3]
		if t < 0.01 or t > 0.99:
			extra.append(["", [n, e[4] if t < 0.5 else e[5]]])  # next to its end: just link them
		else:
			var key := Vector2i(e[1], e[2])
			if not splits.has(key):
				splits[key] = []
			splits[key].append([t, n])
	if splits.is_empty():
		return ways + extra
	var out := []
	for w in ways.size():
		var ids: Array = ways[w][1]
		var joined := [ids[0]]
		for i in ids.size() - 1:
			var cut: Array = splits.get(Vector2i(w, i), [])
			cut.sort_custom(func(x, y): return x[0] < y[0])
			for c in cut:
				if c[1] != joined[-1]:
					joined.append(c[1])
			joined.append(ids[i + 1])
		out.append([ways[w][0], joined])
	return out + extra


## A node's position in grid units, from its id.
static func pos_of(id: int) -> Vector2:
	var v := id - ID_BASE
	return Vector2(v >> 27, v & ((1 << 27) - 1))


## Segment key (either direction) -> street name, for every segment of every named line.
static func _segment_names(layer: Dictionary, tile: Vector2i) -> Dictionary:
	var scale: float = float(UNITS) / layer.get("extent", UNITS)
	var out := {}
	for f in layer.get("features", []):
		var name: String = str(f["tags"].get("name", ""))
		if name == "":
			continue
		for line in f["lines"]:
			for i in range(0, line.size() - 2, 2):
				var a := _id_at(Vector2(line[i], line[i + 1]) * scale, tile)
				var b := _id_at(Vector2(line[i + 2], line[i + 3]) * scale, tile)
				out[_key(a, b)] = name
	return out


static func _key(a: int, b: int) -> int:
	return mini(a, b) * 1000003 + maxi(a, b)  # wraps, and a clash would only swap a name


static func _id_at(p: Vector2, tile: Vector2i) -> int:
	return node_id(tile.x * UNITS + roundi(p.x), tile.y * UNITS + roundi(p.y))


## Adds the parts of `line` inside the tile as ways, one per run of same-named segments.
static func _add_line(line: PackedInt32Array, scale: float, tile: Vector2i, names: Dictionary, nodes: Dictionary, ways: Array) -> void:
	var run := []  # node ids of the way being built
	var run_name := ""
	for i in range(0, line.size() - 2, 2):
		var p := Vector2(line[i], line[i + 1]) * scale
		var q := Vector2(line[i + 2], line[i + 3]) * scale
		var cut := [p, q] if _inside(p) and _inside(q) else clip(p, q, UNITS)
		if cut.is_empty():
			_flush(run, run_name, ways)
			run = []
			continue
		var a := _node(cut[0], cut[0] != p, tile, nodes)
		var b := _node(cut[1], cut[1] != q, tile, nodes)
		if a == b:
			continue
		var name: String = names.get(_key(_id_at(p, tile), _id_at(q, tile)), "")
		if run.is_empty() or run[-1] != a or name != run_name:
			_flush(run, run_name, ways)
			run = [a]
			run_name = name
		run.append(b)
	_flush(run, run_name, ways)


static func _flush(run: Array, name: String, ways: Array) -> void:
	if run.size() >= 2:
		ways.append([name, run.duplicate()])


## Id of a point, adding it to `nodes`. Cut points are snapped along their edge.
static func _node(p: Vector2, cut: bool, tile: Vector2i, nodes: Dictionary) -> int:
	if cut:
		p = snap_to_edge(p, UNITS)
	var gx := tile.x * UNITS + roundi(p.x)
	var gy := tile.y * UNITS + roundi(p.y)
	var id := node_id(gx, gy)
	if not nodes.has(id):
		nodes[id] = [Geo.px_to_lat(gy, UNIT_ZOOM), Geo.px_to_lon(gx, UNIT_ZOOM)]
	return id


static func _inside(p: Vector2) -> bool:
	return p.x >= 0.0 and p.y >= 0.0 and p.x <= UNITS and p.y <= UNITS


## A point on the tile's edge, with its position along the edge rounded to SNAP.
static func snap_to_edge(p: Vector2, size: int) -> Vector2:
	var dx := minf(absf(p.x), absf(p.x - size))
	var dy := minf(absf(p.y), absf(p.y - size))
	if dx <= dy:
		return Vector2(0.0 if absf(p.x) < absf(p.x - size) else float(size), roundf(p.y / SNAP) * SNAP)
	return Vector2(roundf(p.x / SNAP) * SNAP, 0.0 if absf(p.y) < absf(p.y - size) else float(size))


## The part of segment p-q inside the square 0..size (Liang-Barsky), or [] if none.
static func clip(p: Vector2, q: Vector2, size: int) -> Array:
	var d := q - p
	var t0 := 0.0
	var t1 := 1.0
	for e in [[-d.x, p.x], [d.x, size - p.x], [-d.y, p.y], [d.y, size - p.y]]:
		var num: float = e[1]
		var den: float = e[0]
		if den == 0.0:
			if num < 0.0:
				return []
			continue
		var t := num / den
		if den < 0.0:
			t0 = maxf(t0, t)
		else:
			t1 = minf(t1, t)
		if t0 > t1:
			return []
	return [p + d * t0 if t0 > 0.0 else p, p + d * t1 if t1 < 1.0 else q]
