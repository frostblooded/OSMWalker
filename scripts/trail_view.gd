## While the history is open: the trail he walked and a numbered marker at
## each spot something happened. Positions are map-local (see map_view.gd).
extends Node2D

const LINE_COLOR := Color(0.16, 0.42, 0.85, 0.8)
const LINE_WIDTH := 7.0
const MARKER_COLOR := Color("#2a6bd9")
const HIGHLIGHT_COLOR := Color("#ff7a3d")  # the walker's color
const RADIUS := 22.0
const FONT_SIZE := 24

var lines := []  # PackedVector2Array per trail segment
var markers := []  # {pos: Vector2, label, first}
var highlight := -1  # the entry number tapped, -1 for none


## Fills the view from `history` (a History), placed with `map` (a MapView).
func show_history(history: RefCounted, map: Node2D) -> void:
	lines = []
	for seg in history.segments():
		var pts := PackedVector2Array()
		for p in seg:
			pts.append(map.geo_to_local(p[0], p[1]))
		lines.append(pts)
	markers = []
	for mk in history.markers():
		markers.append({"pos": map.geo_to_local(mk["at"][0], mk["at"][1]), "label": mk["label"], "first": mk["first"]})
	queue_redraw()


func _is_lit(mk: Dictionary) -> bool:
	if highlight < 0:
		return false
	var parts: PackedStringArray = mk["label"].split("-")
	return highlight >= int(parts[0]) and highlight <= int(parts[-1])


func _draw() -> void:
	for pts in lines:
		if pts.size() > 1:
			draw_polyline(pts, LINE_COLOR, LINE_WIDTH, true)
	var font := ThemeDB.fallback_font
	var lit := []
	# Oldest first so the newest sit on top; the tapped one goes over all.
	for mk in markers:
		if _is_lit(mk):
			lit.append(mk)
		else:
			_marker(mk, MARKER_COLOR, 1.0, font)
	for mk in lit:
		_marker(mk, HIGHLIGHT_COLOR, 1.4, font)


func _marker(mk: Dictionary, color: Color, grow: float, font: Font) -> void:
	var size := FONT_SIZE * grow
	var text: String = mk["label"]
	var w := font.get_string_size(text, HORIZONTAL_ALIGNMENT_CENTER, -1, int(size)).x
	var r := maxf(RADIUS * grow, w / 2.0 + 8.0)
	var pos: Vector2 = mk["pos"]
	draw_circle(pos, r + 3.0, Color.WHITE)
	draw_circle(pos, r, color)
	draw_string(font, pos + Vector2(-w / 2.0, size * 0.35), text, HORIZONTAL_ALIGNMENT_LEFT, -1, int(size), Color.WHITE)
