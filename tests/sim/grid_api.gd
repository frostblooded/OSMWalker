## Fake Overpass that returns a city-sized street grid for any bbox, slowly.
extends "res://scripts/osm_api.gd"

const Geo := preload("res://scripts/geo.gd")
const STEP := 0.001  # ~110 m blocks
var delay_s := 3.0
var calls := 0
var max_parallel_seen := 0
var _active := 0

func _id(i: int, j: int) -> int:
	return (i + 1000000) * 10000000 + (j + 1000000)

func fetch_streets(bbox: Array, _first := 0) -> Variant:
	calls += 1
	_active += 1
	max_parallel_seen = maxi(max_parallel_seen, _active)
	await get_tree().create_timer(delay_s).timeout
	_active -= 1
	var i0 := floori(bbox[0] / STEP) - 1
	var i1 := ceili(bbox[2] / STEP) + 1
	var j0 := floori(bbox[1] / STEP) - 1
	var j1 := ceili(bbox[3] / STEP) + 1
	var els := []
	for i in range(i0, i1 + 1):
		for j in range(j0, j1 + 1):
			els.append({"type": "node", "id": _id(i, j), "lat": i * STEP, "lon": j * STEP})
	for i in range(i0, i1 + 1):
		var ns := []
		for j in range(j0, j1 + 1): ns.append(_id(i, j))
		els.append({"type": "way", "id": i, "nodes": ns, "tags": {"name": "Row %d" % i}})
	for j in range(j0, j1 + 1):
		var ns := []
		for i in range(i0, i1 + 1): ns.append(_id(i, j))
		els.append({"type": "way", "id": 100000000 + j, "nodes": ns, "tags": {"name": "Col %d" % j}})
	return {"elements": els}


## Tiles come as the same grid, one z14 tile per call.
func fetch_street_tile(tile: Vector2i) -> Variant:
	var b := Geo.tile_bbox(tile, 14)
	return await fetch_streets(b)
