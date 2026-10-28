## The Help screen over the whole game: a list of topics by section, and a
## page for each that replaces the list until Back is tapped. Text comes
## from help.gd.
extends ColorRect

const Help := preload("res://scripts/help.gd")

const PANEL_BG := Color(1, 1, 1, 0.97)
const TEXT := Color(0.1, 0.1, 0.1)

var back_button: Button
var close_button: Button
var first_topic: Button
var _title: Label
var _scroll: ScrollContainer
var _list: VBoxContainer
var _body: Label


func _init() -> void:
	color = Color(0, 0, 0, 0.6)
	set_anchors_preset(Control.PRESET_FULL_RECT)
	visible = false
	var box := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = PANEL_BG
	sb.set_corner_radius_all(24)
	sb.set_content_margin_all(24)
	box.add_theme_stylebox_override("panel", sb)
	box.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT, Control.PRESET_MODE_MINSIZE, 24)
	add_child(box)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 16)
	box.add_child(col)

	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 16)
	back_button = _button("Back", Vector2(170, 110))
	back_button.pressed.connect(show_list)
	head.add_child(back_button)
	_title = _label("Help", 40)
	_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(_title)
	close_button = _button("Close", Vector2(190, 110))
	close_button.pressed.connect(close)
	head.add_child(close_button)
	col.add_child(head)

	_scroll = ScrollContainer.new()
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	col.add_child(_scroll)
	var inner := VBoxContainer.new()
	inner.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.add_child(inner)

	_list = VBoxContainer.new()
	_list.add_theme_constant_override("separation", 12)
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	inner.add_child(_list)
	for s in Help.shared():
		var head_label := _label(s["title"], 30)
		head_label.add_theme_color_override("font_color", Color(0.45, 0.45, 0.45))
		_list.add_child(head_label)
		for p in s["pages"]:
			var b := _button(p["title"], Vector2(0, 110))
			b.add_theme_font_size_override("font_size", 34)
			b.alignment = HORIZONTAL_ALIGNMENT_LEFT
			b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			b.pressed.connect(show_page.bind(p["id"]))
			_list.add_child(b)
			if first_topic == null:
				first_topic = b

	_body = _label("", 30)
	_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	inner.add_child(_body)
	show_list()


func _label(text: String, size: int) -> Label:
	var l := Label.new()
	l.text = text
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", TEXT)
	return l


func _button(text: String, min_size: Vector2) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = min_size
	b.add_theme_font_size_override("font_size", 36)
	return b


## Opens on the topic list, or straight on the page `id`.
func open(id := "") -> void:
	visible = true
	if id == "":
		show_list()
	else:
		show_page(id)


func close() -> void:
	visible = false


func is_open() -> bool:
	return visible


func show_list() -> void:
	_title.text = "Help"
	_list.visible = true
	_body.visible = false
	back_button.visible = false
	_scroll.scroll_vertical = 0


func show_page(id: String) -> void:
	var p := Help.page(id)
	if p.is_empty():
		return
	_title.text = p["title"]
	_body.text = p["body"]
	_list.visible = false
	_body.visible = true
	back_button.visible = true
	_scroll.scroll_vertical = 0


## The open page's title, "Help" on the list.
func page_title() -> String:
	return _title.text


func page_text() -> String:
	return _body.text if _body.visible else ""
