## The character's walk along the street graph: he picks a place of note
## (a shop, a cafe, a sight...), heads there by the shortest route over the streets loaded so far
## (re-planning as more load), stays a minute at most, then picks the next one.
## With no places loaded yet he heads for a random spot in the city and walks
## on without stopping there.
## Instead of a new spot he may travel to another city (see trips.gd).
## Pure logic: no nodes, no networking, so it is easy to test.
extends RefCounted

const Problems := preload("res://scripts/problems.gd")
const StreetGraph := preload("res://scripts/street_graph.gd")
const Geo := preload("res://scripts/geo.gd")
const Trips := preload("res://scripts/trips.gd")

## Arrived somewhere new: `city` is the trip's destination.
signal landed(city: Dictionary)
## Reached a destination: `place` is the place of note, or {} for a random spot.
## Listeners may change how long he stays with rest_for().
signal arrived(place: Dictionary)
## Picked a new goal or trip: `info` tells how (see debug_log.gd).
signal picked(info: Dictionary)

## 200 meters per minute.
const SPEED_MPS := 200.0 / 60.0
## He stays a minute at each place, and never longer, counted in walking
## meters so the clock stays simple.
const REST_M := SPEED_MPS * 60.0
## Close enough to a destination to call it reached.
const ARRIVE_M := 30.0
## Destinations come from the searched place's box, kept between these sizes.
const MIN_CITY_RADIUS_M := 1500.0
const MAX_CITY_RADIUS_M := 25000.0
## Goals given up on in a row before he just walks down a street, so a city
## where no goal can be reached never hangs the game.
const MAX_SKIPS := 3
## Route searches stop after this many street corners, to keep frames short.
const MAX_SEARCH_NODES := 40000
## Where he stands on landing, until the new city's streets load.
const ARRIVAL_NODE := -2

var graph: StreetGraph
var rng := RandomNumberGenerator.new()
var prev_node := -1  # node we came from before from_node
var from_node := -1
var to_node := -1  # -1 while waiting for map data around from_node
var progress_m := 0.0  # meters walked from from_node towards to_node
var total_m := 0.0
var bounds := []  # [south, west, north, east] where destinations are picked
var goal := []  # [lat, lon] he is heading for, empty when none yet
var goal_node := -1  # street corner the goal snapped to, once streets there load
var route := []  # nodes still to walk after from_node
var route_arrives := false  # true when the route ends at the goal
var rest_m := 0.0  # rest left at the current destination, in walking meters
var rest_total_m := 0.0  # length of the current rest, for the countdown bar
var rested_m := 0.0
var trip_m := 0.0  # walked since the current goal was picked
var trip_start_m := 0.0  # straight-line distance to the goal when it was picked
var place := {}  # the place of note he is heading to or resting at, {} for a random spot
## Asked on every destination pick: returns a city to travel to, or {} to stay.
var trip_planner: Callable
var travel := {}  # {from: [lat, lon], to: city, total_m, left_m} while on the way
var _skips := 0  # goals given up on in a row


func _init(street_graph: StreetGraph = null) -> void:
	graph = street_graph if street_graph else StreetGraph.new()


## Longest a trip may take before he gives up and picks another spot (the
## goal may be across water or behind a fence).
static func trip_limit_m(straight_m: float) -> float:
	return 2.5 * straight_m + 2000.0


## Where destinations are picked: the searched place's box, grown or shrunk so
## it is never tiny and never a whole country.
static func city_bounds(lat: float, lon: float, box: Array) -> Array:
	var lo := Geo.bbox_around(lat, lon, MIN_CITY_RADIUS_M)
	var hi := Geo.bbox_around(lat, lon, MAX_CITY_RADIUS_M)
	if box.size() != 4:
		return lo
	return [
		clampf(minf(box[0], lo[0]), hi[0], lo[0]), clampf(minf(box[1], lo[1]), hi[1], lo[1]),
		clampf(maxf(box[2], lo[2]), lo[2], hi[2]), clampf(maxf(box[3], lo[3]), lo[3], hi[3])]


func start_at(node_id: int) -> void:
	prev_node = -1
	from_node = node_id
	to_node = -1
	progress_m = 0.0
	route = []


func set_goal(lat: float, lon: float) -> void:
	place = {}
	goal = [lat, lon]
	goal_node = -1
	route = []
	route_arrives = false
	trip_m = 0.0
	trip_start_m = 0.0
	if graph.has_node(from_node):
		var p := position()
		trip_start_m = Geo.distance_m(p[0], p[1], lat, lon)


