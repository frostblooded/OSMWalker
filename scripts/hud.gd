## All on-screen UI, sized for small touchscreens: city search, status bar,
## his mini stats and latest action (tap for the full sheet), zoom buttons,
## the ☰ menu, the history panel, Help, and the reset button guarded by typing RESET.
extends CanvasLayer

signal search_requested(text: String)
signal city_chosen(city_name: String, lat: float, lon: float, bbox: Array)
signal zoom_changed(step: int)
signal reset_confirmed
signal history_toggled(open: bool)
signal history_entry_tapped(index: int)  # index into History.entries
signal goal_tapped
signal back_tapped
signal debug_toggled(open: bool)
signal debug_goal_pressed
signal debug_trip_pressed(kind: int)  # Trips.Kind

## What kind of bar goes under the status message.
enum Bar { NONE, PROGRESS, BUSY }

const History := preload("res://scripts/history.gd")
const UiKit := preload("res://scripts/ui_kit.gd")
const Trips := preload("res://scripts/trips.gd")
const HelpView := preload("res://scripts/help_view.gd")

const RESET_WORD := "RESET"
const BIG := Vector2(132, 132)
const ZOOM := Vector2(100, 100)
const PANEL_BG := Color(1, 1, 1, 0.92)
## Meters in the mini stats row: short name, colour.
const MINI_BARS := {"health": ["HP", Color("#d7263d")], "energy": ["EN", Color("#f4b400")], "fullness": ["FU", Color("#2e9e44")]}

var street_label: Label
var place_label: Label
var bars := {}  # meter -> ProgressBar in the mini stats row
var money_label: Label
var feed_label: Label  # his latest action
var sheet_label: Label
var _sheet: Control
var _stats: RefCounted  # the Stats shown, kept for the sheet
var city_label: Label
var overlay_label: Label
var progress_bar: ProgressBar
var detail_label: Label  # step-by-step loading details under the bar
var _status_box: VBoxContainer
var _wait_row: HBoxContainer
var wait_bar: ProgressBar
var wait_label: Label
var _game_ui: Control
var _picker: Control
var _search_box: LineEdit
var _search_button: Button
var _results: VBoxContainer
var _typing_timer: Timer
## Seconds of no typing before the picker searches by itself.
var autocomplete_delay := 0.4
const AUTOCOMPLETE_MIN_CHARS := 3
var _picker_status: Label
var _confirm: Control
var _confirm_box: LineEdit
var _confirm_yes: Button
var _reset_button: Button
var _back_button: Button
var _zoom_in: Button
var _history_button: Button
var _menu_button: Button
var _menu_items: VBoxContainer
var _menu_backdrop: Control
var _top: Control
var _map_buttons := []  # hidden while the history panel is up
var _credit: Label
var _history: Control
var _history_rows: VBoxContainer
var _history_scroll: ScrollContainer
var _history_close: Button
var _history_sig := ""  # what the rows show, to rebuild only on change
var debug_label: Label
var debug_alert_label: Label  # red: what looks wrong about the city
var debug_scroll: ScrollContainer
var city_area_toggle: CheckButton  # set by main
var _badges := []  # red dots shown while there are unseen warnings or errors
var _debug: Control
var _help: HelpView
var _help_button: Button
var _debug_button: Button
var _debug_close: Button
var _debug_goal: Button
var _debug_city: Button
var _debug_country: Button


func _ready() -> void:
	UiKit.install_icon_fonts()
	_build_game_ui()
	_build_picker()
	_build_confirm()
	_build_status()
	_build_sheet()
	_build_history()
	_build_debug()
	_help = HelpView.new()
	add_child(_help)


## Status message with a loading bar under it, over the top of the map.
func _build_status() -> void:
	_status_box = VBoxContainer.new()
	# Full width: an autowrapping label with no width wraps after every letter.
	_status_box.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE, Control.PRESET_MODE_MINSIZE, 32)
	_status_box.offset_top = 240
	_status_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_status_box.add_theme_constant_override("separation", 12)
	_status_box.visible = false
	add_child(_status_box)

	overlay_label = _label("", 30, HORIZONTAL_ALIGNMENT_CENTER)
	overlay_label.add_theme_color_override("font_outline_color", Color.WHITE)
	overlay_label.add_theme_constant_override("outline_size", 12)
	overlay_label.visible = false
	_status_box.add_child(overlay_label)

	progress_bar = ProgressBar.new()
	progress_bar.show_percentage = false
	progress_bar.custom_minimum_size = Vector2(0, 28)
	progress_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(1, 1, 1, 0.85)
	bg.set_corner_radius_all(14)
	bg.set_border_width_all(2)
	bg.border_color = Color(0.1, 0.1, 0.1, 0.5)
	var fill := StyleBoxFlat.new()
	fill.bg_color = Color("#ff7a3d")  # the walker's color
	fill.set_corner_radius_all(14)
	progress_bar.add_theme_stylebox_override("background", bg)
	progress_bar.add_theme_stylebox_override("fill", fill)
	progress_bar.visible = false
	_status_box.add_child(progress_bar)

	detail_label = _label("", 22, HORIZONTAL_ALIGNMENT_LEFT)
	detail_label.add_theme_color_override("font_outline_color", Color.WHITE)
	detail_label.add_theme_constant_override("outline_size", 10)
	detail_label.visible = false
	_status_box.add_child(detail_label)


