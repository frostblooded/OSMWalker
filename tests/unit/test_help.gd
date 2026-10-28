extends GutTest

const Help := preload("res://scripts/help.gd")
const Stats := preload("res://scripts/stats.gd")
const Items := preload("res://scripts/items.gd")
const Trips := preload("res://scripts/trips.gd")

const SAMPLE := """# Basics
## How he walks {walking}
He walks {SPEED} a minute.

Second paragraph.
## Coins {coins}
Money.
# Stats
## Health {health}
Hit points.
"""


func test_parse_splits_sections_and_pages() -> void:
	var s := Help.parse(SAMPLE)
	assert_eq(s.size(), 2)
	assert_eq(s[0]["title"], "Basics")
	assert_eq(s[0]["pages"].map(func(p): return p["id"]), ["walking", "coins"])
	assert_eq(s[0]["pages"][0]["title"], "How he walks")
	assert_eq(s[0]["pages"][0]["body"], "He walks {SPEED} a minute.\n\nSecond paragraph.")
	assert_eq(s[1]["pages"][0]["title"], "Health")


func test_fill_puts_in_the_numbers() -> void:
	assert_eq(Help.fill("He walks {SPEED} a minute, {SPEED}.", {"SPEED": "200 m"}), "He walks 200 m a minute, 200 m.")


func test_unknown_placeholders_are_reported() -> void:
	assert_eq(Help.unknown_keys("{A} and {B2} and {A} on {page}", {"A": "1"}), ["B2"], "page ids are not placeholders")


func test_every_placeholder_in_the_help_has_a_value() -> void:
	var text := FileAccess.get_file_as_string(Help.PATH)
	assert_eq(Help.unknown_keys(text, Help.values()), [])


func test_numbers_come_from_the_game() -> void:
	var v := Help.values()
	assert_eq(v["FULLNESS_PER_H"], "5")
	assert_eq(v["ENERGY_PER_KM"], Help.num(Stats.ENERGY_PER_KM))
	assert_eq(v["HOSPITAL_FEE"], str(Stats.HOSPITAL_FEE))
	assert_eq(v["BAG_SIZE"], str(Stats.BAG_SIZE))
	assert_eq(v["COUNTRY_PCT"], "5%")
	assert_eq(v["CITY_PCT"], "20%")
	assert_eq(v["SPEED_M_PER_MIN"], "200")


func _ids() -> Array:
	var ids := []
	for s in Help.shared():
		for p in s["pages"]:
			ids.append(p["id"])
	return ids


func test_every_stat_has_its_own_page() -> void:
	var ids := _ids()
	for m in Stats.METERS + Stats.ATTRS:
		assert_has(ids, m, "%s has a Help page" % m)


func test_every_mechanic_has_a_page() -> void:
	var ids := _ids()
	for id in ["walking", "goal", "places", "countdown", "actions", "choosing", "needs", "coins", "buffs",
			"xp", "items", "materials", "modifiers", "bag", "fainting", "trips", "stations", "fares", "flavour", "trivia", "offline",
			"history", "debug", "new_city", "menu", "map"]:
		assert_has(ids, id, "%s has a Help page" % id)


func test_page_ids_are_unique_and_pages_are_filled() -> void:
	var ids := _ids()
	for id in ids:
		assert_eq(ids.count(id), 1, "%s is used once" % id)
	for s in Help.shared():
		for p in s["pages"]:
			assert_gt(p["body"].length(), 80, "%s explains itself" % p["id"])
			assert_false(p["body"].contains("{"), "%s has every number filled in" % p["id"])


func test_every_gear_slot_and_rarity_is_explained() -> void:
	var text := FileAccess.get_file_as_string(Help.PATH).to_lower()
	for slot in Items.SLOTS:
		assert_string_contains(text, slot)
	for r in Items.RARITY:
		assert_string_contains(text, r.to_lower())
	for m in Items.MATERIALS:
		assert_string_contains(text, m["metal"].to_lower())
		assert_string_contains(text, m["cloth"].to_lower())


func test_a_page_splits_into_cards_with_list_rows() -> void:
	var b := Help.blocks("First para.\n\nAn action can:\n- raise meters,\n- give XP.\n\nLast.")
	assert_eq(b.size(), 3)
	assert_eq(b[0], {"text": "First para.", "items": []})
	assert_eq(b[1], {"text": "An action can:", "items": ["raise meters,", "give XP."]})
	assert_eq(b[2]["text"], "Last.")


func test_travel_pages_quote_the_real_speeds_and_fares() -> void:
	var stations: String = Help.page("stations")["body"]
	assert_string_contains(stations, "80 km/h")
	assert_string_contains(stations, "800 km/h")
	assert_string_contains(stations, "%d km" % int(Trips.AIRPORT_REACH_M / 1000.0))
	var fares: String = Help.page("fares")["body"]
	assert_string_contains(fares, "€0.08")
	assert_string_contains(fares, "€50")
	assert_string_contains(fares, "€0.03")
	assert_string_contains(fares, "€0.12")
