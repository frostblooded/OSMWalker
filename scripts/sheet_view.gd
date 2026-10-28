## The Stats sheet over the whole game, styled like an RPG character sheet:
## parchment cards with icons for his level, meters, attributes, gear, bag
## and buffs. Fixed rows are built once and updated in place; the gear, bag
## and buff rows are rebuilt only when what they show changes.
extends ColorRect

const Stats := preload("res://scripts/stats.gd")
const Items := preload("res://scripts/items.gd")

const PARCHMENT := Color("#f4e9cf")
const CARD_BG := Color("#fffaf0")
const ZEBRA := Color("#f6edd8")
const WOOD := Color("#7a4f2a")
const GOLD := Color("#c99a3c")
const INK := Color("#2b1d10")
const DIM := Color("#5e5e5e")
const OK := Color("#2e9e44")
const ERROR := Color("#c01c28")
const LINK := Color("#1a5fb4")
const XP_COLOR := Color("#7b3fb3")
const METER_COLORS := {
	"health": Color("#d7263d"), "energy": Color("#f4b400"), "fullness": Color("#2e9e44"),
	"mood": Color("#e8608c"), "hygiene": Color("#1aa3a3"), "thirst": Color("#2f7fd6"),
}
const RARITY_COLORS := {
	"Common": Color("#5e5e5e"), "Uncommon": Color("#2e9e44"), "Rare": Color("#1f62c4"), "Legendary": Color("#c46a00"),
}
const ATTR_NAMES := {"str": "Strength", "cha": "Charm", "wit": "Wits", "luck": "Luck", "speed": "Speed"}
const ICON_DIR := "res://assets/icons/%s.svg"

var close_button: Button
var xp_bar: ProgressBar
var meter_bars := {}  # meter -> ProgressBar
var _level: Label
var _xp: Label
var _coins: Label
var _meter_values := {}  # meter -> Label
var _attr_values := {}  # attr -> Label
var _attr_bonus := {}  # attr -> Label, the part his gear adds
var _gear_rows: VBoxContainer
var _bag_rows: VBoxContainer
var _bag_count: Label
var _bag_toggle: Label
var _buff_rows: VBoxContainer
var _lists_sig := ""


func _init() -> void:
	color = Color(0, 0, 0, 0.6)
	set_anchors_preset(Control.PRESET_FULL_RECT)
	visible = false
	var frame := PanelContainer.new()
	frame.add_theme_stylebox_override("panel", _box(PARCHMENT, WOOD, 6, 24, 16))
	frame.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT, Control.PRESET_MODE_MINSIZE, 24)
	add_child(frame)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 16)
	frame.add_child(col)

	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 16)
	head.add_child(_icon("level", GOLD, 64))
	var title := _label("Character", 40, WOOD)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	head.add_child(title)
	close_button = Button.new()
	close_button.text = "Close"
	close_button.icon = _texture("close")
	close_button.expand_icon = false
	close_button.add_theme_constant_override("icon_max_width", 40)
	close_button.custom_minimum_size = Vector2(200, 110)
	close_button.add_theme_font_size_override("font_size", 34)
	close_button.pressed.connect(close)
	for state in ["normal", "hover", "pressed", "focus"]:
		close_button.add_theme_stylebox_override(state, _box(WOOD.lightened(0.15 if state == "hover" else 0.0), GOLD, 3, 16, 12))
	for state in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		close_button.add_theme_color_override(state, PARCHMENT)
	close_button.add_theme_color_override("icon_normal_color", PARCHMENT)
	close_button.add_theme_color_override("icon_hover_color", PARCHMENT)
	close_button.add_theme_color_override("icon_pressed_color", PARCHMENT)
	head.add_child(close_button)
	col.add_child(head)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	col.add_child(scroll)
	var cards := VBoxContainer.new()
	cards.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cards.add_theme_constant_override("separation", 16)
	scroll.add_child(cards)

	cards.add_child(_build_header())
	cards.add_child(_build_meters())
	cards.add_child(_build_attrs())
	var gear := _card("gear", "Gear")
	_gear_rows = _rows()
	gear[1].add_child(_gear_rows)
	cards.add_child(gear[0])
	cards.add_child(_build_bag())
	var buffs := _card("buff", "Effects")
	_buff_rows = _rows()
	buffs[1].add_child(_buff_rows)
	cards.add_child(buffs[0])
	var credit := _label("Icons by Lorc, Delapouite & co. at game-icons.net (CC BY 3.0)", 24, DIM)
	credit.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	cards.add_child(credit)


