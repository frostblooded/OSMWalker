## His stats, money, XP and the actions he does at places.
extends GutTest

const Stats := preload("res://scripts/stats.gd")
const Activities := preload("res://scripts/activities.gd")

var stats: Stats
var rng := RandomNumberGenerator.new()


func before_each() -> void:
	stats = Stats.new()
	rng.seed = 1


func _cafe() -> Dictionary:
	return {"name": "Old Cafe", "class": "cafe", "subclass": "cafe", "rank": 1, "lat": 42.0, "lon": 23.0}


func test_starts_healthy_with_some_coins() -> void:
	assert_eq(stats.get_meter("health"), 100.0)
	assert_eq(stats.coins, 50)
	assert_eq(stats.level, 1)


func test_time_makes_him_hungry_and_thirsty() -> void:
	var full := stats.get_meter("fullness")
	var water := stats.get_meter("thirst")
	stats.pass_time(60.0, 0.0)
	assert_almost_eq(stats.get_meter("fullness"), full - Stats.FULLNESS_PER_H, 0.01)
	assert_almost_eq(stats.get_meter("thirst"), water - Stats.THIRST_PER_H, 0.01)


func test_walking_tires_him() -> void:
	stats.pass_time(0.0, 1000.0)
	assert_almost_eq(stats.get_meter("energy"), 100.0 - Stats.ENERGY_PER_KM, 0.01)


func test_starving_costs_health() -> void:
	stats.meters["fullness"] = 0.0
	stats.pass_time(60.0, 0.0)
	assert_lt(stats.get_meter("health"), 100.0)


func test_meters_stay_between_0_and_100() -> void:
	stats.apply_fx({"energy": 500, "mood": -500})
	assert_eq(stats.get_meter("energy"), 100.0)
	assert_eq(stats.get_meter("mood"), 0.0)


func test_xp_levels_him_up_and_raises_his_best_attribute() -> void:
	stats.attrs["cha"] = 3.0
	stats.add_xp(Stats.xp_to_next(1) + 10)
	assert_eq(stats.level, 2)
	assert_eq(stats.xp, 10)
	assert_eq(stats.attrs["cha"], 4.0)
	assert_string_contains(stats.feed[-1], "level 2")


func test_actions_he_cannot_afford_or_lacks_skill_for_are_out() -> void:
	stats.coins = 5
	assert_true(stats.can_do({"name": "a", "min": 1, "cost": 5}, 12))
	assert_false(stats.can_do({"name": "b", "min": 1, "cost": 6}, 12))
	assert_false(stats.can_do({"name": "c", "min": 1, "needs": {"cha": 3}}, 12))
	assert_false(stats.can_do({"name": "d", "min": 1, "needs": {"level": 2}}, 12))


func test_actions_can_need_a_time_of_day() -> void:
	var dinner := {"name": "Dinner", "min": 1, "needs": {"time": "evening"}}
	assert_false(stats.can_do(dinner, 12))
	assert_true(stats.can_do(dinner, 19))
	var party := {"name": "Party", "min": 1, "needs": {"time": "night"}}
	assert_true(stats.can_do(party, 2))
	assert_true(stats.can_do(party, 23))
	assert_false(stats.can_do(party, 15))


func test_actions_can_need_a_low_meter() -> void:
	var nap := {"name": "Nap", "min": 1, "needs": {"below": {"energy": 40}}}
	assert_false(stats.can_do(nap, 12))
	stats.meters["energy"] = 30.0
	assert_true(stats.can_do(nap, 12))


func test_doing_an_action_pays_and_applies_its_effects() -> void:
	stats.meters["energy"] = 50.0
	var line := stats.do({"name": "Espresso at the bar", "min": 3, "cost": 3, "fx": {"energy": 20, "xp": 5}}, "Old Cafe", rng)
	assert_eq(stats.coins, 47)
	assert_eq(stats.get_meter("energy"), 70.0)
	assert_eq(stats.xp, 5)
	assert_string_contains(line, "Espresso at the bar")
	assert_string_contains(line, "Old Cafe")
	assert_string_contains(line, "-3c")
	assert_eq(stats.feed[-1], line)


func test_jobs_earn_coins_in_a_range() -> void:
	for s in 20:
		rng.seed = s
		var before := stats.coins
		stats.do({"name": "Busk", "min": 15, "earn": [5, 30]}, "Park", rng)
		assert_between(stats.coins - before, 5, 30)