func _label(text: String, size: int, align := HORIZONTAL_ALIGNMENT_LEFT) -> Label:
	var l := Label.new()
	l.text = text
	l.horizontal_alignment = align
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", Color(0.1, 0.1, 0.1))
	return l


func _panel() -> PanelContainer:
	var p := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = PANEL_BG
	sb.set_corner_radius_all(24)
	sb.set_content_margin_all(24)
	p.add_theme_stylebox_override("panel", sb)
	return p


func _button(text: String, min_size := Vector2(0, 110)) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = min_size
	b.add_theme_font_size_override("font_size", 40)
	return b


func _build_game_ui() -> void:
	_game_ui = Control.new()
	_game_ui.set_anchors_preset(Control.PRESET_FULL_RECT)
	_game_ui.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_game_ui)

	var top := _panel()
	top.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE, Control.PRESET_MODE_MINSIZE, 16)
	var col := VBoxContainer.new()
	city_label = _label("", 26)
	street_label = _label("", 38)
	place_label = _label("", 34)
	place_label.visible = false
	# Link blue: tapping it shows the goal on the map instead of the sheet.
	place_label.add_theme_color_override("font_color", Color("#1a5fb4"))
	place_label.mouse_filter = Control.MOUSE_FILTER_STOP
	place_label.gui_input.connect(func(e):
		if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT:
			place_label.accept_event()
			goal_tapped.emit())
	col.add_child(city_label)
	col.add_child(street_label)
	col.add_child(place_label)
	col.add_child(_build_mini_stats())
	feed_label = _label("", 26)
	feed_label.add_theme_color_override("font_color", Color(0.3, 0.3, 0.3))
	col.add_child(feed_label)
	col.add_child(_build_wait_row())
	top.add_child(col)
	# The whole panel is the button for the full stats sheet.
	top.gui_input.connect(func(e):
		if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT:
			open_sheet())
	_game_ui.add_child(top)
	_top = top

	var zoom_col := VBoxContainer.new()
	zoom_col.add_theme_constant_override("separation", 16)
	zoom_col.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT, Control.PRESET_MODE_MINSIZE, 24)
	zoom_col.offset_bottom = -90
	zoom_col.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	zoom_col.grow_vertical = Control.GROW_DIRECTION_BEGIN
	for step in [1, -1]:
		var b := _button("+" if step > 0 else "−", ZOOM)
		b.add_theme_font_size_override("font_size", 52)
		b.pressed.connect(func(): zoom_changed.emit(step))
		if step > 0:
			_zoom_in = b
		zoom_col.add_child(b)
	_game_ui.add_child(zoom_col)
	_map_buttons.append(zoom_col)

	# Rarely used buttons live in a menu over the ☰ button, so the map stays clear.
	_menu_backdrop = Control.new()
	_menu_backdrop.set_anchors_preset(Control.PRESET_FULL_RECT)
	_menu_backdrop.visible = false
	_menu_backdrop.gui_input.connect(func(e):
		if e is InputEventMouseButton and e.pressed:
			close_menu())
	_game_ui.add_child(_menu_backdrop)

	_menu_items = VBoxContainer.new()
	_menu_items.add_theme_constant_override("separation", 16)
	_menu_items.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT, Control.PRESET_MODE_MINSIZE, 24)
	_menu_items.offset_bottom = -90 - BIG.y - 16
	_menu_items.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_menu_items.visible = false
	_game_ui.add_child(_menu_items)
	_history_button = add_menu_item("History", open_history)
	_help_button = add_menu_item("Help", open_help)
	_reset_button = add_menu_item("New city", _open_confirm)
	_debug_button = add_menu_item("Debug", open_debug)

	var menu := _button("", BIG)
	menu.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT, Control.PRESET_MODE_MINSIZE, 24)
	menu.offset_bottom = -90
	menu.grow_vertical = Control.GROW_DIRECTION_BEGIN
	menu.pressed.connect(func(): close_menu() if is_menu_open() else open_menu())
	_add_burger_lines(menu)
	_menu_button = menu
	for b in [menu, _debug_button]:
		var dot := _label("●", 34)
		dot.add_theme_color_override("font_color", Color("#d7263d"))
		dot.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT, Control.PRESET_MODE_MINSIZE, 2)
		dot.grow_horizontal = Control.GROW_DIRECTION_BEGIN
		dot.mouse_filter = Control.MOUSE_FILTER_IGNORE
		dot.visible = false
		b.add_child(dot)
		_badges.append(dot)
	_game_ui.add_child(menu)
	_map_buttons.append(menu)

	# Shown while the map shows his goal instead of following him.
	var back := _button("Back to him", Vector2(250, BIG.y))
	back.add_theme_font_size_override("font_size", 34)
	back.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT, Control.PRESET_MODE_MINSIZE, 24)
	back.offset_left = 24 + BIG.x + 16  # beside ☰, clear of the menu above it
	back.offset_bottom = -90
	back.grow_vertical = Control.GROW_DIRECTION_BEGIN
	back.visible = false
	back.pressed.connect(func(): back_tapped.emit())
	_back_button = back
	_game_ui.add_child(back)

	# Required by the OSM tile usage policy.
	var credit := _label("© OpenStreetMap contributors · OpenMapTiles · OpenFreeMap", 22, HORIZONTAL_ALIGNMENT_CENTER)
	credit.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE, Control.PRESET_MODE_MINSIZE, 20)
	credit.grow_vertical = Control.GROW_DIRECTION_BEGIN
	credit.add_theme_color_override("font_outline_color", Color.WHITE)
	credit.add_theme_constant_override("outline_size", 10)
	_game_ui.add_child(credit)
	_credit = credit


