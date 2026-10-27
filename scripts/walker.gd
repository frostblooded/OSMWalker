## The character's walk along the street graph.
## Pure logic: no nodes, no networking, so it is easy to test.
extends RefCounted

const StreetGraph := preload("res://scripts/street_graph.gd")

## 200 meters per minute.
const SPEED_MPS := 200.0 / 60.0
## Longest absence we simulate when the app is reopened.
const MAX_CATCH_UP_S := 24.0 * 3600.0
## Catch-up plays as a fast-forward: at least this many times normal speed...
const FAST_FORWARD_MIN_X := 50.0
## ...and faster when needed, so it never takes longer than this.
const FAST_FORWARD_MAX_S := 30.0

var graph: StreetGraph
var rng := RandomNumberGenerator.new()
var prev_node := -1  # node we came from before from_node
var from_node := -1
var to_node := -1  # -1 while waiting for map data around from_node
var progress_m := 0.0  # meters walked from from_node towards to_node
var total_m := 0.0


func _init(street_graph: StreetGraph = null) -> void:
	graph = street_graph if street_graph else StreetGraph.new()


static func meters_for_elapsed(seconds: float) -> float:
	return clampf(seconds, 0.0, MAX_CATCH_UP_S) * SPEED_MPS


## Fast-forward speed for catching up `owed_m` meters.
static func fast_forward_mps(owed_m: float) -> float:
	return maxf(FAST_FORWARD_MIN_X * SPEED_MPS, owed_m / FAST_FORWARD_MAX_S)


func start_at(node_id: int) -> void:
	prev_node = -1
	from_node = node_id
	to_node = -1
	progress_m = 0.0


## True when the walker is stuck at a node whose surroundings are not loaded yet.
func needs_data() -> bool:
	return to_node == -1 and not graph.is_complete(from_node)


## Walks `meters` along the streets. Returns meters that could not be walked
## because the map around the current node still has to be downloaded.
func advance(meters: float) -> float:
	while meters > 0.0:
		if to_node == -1:
			if not graph.is_complete(from_node):
				return meters
			to_node = _choose_next(from_node, prev_node)
			if to_node == -1:
				# Isolated node (e.g. the street was removed from OSM): hop to the nearest street.
				var p: Array = graph.nodes[from_node]
				var near := graph.nearest_node(p[0], p[1])
				if near == -1 or near == from_node:
					return 0.0
				start_at(near)
				continue
		var remaining := graph.edge_length(from_node, to_node) - progress_m
		if meters < remaining:
			progress_m += meters
			total_m += meters
			return 0.0
		meters -= remaining
		total_m += remaining
		prev_node = from_node
		from_node = to_node
		to_node = -1
		progress_m = 0.0
	return 0.0


## Random street out of `node`, never straight back unless it is a dead end.
func _choose_next(node: int, came_from: int) -> int:
	var options := graph.neighbors(node)
	if options.size() > 1:
		options.erase(came_from)
	if options.is_empty():
		return -1
	return options[rng.randi_range(0, options.size() - 1)]


## Current [lat, lon].
func position() -> Array:
	var a: Array = graph.nodes[from_node]
	if to_node == -1:
		return a
	var b: Array = graph.nodes[to_node]
	var t := progress_m / maxf(graph.edge_length(from_node, to_node), 0.001)
	return [lerpf(a[0], b[0], t), lerpf(a[1], b[1], t)]


func street_name() -> String:
	if to_node != -1:
		return graph.edge_name(from_node, to_node)
	if prev_node != -1:
		return graph.edge_name(prev_node, from_node)
	return ""


func to_dict() -> Dictionary:
	var d := {
		"prev": prev_node, "from": from_node, "to": to_node,
		"progress_m": progress_m, "total_m": total_m, "pos": position(),
	}
	for key in ["prev", "from", "to"]:
		var id: int = d[key]
		d[key + "_pos"] = graph.nodes.get(id, [])
	return d


## Restores saved state. Node coordinates are stored too, so they can be put
## back into an empty graph and the walk resumes before the map reloads.
func load_dict(d: Dictionary) -> void:
	prev_node = int(d.get("prev", -1))
	from_node = int(d.get("from", -1))
	to_node = int(d.get("to", -1))
	progress_m = float(d.get("progress_m", 0.0))
	total_m = float(d.get("total_m", 0.0))
	for key in ["prev", "from", "to"]:
		var id := int(d.get(key, -1))
		var p: Array = d.get(key + "_pos", [])
		if id != -1 and p.size() == 2 and not graph.nodes.has(id):
			graph.nodes[id] = [float(p[0]), float(p[1])]
