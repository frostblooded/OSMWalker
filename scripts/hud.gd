## All on-screen UI, sized for small touchscreens: city search, status bar,
## zoom buttons, and the reset button guarded by typing RESET.
extends CanvasLayer

signal search_requested(text: String)
signal city_chosen(city_name: String, lat: float, lon: float, bbox: Array)
signal zoom_changed(step: int)
signal reset_confirmed

## What kind of bar goes under the status message.
enum Bar { NONE, PROGRESS, BUSY }

const RESET_WORD := "RESET"
const BIG := Vector2(132, 132)
const PANEL_BG := Color(1, 1, 1, 0.92)

var street_label: Label
var place_label: Label
var city_label: Label
var overlay_label: Label
var progress_bar: ProgressBar
var detail_label: Label  # step-by-step loading details under the bar
var _status_box: VBoxContainer
var _game_ui: Control
var _picker: Control
var _search_box: LineEdit
var _search_button: Button
var _results: VBoxContainer
var _picker_status: Label
var _confirm: Control
var _confirm_box: LineEdit
var _confirm_yes: Button
var _reset_button: Button
var _zoom_in: Button


func _ready() -> void:
	_build_game_ui()
	_build_picker()
	_build_confirm()
	_build_status()


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
	col.add_child(city_label)
	col.add_child(street_label)
	col.add_child(place_label)
	top.add_child(col)
	_game_ui.add_child(top)

	var zoom_col := VBoxContainer.new()
	zoom_col.add_theme_constant_override("separation", 16)
	zoom_col.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT, Control.PRESET_MODE_MINSIZE, 24)
	zoom_col.offset_bottom = -90
	zoom_col.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	zoom_col.grow_vertical = Control.GROW_DIRECTION_BEGIN
	for step in [1, -1]:
		var b := _button("+" if step > 0 else "−", BIG)
		b.add_theme_font_size_override("font_size", 64)
		b.pressed.connect(func(): zoom_changed.emit(step))
		if step > 0:
			_zoom_in = b
		zoom_col.add_child(b)
	_game_ui.add_child(zoom_col)

	var reset := _button("New city", Vector2(250, BIG.y))
	reset.add_theme_font_size_override("font_size", 34)
	reset.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT, Control.PRESET_MODE_MINSIZE, 24)
	reset.offset_bottom = -90
	reset.grow_vertical = Control.GROW_DIRECTION_BEGIN
	reset.pressed.connect(_open_confirm)
	_reset_button = reset
	_game_ui.add_child(reset)

	# Required by the OSM tile usage policy.
	var credit := _label("© OpenStreetMap contributors · OpenMapTiles · OpenFreeMap", 22, HORIZONTAL_ALIGNMENT_CENTER)
	credit.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE, Control.PRESET_MODE_MINSIZE, 20)
	credit.grow_vertical = Control.GROW_DIRECTION_BEGIN
	credit.add_theme_color_override("font_outline_color", Color.WHITE)
	credit.add_theme_constant_override("outline_size", 10)
	_game_ui.add_child(credit)


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
	col.add_child(_search_box)

	_search_button = _button("Search")
	_search_button.pressed.connect(_on_search)
	col.add_child(_search_button)

	_picker_status = _label("", 30, HORIZONTAL_ALIGNMENT_CENTER)
	col.add_child(_picker_status)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
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
	var text := _search_box.text.strip_edges()
	if text == "":
		return
	_search_box.release_focus()  # hides the on-screen keyboard
	_search_button.disabled = true
	_picker_status.text = "Searching…"
	for c in _results.get_children():
		c.queue_free()
	search_requested.emit(text)


func show_results(places: Array) -> void:
	_search_button.disabled = false
	_picker_status.text = "Tap a place" if places else "Nothing found. Check your connection or try another name."
	for p in places:
		var b := _button(p["name"])
		b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		b.add_theme_font_size_override("font_size", 32)
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.pressed.connect(func(): city_chosen.emit(p["name"].get_slice(",", 0), p["lat"], p["lon"], p.get("bbox", [])))
		_results.add_child(b)


func show_picker(message := "") -> void:
	_picker.visible = true
	_game_ui.visible = false
	_picker_status.text = message
	_search_button.disabled = false


func show_game(city: String) -> void:
	_picker.visible = false
	_game_ui.visible = true
	city_label.text = city


func set_street(street: String) -> void:
	street_label.text = "Walking along " + street if street != "" else "Wandering along an unnamed path"


## The place of note he is heading to or resting at; "" hides the line.
func set_place(name: String, resting: bool) -> void:
	place_label.visible = name != ""
	place_label.text = ("Resting at " if resting else "Walking to ") + name


func set_trip(city: String) -> void:
	street_label.text = "On the way to " + city


func is_confirm_open() -> bool:
	return _confirm.visible


func is_confirm_enabled() -> bool:
	return not _confirm_yes.disabled


## Controls the e2e test taps, by name.
func debug_controls() -> Dictionary:
	var first_result: Control = null
	for c in _results.get_children():
		if not c.is_queued_for_deletion():
			first_result = c as Control
			break
	return {
		"search_box": _search_box, "search_button": _search_button, "result0": first_result,
		"new_city": _reset_button, "zoom_in": _zoom_in,
		"confirm_box": _confirm_box, "confirm_yes": _confirm_yes,
	}
