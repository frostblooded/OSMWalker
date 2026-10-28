## Procedural items: base + material + modifiers, rarer with more modifiers;
## his bag and gear.
extends GutTest

const Items := preload("res://scripts/items.gd")
const Stats := preload("res://scripts/stats.gd")
const Hud := preload("res://scripts/hud.gd")

var rng := RandomNumberGenerator.new()
var stats: Stats


func before_each() -> void:
	rng.seed = 7
	stats = Stats.new()


static func _sword(power: float, price := 40) -> Dictionary:
	return {"name": "Bronze Sword", "slot": "weapon", "stats": {"str": power}, "rarity": "Common", "price": price}


func test_rarity_comes_from_the_modifier_count() -> void:
	assert_eq(Items.modifier_count(0.0), 0)
	assert_eq(Items.modifier_count(0.59), 0)
	assert_eq(Items.modifier_count(0.61), 1)
	assert_eq(Items.modifier_count(0.89), 2)
	assert_eq(Items.modifier_count(0.99), 3)
	assert_eq(Items.RARITY, ["Common", "Uncommon", "Rare", "Legendary"])


func test_items_have_a_name_slot_stats_and_price() -> void:
	for s in 50:
		rng.seed = s
		var it := Items.make("weapons", 1, rng)
		assert_true(Items.SLOTS.has(it["slot"]), str(it))
		assert_gt(it["price"], 0)
		assert_false(it["stats"].is_empty(), str(it))
		assert_true(Items.RARITY.has(it["rarity"]))
		assert_ne(it["name"], "")


func test_modifiers_show_in_the_name_and_add_stats() -> void:
	var plain := Items.build({"base": "Sword", "slot": "weapon", "stat": "str", "price": 20}, Items.MATERIALS[2], [])
	var mighty := Items.build({"base": "Sword", "slot": "weapon", "stat": "str", "price": 20}, Items.MATERIALS[2], [Items.PREFIXES[0], Items.SUFFIXES[1]])
	assert_eq(plain["name"], "Bronze Sword")
	assert_eq(mighty["name"], "Mighty Bronze Sword of the Fox")
	assert_eq(mighty["rarity"], "Rare")
	assert_gt(mighty["stats"]["str"], plain["stats"]["str"])
	assert_gt(mighty["stats"]["wit"], 0.0)
	assert_gt(mighty["price"], plain["price"])


func test_better_materials_unlock_with_level() -> void:
	for s in 50:
		rng.seed = s
		var it := Items.make("weapons", 1, rng)
		assert_false(it["name"].contains("Steel") or it["name"].contains("Mithril"), it["name"])


func test_each_shop_kind_sells_its_own_things() -> void:
	for s in 30:
		rng.seed = s
		assert_true(["body", "feet", "head", "bag"].has(Items.make("clothes", 3, rng)["slot"]))
		assert_eq(Items.make("trinkets", 3, rng)["slot"], "trinket")


func test_gear_adds_to_his_attributes() -> void:
	stats.equip(_sword(2.0))
	assert_eq(stats.attr("str"), stats.attrs["str"] + 2.0)
	assert_true(stats.can_do({"name": "Arm wrestle", "min": 1, "needs": {"str": 3}}, 12))


func test_buys_an_item_that_beats_his_gear_and_bags_the_old_one() -> void:
	stats.coins = 200
	stats.equip(_sword(1.0))
	var line := stats.buy(_sword(3.0, 50), "Arms & Co")
	assert_eq(stats.coins, 150)
	assert_eq(stats.gear["weapon"]["stats"]["str"], 3.0)
	assert_eq(stats.bag.size(), 1)
	assert_string_contains(line, "Bought")
	assert_string_contains(line, "Arms & Co")


func test_will_not_buy_worse_gear_or_go_skint_for_it() -> void:
	stats.equip(_sword(3.0))
	stats.coins = 200
	assert_string_contains(stats.buy(_sword(1.0, 10), "Shop"), "didn't buy")
	assert_eq(stats.coins, 200)
	stats.unequip("weapon")
	stats.coins = 30
	assert_string_contains(stats.buy(_sword(1.0, 20), "Shop"), "didn't buy")
	assert_eq(stats.coins, 30)


func test_full_bag_sells_the_cheapest_item() -> void:
	stats.coins = 10000
	stats.gear["weapon"] = _sword(0.4, 50)
	for i in Stats.BAG_SIZE:
		stats.bag.append(_sword(0.5, 10 + i))
	stats.buy(_sword(5.0, 100), "Shop")
	assert_eq(stats.bag.size(), Stats.BAG_SIZE)
	assert_false(stats.bag.any(func(it): return it["price"] == 10), "the 10c sword went")


func test_sells_loot_for_part_of_its_price() -> void:
	stats.bag.append(_sword(1.0, 100))
	var before := stats.coins
	var line := stats.sell_loot("Pawn shop")
	assert_eq(stats.bag.size(), 0)
	assert_between(stats.coins - before, 40, 60)
	assert_string_contains(line, "Sold")


func test_shop_actions_offer_an_item() -> void:
	stats.coins = 500
	var line := stats.do({"name": "Browse the weapons", "min": 15, "item": "weapons"}, "Arms & Co", rng)
	assert_false(stats.gear.is_empty(), line)
	assert_string_contains(line, "Arms & Co")


func test_gear_and_bag_survive_save_and_load() -> void:
	stats.equip(_sword(2.0))
	stats.bag.append(_sword(1.0))
	var back := Stats.new()
	back.load_dict(JSON.parse_string(JSON.stringify(stats.to_dict())))
	assert_eq(back.gear["weapon"]["name"], "Bronze Sword")
	assert_eq(back.attr("str"), stats.attr("str"))
	assert_eq(back.bag.size(), 1)


func test_bundled_item_shops_use_known_kinds() -> void:
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/actions.json"))
	var seen := 0
	for key in data:
		for a in data[key]:
			if a.has("item"):
				seen += 1
				assert_true(Items.KINDS.has(a["item"]), "%s: %s" % [key, a["item"]])
	assert_gt(seen, 5)


func test_no_shopping_when_skint_or_selling_an_empty_bag() -> void:
	stats.coins = Stats.KEEP_COINS
	assert_false(stats.can_do({"name": "Browse", "min": 15, "item": "weapons"}, 12))
	stats.coins = 100
	assert_true(stats.can_do({"name": "Browse", "min": 15, "item": "weapons"}, 12))
	assert_false(stats.can_do({"name": "Sell", "min": 10, "sell": true}, 12))
	stats.bag.append(_sword(1.0))
	assert_true(stats.can_do({"name": "Sell", "min": 10, "sell": true}, 12))


func test_sheet_lists_gear_and_bag() -> void:
	stats.equip(_sword(2.0))
	stats.bag.append({"name": "Copper Ring", "slot": "trinket", "stats": {"luck": 1.0}, "rarity": "Common", "price": 15})
	var text := Hud.sheet_text(stats)
	assert_string_contains(text, "Weapon: Bronze Sword")
	assert_string_contains(text, "Copper Ring")
