## Debug overlay: shades the box his goals are picked from and draws the
## city's real outline over it. Positions are map-local (see map_view.gd).
extends Node2D

const BOX_FILL := Color(1.0, 0.45, 0.0, 0.14)
const BOX_EDGE := Color(1.0, 0.45, 0.0, 0.9)
const OUTLINE := Color(0.55, 0.1, 0.75, 0.9)
const WIDTH := 6.0

var box := PackedVector2Array()  # corners: SW, SE, NE, NW
var outlines := []  # PackedVector2Array per ring


## Places `bounds` ([south, west, north, east]) and `rings` (Arrays of
## [lat, lon]) with `map` (a MapView).
func show_area(bounds: Array, rings: Array, map: Node2D) -> void:
	box = PackedVector2Array()
	if bounds.size() == 4:
		for c in [[bounds[0], bounds[1]], [bounds[0], bounds[3]], [bounds[2], bounds[3]], [bounds[2], bounds[1]]]:
			box.append(map.geo_to_local(c[0], c[1]))
	outlines = []
	for ring in rings:
		var pts := PackedVector2Array()
		for p in ring:
			pts.append(map.geo_to_local(p[0], p[1]))
		outlines.append(pts)
	queue_redraw()


func _draw() -> void:
	if box.size() == 4:
		draw_colored_polygon(box, BOX_FILL)
		draw_polyline(box + PackedVector2Array([box[0]]), BOX_EDGE, WIDTH, true)
	for pts in outlines:
		if pts.size() > 1:
			draw_polyline(pts, OUTLINE, WIDTH, true)