func test_buffs_wear_off_and_can_heal_over_time() -> void:
	stats.meters["health"] = 50.0
	stats.do({"name": "Vitamins", "min": 1, "buff": {"name": "Healthy", "min": 120, "per_h": {"health": 10}}}, "", rng)
	assert_eq(stats.buff_names(), ["Healthy"])
	stats.pass_time(60.0, 0.0)
	assert_almost_eq(stats.get_meter("health"), 60.0, 0.01)
	stats.pass_time(61.0, 0.0)
	assert_eq(stats.buff_names(), [])


func test_same_buff_again_refreshes_it() -> void:
	var a := {"name": "Coffee", "min": 1, "buff": {"name": "Caffeinated", "min": 60}}
	stats.do(a, "", rng)
	stats.pass_time(30.0, 0.0)
	stats.do(a, "", rng)
	assert_eq(stats.buff_names(), ["Caffeinated"])
	assert_almost_eq(stats.buffs[0]["left"], 60.0, 0.01)


func test_xp_buffs_multiply_xp() -> void:
	stats.do({"name": "Sunset", "min": 1, "buff": {"name": "Inspired", "min": 60, "xp_mult": 2.0}}, "", rng)
	stats.do({"name": "Look", "min": 1, "fx": {"xp": 10}}, "", rng)
	assert_eq(stats.xp, 20)


func test_risky_actions_can_go_wrong() -> void:
	var a := {"name": "Dine and dash", "min": 1, "fx": {"fullness": 10}, "risk": {"p": 1.0, "text": "caught", "fx": {"mood": -20}, "cost": 20}}
	var line := stats.do(a, "Bistro", rng)
	assert_eq(stats.coins, 30)
	assert_string_contains(line, "caught")


func test_first_visit_to_a_place_gives_bonus_xp_once() -> void:
	assert_eq(stats.visit(_cafe()), Stats.FIRST_VISIT_XP)
	assert_eq(stats.visit(_cafe()), 0)
	var landmark := _cafe().merged({"name": "Cathedral", "lat": 42.1}, true)
	landmark["rank"] = 1
	landmark["class"] = "place_of_worship"
	assert_eq(stats.visit(landmark), Stats.FIRST_VISIT_XP)


func test_fainting_at_zero_health() -> void:
	assert_false(stats.fainted())
	stats.meters["health"] = 0.0
	assert_true(stats.fainted())
	var line := stats.wake_in_hospital("City Hospital")
	assert_eq(stats.get_meter("health"), Stats.WAKE_HEALTH)
	assert_eq(stats.coins, 50 - Stats.HOSPITAL_FEE)
	assert_string_contains(line, "City Hospital")


func test_hospital_fee_never_goes_below_zero() -> void:
	stats.coins = 5
	stats.meters["health"] = 0.0
	stats.wake_in_hospital("")
	assert_eq(stats.coins, 0)


func test_stats_survive_save_and_load() -> void:
	stats.coins = 77
	stats.add_xp(30)
	stats.do({"name": "Coffee", "min": 1, "buff": {"name": "Caffeinated", "min": 60}}, "Cafe", rng)
	stats.visit(_cafe())
	var back := Stats.new()
	back.load_dict(JSON.parse_string(JSON.stringify(stats.to_dict())))
	assert_eq(back.coins, 77)
	assert_eq(back.xp, stats.xp)
	assert_eq(back.buff_names(), ["Caffeinated"])
	assert_eq(back.feed, stats.feed)
	assert_eq(back.visit(_cafe()), 0)


func test_what_he_says_goes_in_the_history_where_he_is() -> void:
	stats.history.move_to(42.0, 23.0)
	stats.say("Waved")
	assert_eq(stats.history.entries[-1]["text"], "Waved")
	assert_eq(stats.history.entries[-1]["at"], [42.0, 23.0])
	assert_gt(stats.history.entries[-1]["t"], 0)
	var back := Stats.new()
	back.load_dict(JSON.parse_string(JSON.stringify(stats.to_dict())))
	assert_eq(back.history.entries[-1]["at"], [42.0, 23.0])


func test_old_saves_keep_their_feed_lines() -> void:
	stats.load_dict({"feed": ["Old news"]})
	assert_eq(stats.feed, ["Old news"])