## Three bars drawn on the ☰ button; the font has no ☰ glyph.
func _add_burger_lines(b: Button) -> void:
	var col := VBoxContainer.new()
	col.set_anchors_and_offsets_preset(Control.PRESET_CENTER, Control.PRESET_MODE_MINSIZE)
	col.grow_horizontal = Control.GROW_DIRECTION_BOTH
	col.grow_vertical = Control.GROW_DIRECTION_BOTH
	col.add_theme_constant_override("separation", 12)
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for i in 3:
		var line := ColorRect.new()
		line.color = Color(0.9, 0.9, 0.9)
		line.custom_minimum_size = Vector2(56, 8)
		line.mouse_filter = Control.MOUSE_FILTER_IGNORE
		col.add_child(line)
	b.add_child(col)


## Adds a big button to the ☰ menu; tapping it closes the menu and calls `on_tap`.
func add_menu_item(text: String, on_tap: Callable) -> Button:
	var b := _button(text, Vector2(250, BIG.y))
	b.add_theme_font_size_override("font_size", 34)
	b.pressed.connect(func():
		close_menu()
		on_tap.call())
	_menu_items.add_child(b)
	return b


## Adds a big on/off switch to the ☰ menu; flipping it keeps the menu open.
func add_menu_toggle(text: String, on: bool, on_toggle: Callable) -> CheckButton:
	var t := CheckButton.new()
	t.text = text
	t.button_pressed = on
	t.custom_minimum_size = Vector2(250, BIG.y)
	t.add_theme_font_size_override("font_size", 34)
	t.toggled.connect(on_toggle)
	_menu_items.add_child(t)
	return t


func open_menu() -> void:
	_menu_items.visible = true
	_menu_backdrop.visible = true


func close_menu() -> void:
	_menu_items.visible = false
	_menu_backdrop.visible = false


func is_menu_open() -> bool:
	return _menu_items.visible


## Bar and countdown in the top panel while he stays somewhere.
func _build_wait_row() -> HBoxContainer:
	_wait_row = HBoxContainer.new()
	_wait_row.add_theme_constant_override("separation", 16)
	_wait_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_wait_row.visible = false
	wait_bar = ProgressBar.new()
	wait_bar.show_percentage = false
	wait_bar.custom_minimum_size = Vector2(0, 24)
	wait_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	wait_bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	wait_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(0, 0, 0, 0.12)
	bg.set_corner_radius_all(12)
	var fill := StyleBoxFlat.new()
	fill.bg_color = Color("#ff7a3d")  # the walker's color
	fill.set_corner_radius_all(12)
	wait_bar.add_theme_stylebox_override("background", bg)
	wait_bar.add_theme_stylebox_override("fill", fill)
	_wait_row.add_child(wait_bar)
	wait_label = _label("", 26)
	wait_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	_wait_row.add_child(wait_label)
	return _wait_row


