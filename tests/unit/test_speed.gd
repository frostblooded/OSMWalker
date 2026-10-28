## His movement speed: realistic for walking or his vehicle, a little faster
## with each level and speed gear, slower when he is tired.
extends GutTest

const Stats := preload("res://scripts/stats.gd")
const Items := preload("res://scripts/items.gd")
const Speeds := preload("res://scripts/speeds.gd")
const Walker := preload("res://scripts/walker.gd")
const StreetGraph := preload("res://scripts/street_graph.gd")
const Fixture := preload("res://tests/support/osm_fixture.gd")
const Hud := preload("res://scripts/hud.gd")

var stats: Stats
var rng := RandomNumberGenerator.new()


func before_each() -> void:
	stats = Stats.new()
	rng.seed = 3


static func _vehicle(kind: String, speed := 0.0, price := 100) -> Dictionary:
	return {"name": "Plain " + kind, "slot": "vehicle", "vehicle": kind, "stats": {"speed": speed}, "rarity": "Common", "price": price}


func test_speeds_are_realistic_city_averages() -> void:
	assert_almost_eq(Speeds.WALK * 3.6, 5.0, 0.001)
	assert_almost_eq(Speeds.BIKE * 3.6, 15.0, 0.001)
	assert_almost_eq(Speeds.MOTORCYCLE * 3.6, 30.0, 0.001)
	assert_almost_eq(Speeds.CAR * 3.6, 35.0, 0.001)


func test_he_walks_at_5_kmh_to_start() -> void:
	assert_almost_eq(stats.speed_mps(), Speeds.WALK, 0.0001)
	assert_eq(stats.vehicle(), "")


func test_each_level_adds_one_percent() -> void:
	stats.level = 11
	assert_almost_eq(stats.speed_mps(), Speeds.WALK * 1.1, 0.0001)


func test_his_vehicle_sets_the_base_speed() -> void:
	for kind in ["bike", "motorcycle", "car"]:
		stats.equip(_vehicle(kind))
		assert_eq(stats.vehicle(), kind)
		assert_almost_eq(stats.speed_mps(), Speeds.FOR_VEHICLE[kind], 0.0001)


func test_speed_gear_adds_percent_on_top() -> void:
	stats.equip(_vehicle("bike", 10.0))
	stats.equip({"name": "Swift Trainers", "slot": "feet", "stats": {"speed": 5.0}, "rarity": "Uncommon", "price": 20})
	stats.level = 6
	assert_almost_eq(stats.speed_mps(), Speeds.BIKE * 1.2, 0.0001)


func test_low_energy_slows_him_to_half_at_zero() -> void:
	stats.meters["energy"] = 30.0
	assert_almost_eq(stats.speed_mps(), Speeds.WALK, 0.0001)
	stats.meters["energy"] = 15.0
	assert_almost_eq(stats.speed_mps(), Speeds.WALK * 0.75, 0.0001)
	stats.meters["energy"] = 0.0
	assert_almost_eq(stats.speed_mps(), Speeds.WALK * 0.5, 0.0001)


func test_riding_tires_him_less_than_walking() -> void:
	var walker := Stats.new()
	walker.pass_time(0.0, 1000.0)
	stats.equip(_vehicle("car"))
	stats.pass_time(0.0, 1000.0)
	assert_gt(stats.get_meter("energy"), walker.get_meter("energy"))


func test_vehicle_shops_sell_their_own_vehicle() -> void:
	for s in 20:
		rng.seed = s
		for pair in [["bicycles", "bike"], ["motorcycles", "motorcycle"], ["cars", "car"]]:
			var it := Items.make(pair[0], 30, rng)
			assert_eq(it["slot"], "vehicle")
			assert_eq(it["vehicle"], pair[1], str(it))
			assert_gt(float(it["stats"].get("speed", 0.0)), 0.0, str(it))


func test_vehicles_are_a_saving_goal() -> void:
	var cheapest := {}
	for s in 50:
		rng.seed = s
		for kind in ["bicycles", "motorcycles", "cars"]:
			var it := Items.make(kind, 1, rng)
			cheapest[kind] = mini(cheapest.get(kind, 1 << 30), it["price"])
	assert_between(cheapest["bicycles"], 60, 100)
	assert_between(cheapest["motorcycles"], 250, 350)
	assert_between(cheapest["cars"], 700, 900)


func test_a_car_beats_any_bike() -> void:
	var bike := Items.build(Items.KINDS["bicycles"][0], Items.MATERIALS[-1], [Items.PREFIXES[0], Items.SUFFIXES[0]])
	var car := Items.build(Items.KINDS["cars"][0], Items.MATERIALS[0], [])
	stats.equip(bike)
	assert_true(stats.is_upgrade(car))
	stats.equip(car)
	assert_false(stats.is_upgrade(bike))


func test_vehicle_survives_save_and_load() -> void:
	stats.equip(_vehicle("motorcycle", 5.0))
	var back := Stats.new()
	back.load_dict(JSON.parse_string(JSON.stringify(stats.to_dict())))
	assert_eq(back.vehicle(), "motorcycle")
	assert_almost_eq(back.speed_mps(), stats.speed_mps(), 0.0001)


func test_vehicle_shops_have_browse_actions() -> void:
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/actions.json"))
	for pair in [["bicycle", "bicycles"], ["shop/motorcycle", "motorcycles"], ["car/car", "cars"]]:
		assert_true(data.get(pair[0], []).any(func(a): return a.get("item", "") == pair[1]), pair[0])


func test_walker_covers_more_ground_at_a_higher_speed_but_keeps_the_clock() -> void:
	var graph := StreetGraph.new()
	graph.add_overpass(Fixture.data(), Fixture.BBOX)
	var w := Walker.new(graph)
	w.rng.seed = 1
	w.start_at(2)
	w.speed_mps = Walker.SPEED_MPS / 4.0
	w.advance(40.0)
	assert_almost_eq(w.total_m, 10.0, 0.0001)
	w.rest_for(1.0)
	assert_almost_eq(w.rest_left_s(), 60.0, 0.0001, "a minute's rest stays a minute")


func test_hud_shows_his_speed_in_kmh() -> void:
	assert_eq(Hud.speed_text(Speeds.WALK), "5 km/h")
	assert_eq(Hud.speed_text(Speeds.BIKE * 1.1), "16.5 km/h")
	stats.equip(_vehicle("car"))
	assert_string_contains(Hud.sheet_text(stats), "Speed: 35 km/h (car)")