func close() -> void:
	visible = false


## Shows `stats` (a Stats).
func fill(stats: RefCounted) -> void:
	var need: int = stats.xp_to_next(stats.level)
	_level.text = "Level %d" % stats.level
	_xp.text = "%d / %d XP" % [stats.xp, need]
	xp_bar.max_value = need
	xp_bar.value = stats.xp
	_coins.text = "%d" % stats.coins
	for m in meter_bars:
		var v := roundf(stats.meters[m])
		meter_bars[m].value = v
		_meter_values[m].text = "%d" % v
	for a in _attr_values:
		var total: float = stats.attr(a)
		var bonus: float = total - float(stats.attrs[a])
		_attr_values[a].text = "%.1f" % total
		_attr_bonus[a].text = "+%.1f gear" % bonus
		_attr_bonus[a].visible = bonus > 0.05
	var sig := var_to_str([stats.gear, stats.bag, stats.buffs.map(func(b): return [b["name"], ceili(b["left"])])])
	if sig != _lists_sig:
		_lists_sig = sig
		_fill_gear(stats)
		_fill_bag(stats)
		_fill_buffs(stats)


## Every visible text on the sheet, for tests.
func texts() -> Array:
	return labels().map(func(l): return l.text)


func labels() -> Array:
	return _all(self, func(c): return c is Label and _shown(c))


func icons() -> Array:
	return _all(self, func(c): return c is TextureRect and _shown(c))


## Visible within the sheet, whether or not the sheet itself is open.
func _shown(c: Node) -> bool:
	while c != self:
		if c is CanvasItem and not c.visible:
			return false
		c = c.get_parent()
	return true


func find_label(text: String) -> Label:
	for l in labels():
		if l.text == text:
			return l
	return null


func _build_header() -> Control:
	var card := PanelContainer.new()
	card.add_theme_stylebox_override("panel", _box(CARD_BG, GOLD, 3, 16, 16))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 16)
	card.add_child(row)
	var info := VBoxContainer.new()
	info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	info.add_theme_constant_override("separation", 8)
	row.add_child(info)
	_level = _label("", 40, INK)
	info.add_child(_level)
	var xp_row := HBoxContainer.new()
	xp_row.add_theme_constant_override("separation", 12)
	xp_row.add_child(_icon("xp", XP_COLOR, 40))
	xp_bar = _bar(XP_COLOR)
	xp_row.add_child(xp_bar)
	info.add_child(xp_row)
	_xp = _label("", 26, DIM)
	info.add_child(_xp)
	var purse := VBoxContainer.new()
	purse.alignment = BoxContainer.ALIGNMENT_CENTER
	purse.add_child(_icon("coins", GOLD, 64))
	_coins = _label("", 32, INK)
	_coins.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	purse.add_child(_coins)
	var coins_word := _label("coins", 24, DIM)
	coins_word.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	purse.add_child(coins_word)
	row.add_child(purse)
	return card


func _build_meters() -> Control:
	var card := _card("vitals", "Vitals")
	for m in Stats.METERS:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 12)
		row.add_child(_icon(m, METER_COLORS[m], 48))
		var name_label := _label(m.capitalize(), 28, INK)
		name_label.custom_minimum_size.x = 150
		name_label.autowrap_mode = TextServer.AUTOWRAP_OFF
		row.add_child(name_label)
		var bar := _bar(METER_COLORS[m])
		bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(bar)
		meter_bars[m] = bar
		var value := _label("", 28, INK)
		value.custom_minimum_size.x = 64
		value.autowrap_mode = TextServer.AUTOWRAP_OFF
		value.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		row.add_child(value)
		_meter_values[m] = value
		card[1].add_child(row)
	return card[0]


