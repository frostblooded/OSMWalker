## Walkable street network built from Overpass API JSON.
## Nodes are keyed by OSM node id, so overlapping downloads merge cleanly.
extends RefCounted

const Geo := preload("res://scripts/geo.gd")

## Meters a node must be inside a loaded box before its neighbors are trusted.
## Ways are cut at the box edge, so nodes near it can look like false dead ends.
const EDGE_MARGIN_M := 60.0

var nodes := {}  # id -> [lat, lon]
var adjacency := {}  # id -> {neighbor_id: true}
var edge_names := {}  # "lo:hi" -> street name
var areas: Array = []  # loaded [south, west, north, east] boxes


## Merges an Overpass `out body` response covering `bbox` into the graph.
func add_overpass(data: Dictionary, bbox: Array) -> void:
	for el in data.get("elements", []):
		if el.get("type") == "node":
			nodes[int(el["id"])] = [float(el["lat"]), float(el["lon"])]
	for el in data.get("elements", []):
		if el.get("type") != "way":
			continue
		var tags: Dictionary = el.get("tags", {})
		var name: String = tags.get("name", tags.get("ref", ""))
		var way_nodes: Array = el.get("nodes", [])
		for i in range(way_nodes.size() - 1):
			var a := int(way_nodes[i])
			var b := int(way_nodes[i + 1])
			if a == b or not nodes.has(a) or not nodes.has(b):
				continue
			_link(a, b)
			if name != "":
				edge_names[_key(a, b)] = name
	areas.append(bbox)


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


## True when the node lies well inside a downloaded box, so its links are complete.
func is_complete(id: int) -> bool:
	if not nodes.has(id):
		return false
	var p: Array = nodes[id]
	for box in areas:
		var m := Geo.bbox_around(p[0], p[1], EDGE_MARGIN_M)
		if m[0] >= box[0] and m[1] >= box[1] and m[2] <= box[2] and m[3] <= box[3]:
			return true
	return false


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