## Picks a place of note to walk to (a random spot in the city while none
## are loaded), or sets off on a trip.
func pick_goal() -> void:
	if trip_planner.is_valid():
		var city: Dictionary = trip_planner.call()
		if not city.is_empty():
			start_travel(city)
			picked.emit({"trip": "%s, %s" % [city.get("name", ""), city.get("country", "")]})
			return
	if bounds.size() != 4 and graph.has_node(from_node):
		var p := position()
		bounds = city_bounds(p[0], p[1], [])
	var options := graph.places_in(bounds)
	var info := {"in_box": options.size(), "cells": graph.cells.size()}
	if graph.has_node(from_node):
		var here := position()
		options = options.filter(func(q): return Geo.distance_m(here[0], here[1], q["lat"], q["lon"]) > ARRIVE_M)
	info["too_close"] = info["in_box"] - options.size()
	if not options.is_empty():
		var r := rng.randf()
		var pl := pick_place(options, r)
		set_goal(pl["lat"], pl["lon"])
		place = pl
		info.merge({"r": r, "place": pl.get("name", ""), "class": pl.get("class", ""), "rank": int(pl.get("rank", 1)),
			"total_weight": options.reduce(func(acc, q): return acc + place_weight(q), 0.0)})
		picked.emit(info)
		return
	set_goal(rng.randf_range(bounds[0], bounds[2]), rng.randf_range(bounds[1], bounds[3]))
	info["spot"] = goal
	info["fallback"] = "no places loaded in the city box yet" if info["in_box"] == 0 \
		else "every loaded place is within %d m of him" % int(ARRIVE_M)
	Problems.warn_now("Picked a random spot: " + info["fallback"])
	picked.emit(info)


## Debug: drops any rest or trip (landing where he was headed) and picks
## the next goal right away.
func force_new_goal() -> void:
	if is_traveling():
		land_now()
	rest_m = 0.0
	rest_total_m = 0.0
	pick_goal()


## Ends the trip now, in its destination.
func land_now() -> void:
	if is_traveling():
		_land()


static func place_weight(p: Dictionary) -> float:
	return 1.0 / maxi(int(p["rank"]), 1)


## One of `places`, picked with weight 1 / rank so important ones come up
## more often. `r` is uniform in [0, 1).
static func pick_place(places: Array, r: float) -> Dictionary:
	var total := 0.0
	for p in places:
		total += place_weight(p)
	r *= total
	for p in places:
		r -= place_weight(p)
		if r < 0.0:
			return p
	return places[-1] if not places.is_empty() else {}


## Sets off for `city` ({name, lat, lon, bounds, ...}). The trip uses up
## walking time, so the clock works as for walking.
func start_travel(city: Dictionary) -> void:
	var p := position()
	var m := Trips.travel_s(Geo.distance_m(p[0], p[1], city["lat"], city["lon"])) * SPEED_MPS
	travel = {"from": p, "to": city, "total_m": m, "left_m": m}
	place = {}
	goal = []
	goal_node = -1
	route = []
	route_arrives = false


func is_traveling() -> bool:
	return not travel.is_empty()


## Starts over in the destination with a fresh street graph; he stands on a
## lone point there until its streets load, then hops onto the nearest one.
func _land() -> void:
	var city: Dictionary = travel["to"]
	travel = {}
	graph = StreetGraph.new()
	graph.nodes[ARRIVAL_NODE] = [float(city["lat"]), float(city["lon"])]
	start_at(ARRIVAL_NODE)
	prev_node = -1
	bounds = city["bounds"] if city.has("bounds") else city_bounds(city["lat"], city["lon"], [])
	trip_m = 0.0
	trip_start_m = 0.0
	landed.emit(city)


func is_resting() -> bool:
	return rest_m > 0.0


## True when the walker is stuck at a node whose surroundings are not loaded yet.
func needs_data() -> bool:
	return travel.is_empty() and to_node == -1 and not graph.is_complete(from_node)


