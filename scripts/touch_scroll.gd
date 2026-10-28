## A vertical scroll list that follows the finger 1:1. Godot's own touch
## drag scrolled about twice as far as the finger moved in the web build, so
## this one works out the scroll from how far the finger is from where it
## went down, which also makes repeated or doubled motion events harmless.
## Use it for every scroll list (see docs/ui-guidelines.md).
extends ScrollContainer

## Finger travel before a press counts as a drag rather than a tap.
const DEADZONE := 12.0

var _down := false
var _dragging := false
var _from_y := 0.0
var _start := 0


func _init() -> void:
	horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED


func _gui_input(e: InputEvent) -> void:
	if e is InputEventMouseButton and e.button_index == MOUSE_BUTTON_LEFT:
		_down = e.pressed
		_dragging = false
		_from_y = e.position.y
		_start = scroll_vertical
	elif e is InputEventMouseMotion and _down:
		var dy: float = e.position.y - _from_y
		if not _dragging and absf(dy) > DEADZONE:
			_dragging = true
		if _dragging:
			scroll_vertical = _start - roundi(dy)
		accept_event()  # Godot's own drag must not scroll as well


## True while the finger is dragging the list, so a tap on a row underneath
## can be ignored.
func is_dragging() -> bool:
	return _dragging
