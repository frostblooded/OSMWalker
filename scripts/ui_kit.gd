## Shared building blocks for every screen, so they all look alike and
## follow docs/ui-guidelines.md: colours, text sizes, cards with an icon and
## a heading, key/value rows, zebra-striped list rows, collapsible sections
## and the icon fonts.
extends RefCounted

const TouchScroll := preload("res://scripts/touch_scroll.gd")

## Text sizes: title, heading, body, small. Nothing smaller than SMALL.
const TITLE := 40
const HEADING := 32
const BODY := 28
const SMALL := 24
## Spacing scale.
const S1 := 8
const S2 := 12
const S3 := 16
const S4 := 24
## Tap targets.
const TAP := 96
const TAP_BIG := 110

## One meaning per colour (always with an icon or word too).
const INK := Color("#1d1d1f")  # main text and values
const DIM := Color("#5e5e5e")  # labels and details
const ERROR := Color("#c01c28")
const WARNING := Color("#b86e00")
const OK := Color("#2e9e44")
const LINK := Color("#1a5fb4")
const CARD_BG := Color("#ffffff")
const ROW_A := Color("#f4f4f6")  # zebra rows
const ROW_B := Color("#ffffff")
const EDGE := Color("#dcdce0")

## Icons used across the game; the same thing always gets the same icon.
const ICON := {
	"error": "✖", "warning": "⚠", "ok": "✔", "info": "ℹ",
	"city": "🏙", "place": "📍", "dice": "🎲", "trip": "✈", "map": "🗺",
	"goal": "🎯", "log": "📜", "time": "🕒", "walk": "🚶", "money": "💰",
	"open": "▾", "closed": "▸", "menu": "☰",
}

const FONTS := ["res://assets/fonts/NotoEmoji.ttf", "res://assets/fonts/NotoSansSymbols2-Regular.ttf"]

static var _fonts_installed := false


## The game's font has no emoji or symbols: adds fonts that do as fallbacks.
static func install_icon_fonts() -> void:
	if _fonts_installed:
		return
	_fonts_installed = true
	var fallbacks := []
	for path in FONTS:
		fallbacks.append(load(path))
	ThemeDB.fallback_font.fallbacks = fallbacks


static func label(text: String, size := BODY, color := INK) -> Label:
	var l := Label.new()
	l.text = text
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	return l


static func box(color: Color, radius := 16, pad := S3, edge := Color.TRANSPARENT) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = color
	sb.set_corner_radius_all(radius)
	sb.set_content_margin_all(pad)
	if edge.a > 0.0:
		sb.border_color = edge
		sb.set_border_width_all(2)
	return sb


## A card: a heading row (icon, title, optional value on the right) over a
## column for its content. Returns {card, body, value}.
static func card(icon: String, title: String, value := "", tint := INK) -> Dictionary:
	var c := PanelContainer.new()
	c.add_theme_stylebox_override("panel", box(CARD_BG, 18, S3, EDGE))
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", S1)
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", S2)
	var ic := label(icon, HEADING, tint)
	ic.autowrap_mode = TextServer.AUTOWRAP_OFF
	head.add_child(ic)
	var t := label(title, HEADING, tint)
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(t)
	var v := label(value, HEADING, tint)
	v.autowrap_mode = TextServer.AUTOWRAP_OFF
	v.visible = value != ""
	head.add_child(v)
	col.add_child(head)
	var body := VBoxContainer.new()
	body.add_theme_constant_override("separation", S1)
	col.add_child(body)
	c.add_child(col)
	return {"card": c, "body": body, "value": v}


## "Label ........ value": a dim label on the left, a bold value on the right.
static func kv_row(key: String, value: String, value_color := INK) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", S2)
	var k := label(key, BODY, DIM)
	k.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(k)
	var v := label(value, BODY, value_color)
	v.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.size_flags_stretch_ratio = 0.8
	row.add_child(v)
	return row


## Row `i` of a list, on alternating backgrounds. Put the row's content in
## the returned container.
static func zebra(i: int) -> PanelContainer:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", box(ROW_A if i % 2 == 0 else ROW_B, 12, S2))
	return p


## A section that opens and closes when its heading is tapped. The heading
## is a full-width button with the title on the left and ▸ / ▾ on the right.
## Returns {root, header, body}; the body is hidden while closed.
static func collapsible(title: String, open := false, size := HEADING, color := INK) -> Dictionary:
	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", S1)
	var header := Button.new()
	header.flat = true
	header.alignment = HORIZONTAL_ALIGNMENT_LEFT
	header.custom_minimum_size = Vector2(0, TAP)
	header.mouse_filter = Control.MOUSE_FILTER_PASS  # drags still scroll the list
	header.add_theme_font_size_override("font_size", size)
	for state in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]:
		header.add_theme_color_override(state, color)
	header.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	var body := VBoxContainer.new()
	body.add_theme_constant_override("separation", S1)
	root.add_child(header)
	root.add_child(body)
	var set_open := func(o: bool) -> void:
		body.visible = o
		header.text = "%s  %s" % [ICON["open"] if o else ICON["closed"], title]
	set_open.call(open)
	header.pressed.connect(func():
		var scroll := scroll_of(header)
		if scroll and scroll.is_dragging():
			return
		set_open.call(not body.visible))
	return {"root": root, "header": header, "body": body}


## The scroll list `n` sits in, or null.
static func scroll_of(n: Node) -> TouchScroll:
	var p := n.get_parent()
	while p:
		if p is TouchScroll:
			return p
		p = p.get_parent()
	return null


## A vertical scroll list that follows the finger.
static func scroll() -> TouchScroll:
	var s := TouchScroll.new()
	s.size_flags_vertical = Control.SIZE_EXPAND_FILL
	return s
