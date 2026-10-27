## A small "+" shaped street network around (42.0, 23.0), in Overpass JSON form.
##
##            2 (N)
##            |
##   5 (W) -- 1 -- 3 (E)        all arms ~111 m
##            |
##            4 (S)
extends RefCounted

const BBOX := [41.99, 22.99, 42.01, 23.01]


static func data() -> Dictionary:
	return {"elements": [
		{"type": "node", "id": 1, "lat": 42.0, "lon": 23.0},
		{"type": "node", "id": 2, "lat": 42.001, "lon": 23.0},
		{"type": "node", "id": 3, "lat": 42.0, "lon": 23.00135},
		{"type": "node", "id": 4, "lat": 41.999, "lon": 23.0},
		{"type": "node", "id": 5, "lat": 42.0, "lon": 22.99865},
		{"type": "way", "id": 100, "nodes": [4, 1, 2], "tags": {"highway": "residential", "name": "Main St"}},
		{"type": "way", "id": 101, "nodes": [5, 1, 3], "tags": {"highway": "footway"}},
	]}
