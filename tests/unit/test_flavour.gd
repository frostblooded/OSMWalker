## Country flavour: hand-written actions per country (data/flavour.json)
## that join the normal pick at matching places and random spots.
extends GutTest

const Stats := preload("res://scripts/stats.gd")
const Activities := preload("res://scripts/activities.gd")

const BASE := {"bar": [{"name": "Beer", "min": 10}], "shop/bakery": [{"name": "Loaf", "min": 3}],
	"_generic": [{"name": "Look", "min": 5}], "_spot": [{"name": "Sit", "min": 5}]}
const FLAVOUR := {"BGR": {"bar": [{"name": "Rakia", "min": 10}], "shop": [{"name": "Banitsa", "min": 3}],
	"_spot": [{"name": "Horo dance", "min": 10}]}}


func _names(actions: Array) -> Array:
	return actions.map(func(a): return a["name"])


func test_country_actions_join_matching_places() -> void:
	var acts := Activities.new(BASE, FLAVOUR)
	assert_eq(_names(acts.for_place({"class": "bar", "subclass": "bar"}, "BGR")), ["Beer", "Rakia"])
	assert_eq(_names(acts.for_place({"class": "shop", "subclass": "bakery"}, "BGR")), ["Loaf", "Banitsa"])
	assert_eq(_names(acts.for_place({}, "BGR")), ["Sit", "Horo dance"])


func test_other_countries_get_only_the_usual() -> void:
	var acts := Activities.new(BASE, FLAVOUR)
	assert_eq(_names(acts.for_place({"class": "bar", "subclass": "bar"}, "FRA")), ["Beer"])
	assert_eq(_names(acts.for_place({"class": "bar", "subclass": "bar"})), ["Beer"])


func test_flavour_reaches_places_with_no_actions_of_their_own() -> void:
	var acts := Activities.new(BASE, {"BGR": {"dragon_lair": [{"name": "Feed the zmey", "min": 5}]}})
	assert_eq(_names(acts.for_place({"class": "dragon_lair", "subclass": "cave"}, "BGR")), ["Look", "Feed the zmey"])


func test_flavour_is_picked_more_often() -> void:
	var acts := Activities.new(BASE, FLAVOUR)
	var stats := Stats.new()
	var rakia: Dictionary = acts.for_place({"class": "bar", "subclass": "bar"}, "BGR")[1]
	assert_true(rakia.get("flavour", false))
	assert_gt(Activities.weight(rakia, stats), Activities.weight({"name": "Rakia", "min": 10}, stats))


func test_bundled_flavour_is_valid() -> void:
	var acts := Activities.shared()
	assert_gte(acts.flavour.size(), 30, "about 30 countries")
	var codes := {}
	for line in FileAccess.get_file_as_string("res://data/cities.tsv").split("\n"):
		var cols := line.split("\t")
		if cols.size() > 2 and not line.begins_with("#"):
			codes[cols[1]] = true
	for code in acts.flavour:
		assert_true(codes.has(code), "%s is not a country code in cities.tsv" % code)
		var n := 0
		for key in acts.flavour[code]:
			var cls: String = key.split("/")[0]
			assert_true(key == "_spot" or acts.data.has(key) or acts.data.has(cls),
				"%s: %s is not a place key we use" % [code, key])
			for a in acts.flavour[code][key]:
				n += 1
				assert_true(a.has("name") and a.has("min"), "%s %s: %s" % [code, key, a])
				for k in a.get("fx", {}):
					assert_true(Stats.FX_KEYS.has(k), "%s: %s has unknown effect %s" % [code, a["name"], k])
				for k in a.get("needs", {}):
					assert_true(Stats.NEED_KEYS.has(k), "%s: %s has unknown need %s" % [code, a["name"], k])
		assert_gte(n, 5, code + " has a handful of actions")