## Shows how long until he moves on, `fraction` of the stay being over;
## a negative `seconds` hides it.
func set_wait(seconds: float, fraction := 0.0) -> void:
	_wait_row.visible = seconds >= 0.0
	if _wait_row.visible:
		wait_label.text = "Moving again in " + countdown_text(seconds)
		wait_bar.value = fraction * 100.0


## Seconds left as m:ss, rounded up so it reads 1:00 at the start and
## never 0:00 while he still waits.
static func countdown_text(seconds: float) -> String:
	var s := ceili(maxf(seconds - 0.001, 0.0))
	return "%d:%02d" % [s / 60, s % 60]


func _build_mini_stats() -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 16)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for m in MINI_BARS:
		var l := _label(MINI_BARS[m][0], 24)
		l.autowrap_mode = TextServer.AUTOWRAP_OFF
		row.add_child(l)
		var bar := ProgressBar.new()
		bar.show_percentage = false
		bar.custom_minimum_size = Vector2(0, 24)
		bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var bg := StyleBoxFlat.new()
		bg.bg_color = Color(0, 0, 0, 0.12)
		bg.set_corner_radius_all(12)
		var fill := StyleBoxFlat.new()
		fill.bg_color = MINI_BARS[m][1]
		fill.set_corner_radius_all(12)
		bar.add_theme_stylebox_override("background", bg)
		bar.add_theme_stylebox_override("fill", fill)
		bars[m] = bar
		row.add_child(bar)
	money_label = _label("", 26)
	money_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	row.add_child(money_label)
	return row


## Full-screen sheet: every stat, his gear and his buffs.
func _build_sheet() -> void:
	_sheet = ColorRect.new()
	(_sheet as ColorRect).color = Color(0, 0, 0, 0.6)
	_sheet.set_anchors_preset(Control.PRESET_FULL_RECT)
	_sheet.visible = false
	add_child(_sheet)
	var box := _panel()
	box.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT, Control.PRESET_MODE_MINSIZE, 24)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 16)
	var scroll := UiKit.scroll()
	sheet_label = _label("", 30)
	sheet_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(sheet_label)
	col.add_child(scroll)
	var close := _button("Close")
	close.pressed.connect(close_sheet)
	col.add_child(close)
	box.add_child(col)
	_sheet.add_child(box)


func open_sheet() -> void:
	_sheet.visible = true
	_fill_sheet()


func close_sheet() -> void:
	_sheet.visible = false


func is_sheet_open() -> bool:
	return _sheet.visible


## The bottom half of the screen: the last things that happened, newest
## first, numbered like their markers on the map above.
func _build_history() -> void:
	_history = _panel()
	_history.anchor_left = 0.0
	_history.anchor_right = 1.0
	_history.anchor_top = 0.5
	_history.anchor_bottom = 1.0
	_history.offset_bottom = -64  # the map credit stays readable under it
	_history.visible = false
	_game_ui.add_child(_history)
	_game_ui.move_child(_history, _credit.get_index())
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 12)
	var head := HBoxContainer.new()
	var title := _label("History", 40)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(title)
	_history_close = _button("Close", Vector2(220, 110))
	_history_close.pressed.connect(close_history)
	head.add_child(_history_close)
	col.add_child(head)
	var scroll := UiKit.scroll()
	_history_scroll = scroll
	_history_rows = VBoxContainer.new()
	_history_rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_history_rows.add_theme_constant_override("separation", 8)
	scroll.add_child(_history_rows)
	col.add_child(scroll)
	_history.add_child(col)


## The bottom half of the screen for debugging: buttons that force a new
## goal or trip, everything about the city and how each goal was picked.
func _build_debug() -> void:
	_debug = _panel()
	_debug.anchor_left = 0.0
	_debug.anchor_right = 1.0
	_debug.anchor_top = 0.5
	_debug.anchor_bottom = 1.0
	_debug.offset_bottom = -64  # the map credit stays readable under it
	_debug.visible = false
	_game_ui.add_child(_debug)
	_game_ui.move_child(_debug, _credit.get_index())
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 12)
	var head := HBoxContainer.new()
	var title := _label("Debug", 40)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(title)
	_debug_close = _button("Close", Vector2(220, 110))
	_debug_close.pressed.connect(close_debug)
	head.add_child(_debug_close)
	col.add_child(head)
	debug_alert_label = _label("", 26)
	debug_alert_label.add_theme_color_override("font_color", Color("#c01c28"))
	debug_alert_label.visible = false
	col.add_child(debug_alert_label)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	_debug_goal = _debug_action("New goal", func(): debug_goal_pressed.emit())
	_debug_city = _debug_action("New city", func(): debug_trip_pressed.emit(Trips.Kind.CITY))
	_debug_country = _debug_action("New country", func(): debug_trip_pressed.emit(Trips.Kind.COUNTRY))
	for b in [_debug_goal, _debug_city, _debug_country]:
		row.add_child(b)
	col.add_child(row)
	var scroll := UiKit.scroll()
	debug_scroll = scroll
	debug_label = _label("", 24)
	debug_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(debug_label)
	col.add_child(scroll)
	_debug.add_child(col)


