## The Help screen over the whole game: a card per section with its topics,
## and a page for each topic that replaces the list until Back is tapped.
## A page is a card per paragraph; its "- " lines are striped rows. Text
## comes from help.gd; layout follows docs/ui-guidelines.md.
extends ColorRect

const Help := preload("res://scripts/help.gd")
const UiKit := preload("res://scripts/ui_kit.gd")

const PANEL_BG := Color(1, 1, 1, 0.97)
const TEXT := UiKit.INK
const LABEL := UiKit.DIM
const TITLE_SIZE := UiKit.TITLE
const HEADING_SIZE := UiKit.HEADING
const BODY_SIZE := UiKit.BODY

var back_button: Button
var close_button: Button
var first_topic: Button
var _title: Label
var _scroll: UiKit.TouchScroll
var _list: VBoxContainer
var _page: VBoxContainer
var _page_text := ""
var _rows := []  # striped rows on the open page


func _init() -> void:
	color = Color(0, 0, 0, 0.6)
	set_anchors_preset(Control.PRESET_FULL_RECT)
	visible = false
	var box := PanelContainer.new()
	box.add_theme_stylebox_override("panel", UiKit.box(PANEL_BG, 24, UiKit.S4))
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
	_title = _label("Help", TITLE_SIZE, TEXT)
	_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(_title)
	close_button = _button("Close", Vector2(190, 110))
	close_button.pressed.connect(close)
	head.add_child(close_button)
	col.add_child(head)

	_scroll = UiKit.scroll()
	col.add_child(_scroll)
	var inner := VBoxContainer.new()
	inner.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.add_child(inner)

	_list = _column(16)
	inner.add_child(_list)
	for s in Help.shared():
		var card := _card()
		var items := _column(12)
		items.add_child(_label(s["title"], HEADING_SIZE, LABEL))
		for p in s["pages"]:
			var b := _button(p["title"], Vector2(0, 110))
			b.add_theme_font_size_override("font_size", 30)
			b.alignment = HORIZONTAL_ALIGNMENT_LEFT
			b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			b.mouse_filter = Control.MOUSE_FILTER_PASS  # drags on a topic still scroll the list
			b.pressed.connect(func(): if not _scroll.is_dragging(): show_page(p["id"]))
			items.add_child(b)
			if first_topic == null:
				first_topic = b
		card.add_child(items)
		_list.add_child(card)

	_page = _column(16)
	inner.add_child(_page)
	show_list()


func _column(gap: int) -> VBoxContainer:
	var c := VBoxContainer.new()
	c.add_theme_constant_override("separation", gap)
	c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return c


func _card() -> PanelContainer:
	var p := PanelContainer.new()
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE  # drags on it still scroll the list
	p.add_theme_stylebox_override("panel", UiKit.box(UiKit.CARD_BG, 18, UiKit.S3, UiKit.EDGE))
	p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return p


func _label(text: String, size: int, tint: Color) -> Label:
	var l := Label.new()
	l.text = text
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", tint)
	return l


func _button(text: String, min_size: Vector2) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = min_size
	b.add_theme_font_size_override("font_size", 34)
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
	_page.visible = false
	back_button.visible = false
	_scroll.scroll_vertical = 0


func show_page(id: String) -> void:
	var p := Help.page(id)
	if p.is_empty():
		return
	_title.text = p["title"]
	_page_text = p["body"]
	for c in _page.get_children():
		_page.remove_child(c)
		c.queue_free()
	_rows = []
	for b in Help.blocks(p["body"]):
		var card := _card()
		var col := _column(8)
		if b["text"] != "":
			col.add_child(_label(b["text"], BODY_SIZE, TEXT))
		for i in b["items"].size():
			var item: String = b["items"][i]
			var row := UiKit.zebra(i)
			row.add_child(_label(item, BODY_SIZE, TEXT))
			col.add_child(row)
			_rows.append(row)
		card.add_child(col)
		_page.add_child(card)
	_list.visible = false
	_page.visible = true
	back_button.visible = true
	_scroll.scroll_vertical = 0


## The open page's title, "Help" on the list.
func page_title() -> String:
	return _title.text


func page_text() -> String:
	return _page_text if _page.visible else ""


## The striped list rows on the open page, top to bottom.
func list_rows() -> Array:
	return _rows
