## Map pin on the place of note he is heading to or resting at.
extends Node2D

const COLOR := Color("#d7263d")
const RADIUS := 18.0


func _draw() -> void:
	# A teardrop whose tip sits on the place.
	var head := Vector2(0, -RADIUS * 2.2)
	draw_colored_polygon(PackedVector2Array([Vector2.ZERO, head + Vector2(-RADIUS * 0.8, RADIUS * 0.6), head + Vector2(RADIUS * 0.8, RADIUS * 0.6)]), COLOR)
	draw_circle(head, RADIUS + 3.0, Color.WHITE)
	draw_circle(head, RADIUS, COLOR)
	draw_circle(head, RADIUS * 0.4, Color.WHITE)