func _debug_action(text: String, on_press: Callable) -> Button:
	var b := _button(text, Vector2(0, 110))
	b.add_theme_font_size_override("font_size", 30)
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b.pressed.connect(on_press)
	return b


func open_debug() -> void:
	_debug.visible = true
	_show_map_buttons(false)
	debug_toggled.emit(true)


func close_debug() -> void:
	_debug.visible = false
	_show_map_buttons(true)
	debug_toggled.emit(false)


func is_debug_open() -> bool:
	return _debug.visible


func set_debug(text: String, alerts := []) -> void:
	if debug_label.text != text:
		debug_label.text = text
	var a := "\n".join(alerts.map(func(x): return "⚠ " + x))
	if debug_alert_label.text != a:
		debug_alert_label.text = a
	debug_alert_label.visible = a != ""


## Red dots on ☰ and Debug while `unseen` warnings or errors wait.
func set_problem_badge(unseen: int) -> void:
	for dot in _badges:
		dot.visible = unseen > 0


## Opens Help on its topic list, or straight on the page `id` (see data/help.txt).
func open_help(id := "") -> void:
	close_menu()
	_help.open(id)


func is_help_open() -> bool:
	return _help.is_open()


func help_page_title() -> String:
	return _help.page_title()


func help_page_text() -> String:
	return _help.page_text()


func open_history() -> void:
	close_menu()
	_history.visible = true
	_show_map_buttons(false)
	_history_sig = ""
	_fill_history()
	history_toggled.emit(true)


func close_history() -> void:
	_history.visible = false
	_show_map_buttons(true)
	history_toggled.emit(false)


func _show_map_buttons(shown: bool) -> void:
	for b in _map_buttons:
		b.visible = shown


## Height of the top panel, which covers the top of the map.
func top_height() -> float:
	return _top.get_rect().end.y if _top else 0.0


func is_history_open() -> bool:
	return _history.visible


func history_rows() -> int:
	return _history_rows.get_children().filter(func(c): return not c.is_queued_for_deletion()).size()


## One row's text: "3 · 14:05 · Bought bread".
static func history_line(history: RefCounted, i: int, bias_min: int) -> String:
	var e: Dictionary = history.entries[i]
	var when := History.time_text(e["t"], bias_min) + " · " if e["t"] > 0 else ""
	return "%d · %s%s" % [history.number(i), when, e["text"]]


func _fill_history() -> void:
	if _stats == null or not _history.visible:
		return
	var h: RefCounted = _stats.history
	var sig := "%d %s" % [h.entries.size(), h.entries[-1] if not h.entries.is_empty() else ""]
	if sig == _history_sig:
		return
	_history_sig = sig
	for c in _history_rows.get_children():
		c.queue_free()
	var bias: int = Time.get_time_zone_from_system().get("bias", 0)
	for i in range(h.entries.size() - 1, -1, -1):
		var b := _button(history_line(h, i, bias), Vector2(0, 90))
		b.add_theme_font_size_override("font_size", 28)
		b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.disabled = h.entries[i]["at"].is_empty()
		b.mouse_filter = Control.MOUSE_FILTER_PASS  # drags on a row still scroll the list
		b.pressed.connect(func(): if not _history_scroll.is_dragging(): history_entry_tapped.emit(i))
		_history_rows.add_child(b)
	if h.entries.is_empty():
		_history_rows.add_child(_label("Nothing yet. Check back after he's walked a bit.", 28))


## Shows `stats` (a Stats) in the mini row, the feed line and the sheet.
func set_stats(stats: RefCounted) -> void:
	_stats = stats
	for m in bars:
		bars[m].value = stats.meters[m]
	money_label.text = "%dc · Lv %d" % [stats.coins, stats.level]
	feed_label.text = stats.history.latest()
	feed_label.visible = feed_label.text != ""
	if _sheet.visible:
		_fill_sheet()
	_fill_history()