## Walks `meters` along the streets. Returns meters that could not be walked
## because the map around the current node still has to be downloaded.
func advance(meters: float) -> float:
	while meters > 0.0:
		if not travel.is_empty():
			var t: float = minf(meters, travel["left_m"])
			travel["left_m"] -= t
			meters -= t
			if travel["left_m"] <= 0.0:
				_land()
			continue
		if rest_m > 0.0:
			var r := minf(meters, rest_m)
			rest_m -= r
			rested_m += r
			meters -= r
			continue
		if to_node == -1:
			if not graph.is_complete(from_node):
				return meters
			if graph.neighbors(from_node).is_empty():
				# Isolated node (e.g. the street was removed from OSM): hop to the nearest street.
				Problems.warn_now("Stood on a corner with no streets; hopping to the nearest street")
				var p: Array = graph.nodes[from_node]
				var near := graph.nearest_node(p[0], p[1])
				if near == -1 or near == from_node:
					return 0.0
				start_at(near)
				continue
			to_node = _next_step()
			if to_node == -1 and _skips > MAX_SKIPS:
				Problems.warn_now("Gave up on %d goals in a row; wandering down a street instead" % _skips)
				# Already as close as he gets to every goal tried: wander a street instead.
				_skips = 0
				var near := graph.neighbors(from_node)
				to_node = near[rng.randi() % near.size()]
			if to_node == -1:
				continue  # arrived (resting now), moved on, or set off on a trip
		var remaining := graph.edge_length(from_node, to_node) - progress_m
		if meters < remaining:
			progress_m += meters
			total_m += meters
			trip_m += meters
			return 0.0
		meters -= remaining
		total_m += remaining
		trip_m += remaining
		prev_node = from_node
		from_node = to_node
		to_node = -1
		progress_m = 0.0
		_skips = 0
		if route_arrives and route.is_empty():
			_arrive()
	return 0.0


## Next node on the way to the goal, or -1 after arriving (he starts resting
## at a place) or giving up.
func _next_step() -> int:
	if goal.is_empty():
		pick_goal()
		if is_traveling():
			return -1
	if not route.is_empty() and route[0] != from_node and graph.neighbors(from_node).has(route[0]):
		return route.pop_front()
	if trip_m > trip_limit_m(trip_start_m):
		_move_on()
		return -1
	if route_arrives:
		_arrive()
		return -1
	_plan()
	if route.is_empty():
		_arrive()
		return -1
	return route.pop_front()


## At a place he stays a minute (listeners may shorten it); a random spot
## is only a waypoint.
func _arrive() -> void:
	if place.is_empty():
		_move_on()
		return
	rest_for(1.0)
	arrived.emit(place)


## Drops the goal without stopping; he picks the next one at once.
func _move_on() -> void:
	goal = []
	goal_node = -1
	route = []
	route_arrives = false
	_skips += 1


## Stays where he is for `minutes`, but never more than a minute, counted in
## walking meters like the rest.
func rest_for(minutes: float) -> void:
	goal = []
	goal_node = -1
	route = []
	route_arrives = false
	rest_m = minf(minutes * 60.0 * SPEED_MPS, REST_M)
	rest_total_m = rest_m


## Seconds until he moves again.
func rest_left_s() -> float:
	return rest_m / SPEED_MPS


## How much of the current rest is over, 0 to 1.
func rest_fraction() -> float:
	return 1.0 - rest_m / rest_total_m if rest_total_m > 0.0 else 0.0


## A* from here towards the goal over the loaded streets. Corners whose
## surroundings are not loaded yet count as reachable in a straight line, so
## the route may end at the edge of the loaded map; he re-plans there.
func _plan() -> void:
	if goal_node == -1 and graph.covers(goal[0], goal[1], ARRIVE_M):
		goal_node = graph.nearest_node(goal[0], goal[1])
		if goal_node != -1:
			goal = graph.nodes[goal_node]
	route = []
	route_arrives = false
	var heap := [[_h(from_node), from_node]]
	var g := {from_node: 0.0}
	var came := {}
	var done := {}
	var best := from_node  # closest to the goal of all corners reached
	var end := -1
	while not heap.is_empty() and done.size() < MAX_SEARCH_NODES:
		var id: int = _heap_pop(heap)[1]
		if done.has(id):
			continue
		done[id] = true
		if _h(id) < _h(best):
			best = id
		if id == goal_node or _h(id) <= ARRIVE_M:
			end = id
			route_arrives = true
			break
		if id != from_node and not graph.is_complete(id):
			end = id
			break
		for n in graph.neighbors(id):
			var cost: float = g[id] + graph.edge_length(id, n)
			if cost < g.get(n, INF):
				g[n] = cost
				came[n] = id
				_heap_push(heap, [cost + _h(n), n])
	if end == -1:
		# Nothing better is reachable: the closest corner is as far as he can get.
		end = best
		route_arrives = heap.is_empty()
	while end != from_node:
		route.push_front(end)
		end = came[end]