func _build_attrs() -> Control:
	var card := _card("attrs", "Attributes")
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 12)
	grid.add_theme_constant_override("v_separation", 12)
	for a in Stats.ATTRS:
		var tile := PanelContainer.new()
		tile.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		tile.add_theme_stylebox_override("panel", _box(ZEBRA, Color.TRANSPARENT, 0, 12, 12))
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 12)
		row.add_child(_icon(a if ResourceLoader.exists(ICON_DIR % a) else "attrs", WOOD, 56))
		var texts := VBoxContainer.new()
		texts.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		texts.add_child(_label(ATTR_NAMES.get(a, a.capitalize()), 26, DIM))
		var value := _label("", 34, INK)
		texts.add_child(value)
		var bonus := _label("", 24, OK)
		texts.add_child(bonus)
		row.add_child(texts)
		tile.add_child(row)
		grid.add_child(tile)
		_attr_values[a] = value
		_attr_bonus[a] = bonus
	card[1].add_child(grid)
	return card[0]


## The bag card: tap its heading to fold the list away.
func _build_bag() -> Control:
	var card := _card("items", "Bag")
	var heading: HBoxContainer = card[1].get_child(0)
	_bag_count = _label("", 28, DIM)
	_bag_count.autowrap_mode = TextServer.AUTOWRAP_OFF
	heading.add_child(_bag_count)
	_bag_toggle = _label("Hide", 28, LINK)
	_bag_toggle.autowrap_mode = TextServer.AUTOWRAP_OFF
	heading.add_child(_bag_toggle)
	heading.custom_minimum_size.y = 96
	heading.mouse_filter = Control.MOUSE_FILTER_STOP
	heading.gui_input.connect(func(e):
		if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT:
			_bag_rows.visible = not _bag_rows.visible
			_bag_toggle.text = "Hide" if _bag_rows.visible else "Show")
	_bag_rows = _rows()
	card[1].add_child(_bag_rows)
	return card[0]


func _fill_gear(stats: RefCounted) -> void:
	_clear(_gear_rows)
	for i in Items.SLOTS.size():
		var slot: String = Items.SLOTS[i]
		var it: Dictionary = stats.gear.get(slot, {})
		if it.is_empty():
			_gear_rows.add_child(_item_row(i, slot, slot.capitalize(), "Empty", DIM, ""))
		else:
			_gear_rows.add_child(_item_row(i, slot, slot.capitalize(), it["name"], _rarity_color(it), it["rarity"]))


func _fill_bag(stats: RefCounted) -> void:
	_clear(_bag_rows)
	_bag_count.text = "%d / %d" % [stats.bag.size(), Stats.BAG_SIZE]
	for i in stats.bag.size():
		var it: Dictionary = stats.bag[i]
		_bag_rows.add_child(_item_row(i, it["slot"], "", it["name"], _rarity_color(it), it["rarity"]))
	if stats.bag.is_empty():
		_bag_rows.add_child(_label("Nothing in his bag yet", 26, DIM))


func _fill_buffs(stats: RefCounted) -> void:
	_clear(_buff_rows)
	for i in stats.buffs.size():
		var b: Dictionary = stats.buffs[i]
		var good := _is_good(b)
		var row := _zebra_row(i)
		var line: HBoxContainer = row.get_child(0)
		line.add_child(_icon("buff" if good else "debuff", OK if good else ERROR, 48))
		var name_label := _label(b["name"], 28, INK)
		name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		line.add_child(name_label)
		line.add_child(_icon("time", DIM, 40))
		var left := _label("%d min" % ceili(b["left"]), 28, INK)
		left.autowrap_mode = TextServer.AUTOWRAP_OFF
		line.add_child(left)
		_buff_rows.add_child(row)
	if stats.buffs.is_empty():
		_buff_rows.add_child(_label("No effects right now", 26, DIM))