static func sheet_text(stats: RefCounted) -> String:
	var lines := ["Level %d · %d / %d XP · %d coins" % [stats.level, stats.xp, stats.xp_to_next(stats.level), stats.coins], ""]
	for m in stats.meters:
		lines.append("%s: %d / 100" % [m.capitalize(), roundi(stats.meters[m])])
	lines.append("")
	lines.append("Strength %.1f · Charm %.1f · Wits %.1f · Luck %.1f" % [stats.attrs["str"], stats.attrs["cha"], stats.attrs["wit"], stats.attrs["luck"]])
	lines.append("")
	for slot in stats.gear:
		var it: Dictionary = stats.gear[slot]
		lines.append("%s: %s (%s)" % [slot.capitalize(), it["name"], it["rarity"]])
	if stats.gear.is_empty():
		lines.append("No gear yet")
	if not stats.bag.is_empty():
		lines.append("Bag (%d): %s" % [stats.bag.size(), ", ".join(stats.bag.map(func(it): return it["name"]))])
	if not stats.buffs.is_empty():
		lines.append("")
		for b in stats.buffs:
			lines.append("%s (%d min left)" % [b["name"], ceili(b["left"])])
	lines.append("")
	lines.append("Tap History to see what he's been up to.")
	return "\n".join(lines)


func _fill_sheet() -> void:
	if _stats:
		sheet_label.text = sheet_text(_stats)


func _build_picker() -> void:
	_picker = ColorRect.new()
	(_picker as ColorRect).color = Color("#cfe8d6")
	_picker.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(_picker)

	var margin := MarginContainer.new()
	margin.set_anchors_preset(Control.PRESET_FULL_RECT)
	for side in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 32)
	_picker.add_child(margin)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 24)
	margin.add_child(col)
	col.add_child(_label("Where should he start walking?", 48, HORIZONTAL_ALIGNMENT_CENTER))

	_search_box = LineEdit.new()
	_search_box.placeholder_text = "Type a city"
	_search_box.custom_minimum_size = Vector2(0, 110)
	_search_box.add_theme_font_size_override("font_size", 40)
	_search_box.text_submitted.connect(func(_t): _on_search())
	_search_box.text_changed.connect(_on_typed)
	col.add_child(_search_box)

	_search_button = _button("Search")
	_search_button.pressed.connect(_on_search)
	col.add_child(_search_button)

	_typing_timer = Timer.new()
	_typing_timer.one_shot = true
	_typing_timer.timeout.connect(func(): _search(false))
	add_child(_typing_timer)

	_picker_status = _label("", 30, HORIZONTAL_ALIGNMENT_CENTER)
	col.add_child(_picker_status)

	var scroll := UiKit.scroll()
	_results = VBoxContainer.new()
	_results.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_results.add_theme_constant_override("separation", 16)
	scroll.add_child(_results)
	col.add_child(scroll)


func _build_confirm() -> void:
	_confirm = ColorRect.new()
	(_confirm as ColorRect).color = Color(0, 0, 0, 0.6)
	_confirm.set_anchors_preset(Control.PRESET_FULL_RECT)
	_confirm.visible = false
	add_child(_confirm)

	var box := _panel()
	box.set_anchors_and_offsets_preset(Control.PRESET_CENTER, Control.PRESET_MODE_MINSIZE)
	box.custom_minimum_size = Vector2(600, 0)
	box.grow_horizontal = Control.GROW_DIRECTION_BOTH
	box.grow_vertical = Control.GROW_DIRECTION_BOTH
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 24)
	col.add_child(_label("Start over in a new city? His current walk will be lost.\nType %s to confirm." % RESET_WORD, 34, HORIZONTAL_ALIGNMENT_CENTER))
	_confirm_box = LineEdit.new()
	_confirm_box.placeholder_text = RESET_WORD
	_confirm_box.custom_minimum_size = Vector2(0, 110)
	_confirm_box.alignment = HORIZONTAL_ALIGNMENT_CENTER
	_confirm_box.add_theme_font_size_override("font_size", 40)
	_confirm_box.text_changed.connect(func(t): _confirm_yes.disabled = not is_reset_word(t))
	col.add_child(_confirm_box)
	var keep := _button("Keep walking")
	keep.pressed.connect(func(): _confirm.visible = false)
	_confirm_yes = _button("Start over")
	_confirm_yes.disabled = true
	_confirm_yes.add_theme_color_override("font_color", Color("#c0392b"))
	_confirm_yes.pressed.connect(func():
		_confirm.visible = false
		reset_confirmed.emit())
	col.add_child(keep)
	col.add_child(_confirm_yes)
	box.add_child(col)
	_confirm.add_child(box)