func _h(id: int) -> float:
	var p: Array = graph.nodes[id]
	return Geo.distance_m(p[0], p[1], goal[0], goal[1])


static func _heap_push(heap: Array, item: Array) -> void:
	heap.append(item)
	var i := heap.size() - 1
	while i > 0:
		var up := (i - 1) / 2
		if heap[up][0] <= item[0]:
			break
		heap[i] = heap[up]
		i = up
	heap[i] = item


static func _heap_pop(heap: Array) -> Array:
	var top: Array = heap[0]
	var last: Array = heap.pop_back()
	if heap.is_empty():
		return top
	var i := 0
	var n := heap.size()
	while true:
		var c := i * 2 + 1
		if c >= n:
			break
		if c + 1 < n and heap[c + 1][0] < heap[c][0]:
			c += 1
		if heap[c][0] >= last[0]:
			break
		heap[i] = heap[c]
		i = c
	heap[i] = last
	return top


## Current [lat, lon].
func position() -> Array:
	if not travel.is_empty():
		return _travel_position()
	var a: Array = graph.nodes[from_node]
	if to_node == -1:
		return a
	var b: Array = graph.nodes[to_node]
	var t := progress_m / maxf(graph.edge_length(from_node, to_node), 0.001)
	return [lerpf(a[0], b[0], t), lerpf(a[1], b[1], t)]


## Along the straight line on the map (Web Mercator) between the two cities.
func _travel_position() -> Array:
	var a: Array = travel["from"]
	var b: Dictionary = travel["to"]
	var t: float = 1.0 - travel["left_m"] / maxf(travel["total_m"], 0.001)
	var x := lerpf(Geo.lon_to_px(a[1], 0), Geo.lon_to_px(b["lon"], 0), t)
	var y := lerpf(Geo.lat_to_px(a[0], 0), Geo.lat_to_px(b["lat"], 0), t)
	return [Geo.px_to_lat(y, 0), Geo.px_to_lon(x, 0)]


func street_name() -> String:
	if not travel.is_empty():
		return ""
	if to_node != -1:
		return graph.edge_name(from_node, to_node)
	if prev_node != -1:
		return graph.edge_name(prev_node, from_node)
	return ""


func to_dict() -> Dictionary:
	var d := {
		"prev": prev_node, "from": from_node, "to": to_node,
		"progress_m": progress_m, "total_m": total_m, "pos": position(),
		"bounds": bounds, "goal": goal, "goal_node": goal_node, "route": route,
		"route_arrives": route_arrives, "rest_m": rest_m, "rest_total_m": rest_total_m, "rested_m": rested_m,
		"trip_m": trip_m, "trip_start_m": trip_start_m, "travel": travel, "place": place,
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
	bounds = Array(d.get("bounds", [])).map(func(v): return float(v))
	goal = Array(d.get("goal", [])).map(func(v): return float(v))
	goal_node = int(d.get("goal_node", -1))
	route = Array(d.get("route", [])).map(func(v): return int(v))
	route_arrives = bool(d.get("route_arrives", false))
	# Saves from when stops ran up to 15 minutes are cut to a minute.
	rest_m = minf(float(d.get("rest_m", 0.0)), REST_M)
	rest_total_m = clampf(float(d.get("rest_total_m", rest_m)), rest_m, REST_M)
	rested_m = float(d.get("rested_m", 0.0))
	trip_m = float(d.get("trip_m", 0.0))
	trip_start_m = float(d.get("trip_start_m", 0.0))
	travel = d.get("travel", {})
	place = d.get("place", {})
	if not travel.is_empty():
		travel["from"] = Array(travel["from"]).map(func(v): return float(v))
		var city: Dictionary = travel["to"]
		if city.has("bounds"):
			city["bounds"] = Array(city["bounds"]).map(func(v): return float(v))
	for key in ["prev", "from", "to"]:
		var id := int(d.get(key, -1))
		var p: Array = d.get(key + "_pos", [])
		if id != -1 and p.size() == 2 and not graph.nodes.has(id):
			graph.nodes[id] = [float(p[0]), float(p[1])]
