## Headless Godot does not route pushed input to controls, so these feed the
## scroll list its events directly, in its own coordinates.
extends GutTest

const UiKit := preload("res://scripts/ui_kit.gd")
const TouchScroll := preload("res://scripts/touch_scroll.gd")

var scroll: TouchScroll
var list: VBoxContainer


func before_each() -> void:
	scroll = UiKit.scroll()
	scroll.size = Vector2(400, 300)
	list = VBoxContainer.new()
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(list)
	for i in 30:
		var l := UiKit.label("Row %d" % i)
		l.custom_minimum_size = Vector2(0, 60)
		list.add_child(l)
	add_child_autofree(scroll)
	await wait_process_frames(2)


func _press(y: float, down: bool) -> void:
	var e := InputEventMouseButton.new()
	e.button_index = MOUSE_BUTTON_LEFT
	e.pressed = down
	e.position = Vector2(200, y)
	scroll._gui_input(e)


func _move(y: float, rel: float) -> void:
	var e := InputEventMouseMotion.new()
	e.position = Vector2(200, y)
	e.relative = Vector2(0, rel)
	e.button_mask = MOUSE_BUTTON_MASK_LEFT
	scroll._gui_input(e)


func test_the_list_moves_exactly_as_far_as_the_finger() -> void:
	_press(250, true)
	for y in range(240, 99, -10):
		_move(y, -10)
	assert_eq(scroll.scroll_vertical, 150)
	_press(100, false)


func test_doubled_motion_events_do_not_scroll_twice() -> void:
	_press(250, true)
	_move(200, -50)
	_move(200, -50)
	_move(150, -50)
	_move(150, -50)
	assert_eq(scroll.scroll_vertical, 100)


func test_dragging_back_down_scrolls_back() -> void:
	_press(250, true)
	_move(150, -100)
	_move(200, 50)
	assert_eq(scroll.scroll_vertical, 50)


func test_a_tiny_wobble_is_not_a_drag() -> void:
	_press(250, true)
	_move(245, -5)
	assert_eq(scroll.scroll_vertical, 0)
	assert_false(scroll.is_dragging())


func test_motion_without_a_press_does_nothing() -> void:
	_move(100, -150)
	assert_eq(scroll.scroll_vertical, 0)


func test_a_drag_over_a_collapsible_heading_does_not_toggle_it() -> void:
	var sec := UiKit.collapsible("Logs")
	list.add_child(sec["root"])
	_press(250, true)
	_move(150, -100)
	sec["header"].pressed.emit()  # the release on the heading
	assert_false(sec["body"].visible, "a drag is not a tap")
	assert_eq(sec["header"].mouse_filter, Control.MOUSE_FILTER_PASS, "drags on the heading reach the list")


func test_tapping_a_collapsible_heading_opens_and_closes_it() -> void:
	var sec := UiKit.collapsible("Logs")
	list.add_child(sec["root"])
	assert_false(sec["body"].visible)
	assert_string_starts_with(sec["header"].text, "▸")
	sec["header"].pressed.emit()
	assert_true(sec["body"].visible)
	assert_string_starts_with(sec["header"].text, "▾")
	sec["header"].pressed.emit()
	assert_false(sec["body"].visible)