static func _bytes(b: int) -> String:
	if b < 1024 * 1024:
		return "%d KB" % ceili(b / 1024.0)
	return "%.1f MB" % (b / 1048576.0)


## Every step of loading, one line each, so a stall can be
## seen for what it is. `d` comes from main.gd's loading_details().
static func detail_text(d: Dictionary) -> String:
	var lines := []
	lines.append("Now: " + str(d.get("doing", "")))
	var st: Dictionary = d.get("streets", {})
	lines.append("Streets: %d areas loaded (%d from cache, %d downloaded), %d downloading, %d unpacking, %d queued, %d failed" % [
		st.get("loaded", 0), st.get("from_cache", 0), st.get("downloaded", 0), st.get("downloading", 0),
		st.get("unpacking", 0), st.get("queued", 0), st.get("failed", 0)])
	var ok: Dictionary = d.get("last_ok", {})
	if not ok.is_empty():
		lines.append("Last download: %s, %s in %.1f s" % [ok["host"], _bytes(ok["bytes"]), ok["ms"] / 1000.0])
	var err: Dictionary = d.get("last_error", {})
	if not err.is_empty():
		lines.append("Last error: %s, %s, %d s ago" % [err["host"], err["error"], err["ago_s"]])
	var servers: Dictionary = d.get("servers", {})
	for host in servers:
		var sv: Dictionary = servers[host]
		var line := "%s: %d ok, %d failed" % [host, sv.get("ok", 0), sv.get("fail", 0)]
		if sv.get("last_error", "") != "":
			line += " (%s)" % sv["last_error"]
		if sv.get("resting", false):
			line += ", resting"
		lines.append(line)
	var t: Dictionary = d.get("tiles", {})
	if d.has("tiles"):
		lines.append("Map tiles: %d of %d on screen loaded, %d downloading, %d queued, %d failed" % [
			t.get("loaded", 0), t.get("on_screen", 0), t.get("downloading", 0), t.get("queued", 0), t.get("failed", 0)])
	return "\n".join(lines)


## Message over the map with an optional bar and detail lines under it;
## empty text hides all of them.
func set_status(text: String, bar := Bar.NONE, fraction := 0.0, detail := "") -> void:
	var shown := text != ""
	overlay_label.text = text
	overlay_label.visible = shown
	detail_label.text = detail
	detail_label.visible = shown and detail != ""
	_status_box.visible = shown
	# Under the top panel, however tall its text makes it.
	_status_box.offset_top = top_height() + 24 if _game_ui.visible else 240
	progress_bar.visible = shown and bar != Bar.NONE
	progress_bar.indeterminate = bar == Bar.BUSY
	progress_bar.value = fraction * 100.0


## The reset only unlocks once the player has typed the word exactly.
static func is_reset_word(text: String) -> bool:
	return text.strip_edges() == RESET_WORD


func _open_confirm() -> void:
	_confirm_box.text = ""
	_confirm_yes.disabled = true
	_confirm.visible = true


func _on_search() -> void:
	_search(true)


func _on_typed(text: String) -> void:
	if text.strip_edges().length() >= AUTOCOMPLETE_MIN_CHARS:
		_typing_timer.start(autocomplete_delay)
	else:
		_typing_timer.stop()


## Searches for the typed text; `submitted` (Search or Enter) also hides the keyboard.
func _search(submitted: bool) -> void:
	_typing_timer.stop()
	var text := _search_box.text.strip_edges()
	if text == "":
		return
	if submitted:
		_search_box.release_focus()  # hides the on-screen keyboard
	_picker_status.text = "Searching…"
	search_requested.emit(text)


## Shows the places found for `for_text`, dropping answers to text the player
## has since changed. Null `places` means the search servers failed.
func show_results(places: Variant, for_text := "") -> void:
	if for_text != "" and for_text != _search_box.text.strip_edges():
		return
	if places == null:
		_picker_status.text = "Couldn't reach the search server. Check your connection and try again."
	else:
		_picker_status.text = "Tap a place" if places else "Nothing found. Try another name."
	for c in _results.get_children():
		c.queue_free()
	for p in places if places != null else []:
		var b := _button(p["name"])
		b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		b.add_theme_font_size_override("font_size", 32)
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.mouse_filter = Control.MOUSE_FILTER_PASS  # drags on a result still scroll the list
		b.pressed.connect(func(): if not UiKit.scroll_of(b) or not UiKit.scroll_of(b).is_dragging():
			city_chosen.emit(p["name"].get_slice(",", 0), p["lat"], p["lon"], p.get("bbox", [])))
		_results.add_child(b)


