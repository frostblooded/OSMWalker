## The Stats sheet: an RPG character sheet of cards with icons, coloured
## bars and rows instead of one block of text.
extends GutTest

const Stats := preload("res://scripts/stats.gd")
const SheetView := preload("res://scripts/sheet_view.gd")

var stats: Stats
var sheet: SheetView


func before_each() -> void:
	stats = Stats.new()
	sheet = SheetView.new()
	add_child_autofree(sheet)


static func _sword() -> Dictionary:
	return {"name": "Bronze Sword", "slot": "weapon", "stats": {"str": 2.0}, "rarity": "Rare", "price": 40}


func test_header_shows_level_xp_and_coins() -> void:
	stats.level = 3
	stats.xp = 120
	stats.coins = 77
	sheet.fill(stats)
	var t := sheet.texts()
	assert_has(t, "Level 3")
	assert_has(t, "120 / 300 XP")
	assert_has(t, "77")
	assert_eq(sheet.xp_bar.value, 120.0)
	assert_eq(sheet.xp_bar.max_value, 300.0)


func test_every_meter_has_an_icon_a_coloured_bar_and_its_value() -> void:
	stats.meters["mood"] = 42.4
	sheet.fill(stats)
	for m in Stats.METERS:
		var bar: ProgressBar = sheet.meter_bars[m]
		assert_eq(bar.value, roundf(stats.meters[m]), m)
		var fill: StyleBoxFlat = bar.get_theme_stylebox("fill")
		assert_eq(fill.bg_color, SheetView.METER_COLORS[m], m + " has its own colour")
	assert_has(sheet.texts(), "42")
	assert_has(sheet.texts(), "Mood")


func test_attributes_count_his_gear() -> void:
	stats.attrs["str"] = 1.5
	stats.equip(_sword())
	sheet.fill(stats)
	var t := sheet.texts()
	assert_has(t, "Strength")
	assert_has(t, "3.5")
	assert_has(t, "+2.0 gear")


func test_gear_lists_every_slot_with_worn_items_in_their_rarity_colour() -> void:
	stats.equip(_sword())
	sheet.fill(stats)
	var t := sheet.texts()
	assert_has(t, "Bronze Sword")
	assert_has(t, "Rare")
	assert_has(t, "Empty")
	var name_label: Label = sheet.find_label("Bronze Sword")
	assert_eq(name_label.get_theme_color("font_color"), SheetView.RARITY_COLORS["Rare"])


func test_bag_lists_items_with_a_count() -> void:
	stats.bag.append({"name": "Copper Ring", "slot": "trinket", "stats": {"luck": 1.0}, "rarity": "Common", "price": 15})
	sheet.fill(stats)
	assert_has(sheet.texts(), "Copper Ring")
	assert_has(sheet.texts(), "1 / %d" % Stats.BAG_SIZE)


func test_buffs_show_minutes_left() -> void:
	stats.buffs.append({"name": "Caffeine rush", "left": 11.2, "per_h": {"energy": 5.0}, "xp_mult": 1.0})
	sheet.fill(stats)
	assert_has(sheet.texts(), "Caffeine rush")
	assert_has(sheet.texts(), "12 min")


func test_no_more_pointer_to_history() -> void:
	sheet.fill(stats)
	for t in sheet.texts():
		assert_false("History" in t, t)


func test_every_row_has_an_icon() -> void:
	stats.equip(_sword())
	sheet.fill(stats)
	await wait_frames(2)
	assert_gt(sheet.icons().size(), 20)
	for icon in sheet.icons():
		assert_not_null(icon.texture)
		assert_gte(icon.size.x, 40.0)


func test_text_is_big_enough_and_close_is_easy_to_tap() -> void:
	stats.equip(_sword())
	sheet.fill(stats)
	await wait_frames(2)
	for l in sheet.labels():
		assert_gte(l.get_theme_font_size("font_size"), 24, l.text)
	assert_gte(sheet.close_button.size.y, 96.0)
	assert_gte(sheet.close_button.size.x, 96.0)


func test_refilling_does_not_pile_up_rows() -> void:
	sheet.fill(stats)
	var n := sheet.texts().size()
	sheet.fill(stats)
	await wait_frames(1)
	assert_eq(sheet.texts().size(), n)


func test_credits_the_icon_artists() -> void:
	sheet.fill(stats)
	assert_true(sheet.texts().any(func(t): return "game-icons.net" in t))