func test_action_list_comes_from_subclass_then_class_then_generic() -> void:
	var data := {"shop/bakery": [{"name": "Loaf"}], "shop": [{"name": "Browse"}], "_generic": [{"name": "Look"}], "_spot": [{"name": "Sit"}]}
	var acts := Activities.new(data)
	assert_eq(acts.for_place({"class": "shop", "subclass": "bakery"})[0]["name"], "Loaf")
	assert_eq(acts.for_place({"class": "shop", "subclass": "toys"})[0]["name"], "Browse")
	assert_eq(acts.for_place({"class": "dragon_lair", "subclass": "x"})[0]["name"], "Look")
	assert_eq(acts.for_place({})[0]["name"], "Sit")


func test_unknown_tags_are_counted() -> void:
	var acts := Activities.new({"_generic": [{"name": "Look"}]})
	acts.for_place({"name": "Lair", "class": "dragon_lair", "subclass": "cave"})
	acts.for_place({"name": "Lair 2", "class": "dragon_lair", "subclass": "cave"})
	assert_eq(acts.unknown["dragon_lair/cave"]["count"], 2)
	assert_eq(acts.unknown["dragon_lair/cave"]["example"], "Lair")


func test_needs_steer_the_choice() -> void:
	var acts := Activities.new({})
	var eat := {"name": "Eat", "min": 10, "fx": {"fullness": 40}}
	var look := {"name": "Look", "min": 10, "fx": {"mood": 5}}
	stats.meters["fullness"] = 10.0
	assert_gt(Activities.weight(eat, stats), Activities.weight(look, stats))
	stats.coins = 0
	var job := {"name": "Wash dishes", "min": 60, "earn": 20}
	assert_gt(Activities.weight(job, stats), Activities.weight(look, stats))


func test_choose_skips_what_he_cannot_do() -> void:
	stats.coins = 0
	var pricey := {"name": "Dinner", "min": 10, "cost": 30}
	var free := {"name": "Bench", "min": 10}
	assert_eq(Activities.choose([pricey, free], stats, 12, 0.0)["name"], "Bench")
	assert_eq(Activities.choose([pricey], stats, 12, 0.5), {})


func test_minutes_are_capped_at_15() -> void:
	assert_eq(Activities.rest_minutes({"min": 3}), 3.0)
	assert_eq(Activities.rest_minutes({"min": 480}), 15.0)


func test_bundled_actions_are_all_valid() -> void:
	var acts := Activities.shared()
	assert_gt(acts.data.size(), 10)
	for key in acts.data:
		for a in acts.data[key]:
			assert_true(a.has("name") and a.has("min"), "%s: %s" % [key, a])
			for k in a.get("fx", {}):
				assert_true(Stats.FX_KEYS.has(k), "%s: %s has unknown effect %s" % [key, a["name"], k])
			for k in a.get("needs", {}):
				assert_true(Stats.NEED_KEYS.has(k), "%s: %s has unknown need %s" % [key, a["name"], k])
	assert_true(acts.data.has("_generic") and acts.data.has("_spot"))


## Common tags from the real-tile sweep (tools/poi_sweep.py) have their own
## actions instead of the generic ones.
func test_common_real_tags_have_actions() -> void:
	var acts := Activities.shared()
	for tag in ["hairdresser/hairdresser", "bakery/bakery", "butcher/butcher", "school/school",
			"school/kindergarten", "atm/atm", "office/company", "office/employment_agency",
			"bicycle_rental/bicycle_rental", "bicycle/bicycle", "parking/parking", "fuel/fuel",
			"car/car_repair", "veterinary/veterinary", "yoga/yoga", "escape_game/escape_game",
			"ferry_terminal/ferry_terminal", "shop/florist", "shop/massage", "shop/tattoo",
			"shop/optician", "shop/pet", "shop/confectionery"]:
		var parts: PackedStringArray = tag.split("/")
		acts.unknown.clear()
		acts.for_place({"name": "X", "class": parts[0], "subclass": parts[1]})
		assert_true(acts.unknown.is_empty(), tag + " falls back to generic")
	assert_true(acts.for_place({"name": "X", "class": "shop", "subclass": "florist"}) != acts.data["shop"], "florist has its own")