func show_picker(message := "") -> void:
	_picker.visible = true
	_game_ui.visible = false
	_history.visible = false
	close_menu()
	_show_map_buttons(true)
	_picker_status.text = message
	_search_button.disabled = false


func show_game(city: String) -> void:
	_picker.visible = false
	_game_ui.visible = true
	city_label.text = city


func set_street(street: String, stopped := false) -> void:
	if stopped:
		street_label.text = "Stopped on " + (street if street != "" else "an unnamed path")
	else:
		street_label.text = "Walking along " + street if street != "" else "Wandering along an unnamed path"


## The line about where he is heading or resting; "" hides it.
func set_goal(text: String) -> void:
	place_label.visible = text != ""
	place_label.text = text


## "Going to Cafe East · 1.2 km"; an empty `name` is a random spot.
static func goal_text(name: String, meters: float) -> String:
	return "Going to %s · %s" % [name if name != "" else "a random spot", _dist(meters)]


static func _dist(m: float) -> String:
	return "%d m" % roundi(m) if m < 1000.0 else "%.1f km" % (m / 1000.0)


static func resting_text(name: String) -> String:
	return "Resting at " + name


## Shows the "Back to him" button while the map shows his goal.
func set_goal_view(on: bool) -> void:
	_back_button.visible = on


func set_trip(city: String) -> void:
	street_label.text = "On the way to " + city


func is_confirm_open() -> bool:
	return _confirm.visible


func is_confirm_enabled() -> bool:
	return not _confirm_yes.disabled


static func _first_live(box: Node) -> Control:
	for c in box.get_children():
		if not c.is_queued_for_deletion():
			return c as Control
	return null


## Pairs of visible texts, bars and buttons on screen that overlap, as
## "name / name" lines; tests check it stays empty. Panels behind them
## (the top panel, dialogs) are not checked, only what is drawn on them.
## Only the part of a text inside its scroll box counts, and only the open
## dialog or sheet while one covers the screen.
func overlapping_texts() -> Array:
	var items := []
	var top: Node = self
	for modal in [_confirm, _sheet, _help]:
		if modal.visible:
			top = modal
	_collect_drawn(top, items, Rect2(-1e9, -1e9, 2e9, 2e9))
	var hits := []
	for i in items.size():
		for j in range(i + 1, items.size()):
			var a: Control = items[i][0]
			var b: Control = items[j][0]
			if a.is_ancestor_of(b) or b.is_ancestor_of(a):
				continue
			if (items[i][1] as Rect2).grow(-1.0).intersects((items[j][1] as Rect2).grow(-1.0)):
				hits.append("%s / %s" % [_describe(a), _describe(b)])
	return hits


## Adds [control, visible rect] for each drawn text under `node`.
func _collect_drawn(node: Node, out: Array, clip: Rect2) -> void:
	for c in node.get_children():
		if c is Control and not c.is_visible_in_tree():
			continue
		var inner := clip
		if c is Control:
			var r: Rect2 = c.get_global_rect().intersection(clip)
			if (c is Label or c is ProgressBar or c is Button or c is LineEdit) and r.size.x > 2.0 and r.size.y > 2.0:
				out.append([c, r])
			if c.clip_contents:
				inner = r
		_collect_drawn(c, out, inner)


static func _describe(c: Control) -> String:
	var t: String = c.get("text") if c.get("text") != null else ""
	return "%s \"%s\"" % [c.get_class(), t.left(30)]


## Controls the e2e test taps, by name.
func debug_controls() -> Dictionary:
	return {
		"search_box": _search_box, "search_button": _search_button, "picker_status": _picker_status, "result0": _first_live(_results),
		"new_city": _reset_button, "zoom_in": _zoom_in, "menu": _menu_button, "menu_backdrop": _menu_backdrop, "goal": place_label, "back_to_him": _back_button,
		"history": _history_button, "history_panel": _history, "history_close": _history_close,
		"history_row0": _first_live(_history_rows),
		"city_area": city_area_toggle, "problem_badge": _badges[0] if not _badges.is_empty() else null,
		"debug": _debug_button, "debug_panel": _debug, "debug_close": _debug_close,
		"debug_goal": _debug_goal, "debug_city": _debug_city, "debug_country": _debug_country,
		"confirm_box": _confirm_box, "confirm_yes": _confirm_yes,
		"help": _help_button, "help_panel": _help, "help_topic0": _help.first_topic,
		"help_back": _help.back_button, "help_close": _help.close_button,
	}