## A buff that takes more than it gives counts as bad.
static func _is_good(b: Dictionary) -> bool:
	var sum := 0.0
	for m in b.get("per_h", {}):
		sum += float(b["per_h"][m])
	return sum >= 0.0 and float(b.get("xp_mult", 1.0)) >= 1.0


func _item_row(i: int, slot: String, slot_name: String, item_name: String, tint: Color, rarity: String) -> Control:
	var row := _zebra_row(i)
	var line: HBoxContainer = row.get_child(0)
	line.add_child(_icon(slot if ResourceLoader.exists(ICON_DIR % slot) else "gear", WOOD, 48))
	var texts := VBoxContainer.new()
	texts.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if slot_name != "":
		texts.add_child(_label(slot_name, 24, DIM))
	texts.add_child(_label(item_name, 28, tint))
	line.add_child(texts)
	if rarity != "":
		var r := _label(rarity, 24, tint)
		r.autowrap_mode = TextServer.AUTOWRAP_OFF
		r.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		line.add_child(r)
	return row


## Rows alternate their background so the eye keeps its place.
func _zebra_row(i: int) -> PanelContainer:
	var row := PanelContainer.new()
	row.add_theme_stylebox_override("panel", _box(ZEBRA if i % 2 == 0 else CARD_BG, Color.TRANSPARENT, 0, 12, 12))
	var line := HBoxContainer.new()
	line.add_theme_constant_override("separation", 12)
	row.add_child(line)
	return row


static func _rarity_color(it: Dictionary) -> Color:
	return RARITY_COLORS.get(it.get("rarity", ""), INK)


## [card, its column]: a framed card whose first row is an icon and a title.
func _card(icon: String, title: String) -> Array:
	var card := PanelContainer.new()
	card.add_theme_stylebox_override("panel", _box(CARD_BG, GOLD, 3, 16, 16))
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 12)
	card.add_child(col)
	var heading := HBoxContainer.new()
	heading.add_theme_constant_override("separation", 12)
	heading.add_child(_icon(icon, WOOD, 48))
	var t := _label(title, 32, WOOD)
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	t.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	heading.add_child(t)
	col.add_child(heading)
	return [card, col]


func _rows() -> VBoxContainer:
	var rows := VBoxContainer.new()
	rows.add_theme_constant_override("separation", 8)
	return rows


func _bar(tint: Color) -> ProgressBar:
	var bar := ProgressBar.new()
	bar.show_percentage = false
	bar.custom_minimum_size = Vector2(0, 32)
	bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bar.add_theme_stylebox_override("background", _box(Color("#e6d6b0"), Color.TRANSPARENT, 0, 8, 0))
	bar.add_theme_stylebox_override("fill", _box(tint, Color.TRANSPARENT, 0, 8, 0))
	return bar


func _icon(key: String, tint: Color, px: int) -> TextureRect:
	var r := TextureRect.new()
	r.texture = _texture(key)
	r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	r.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	r.custom_minimum_size = Vector2(px, px)
	r.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	r.modulate = tint
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return r


static func _texture(key: String) -> Texture2D:
	return load(ICON_DIR % key)


func _label(text: String, px: int, tint: Color) -> Label:
	var l := Label.new()
	l.text = text
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.add_theme_font_size_override("font_size", px)
	l.add_theme_color_override("font_color", tint)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


static func _box(bg: Color, border: Color, border_px: int, radius: int, pad: int) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.border_color = border
	sb.set_border_width_all(border_px)
	sb.set_corner_radius_all(radius)
	sb.set_content_margin_all(pad)
	return sb


static func _clear(box: Node) -> void:
	for c in box.get_children():
		box.remove_child(c)
		c.queue_free()


static func _all(node: Node, keep: Callable) -> Array:
	var out := []
	for c in node.get_children():
		if keep.call(c):
			out.append(c)
		out.append_array(_all(c, keep))
	return out
