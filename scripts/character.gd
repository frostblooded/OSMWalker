## Placeholder walker: a big round face that bobs while walking.
extends Node2D

const RADIUS := 26.0
var walking := true
var _t := 0.0


func _process(delta: float) -> void:
	if walking:
		_t += delta
	queue_redraw()


func _draw() -> void:
	var bob := Vector2(0, -absf(sin(_t * 6.0)) * 5.0) if walking else Vector2.ZERO
	draw_circle(Vector2(0, 6), RADIUS * 0.9, Color(0, 0, 0, 0.25))  # shadow
	draw_circle(bob, RADIUS + 4.0, Color.WHITE)
	draw_circle(bob, RADIUS, Color("#ff7a3d"))
	draw_circle(bob + Vector2(-9, -6), 4.5, Color.BLACK)
	draw_circle(bob + Vector2(9, -6), 4.5, Color.BLACK)
	draw_arc(bob + Vector2(0, 2), 11.0, 0.3, PI - 0.3, 16, Color.BLACK, 3.0)
