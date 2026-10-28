extends GutTest

const CityCheck := preload("res://scripts/city_check.gd")
const Activities := preload("res://scripts/activities.gd")

const BUS := {"name": "Central", "class": "bus", "subclass": "bus_station"}
const STOP := {"name": "Stop", "class": "bus", "subclass": "bus_stop"}
const AIRPORT := {"name": "Airport", "class": "aerodrome", "subclass": "international"}
const AIRBASE := {"name": "Base", "class": "aerodrome", "subclass": "military"}
const GAS := {"name": "Shell", "class": "fuel", "subclass": "fuel"}
const CHARGER := {"name": "Charger", "class": "fuel", "subclass": "charging_station"}
const DEALER := {"name": "Cars", "class": "car", "subclass": "car"}
const CAFE := {"name": "Cafe", "class": "cafe", "subclass": "cafe"}

var acts: Activities


func before_each() -> void:
	acts = Activities.new({"cafe": [{"name": "Wait tables", "earn": 20}], "_generic": [{"name": "Look around"}]})


func test_kinds_of_places() -> void:
	assert_true(CityCheck.is_bus_station(BUS))
	assert_false(CityCheck.is_bus_station(STOP))
	assert_true(CityCheck.is_airport(AIRPORT))
	assert_false(CityCheck.is_airport(AIRBASE), "military airfields don't count")
	assert_true(CityCheck.is_gas_station(GAS))
	assert_false(CityCheck.is_gas_station(CHARGER))
	assert_true(CityCheck.is_car_dealer(DEALER))
	assert_true(CityCheck.can_earn_at(CAFE, acts))
	assert_false(CityCheck.can_earn_at(BUS, acts))


func test_summary_counts_each_kind() -> void:
	var s := CityCheck.summary([BUS, BUS, AIRPORT, GAS, DEALER, CAFE, STOP], acts)
	assert_eq(s, {"bus": 2, "airport": 1, "gas": 1, "dealer": 1, "earn": 1})


func test_a_city_with_everything_has_no_problems() -> void:
	assert_eq(CityCheck.problems(CityCheck.summary([BUS, GAS, CAFE], acts), "Sofia"), [])


func test_no_way_out_and_no_work_are_separate_problems() -> void:
	var titles := CityCheck.problems(CityCheck.summary([STOP], acts), "Sofia").map(func(p): return p["title"])
	assert_eq(titles, ["Can't leave Sofia", "No gas station in Sofia", "No way to earn coins in Sofia"])


func test_a_bus_station_is_a_way_out_even_without_gas() -> void:
	var titles := CityCheck.problems(CityCheck.summary([BUS, CAFE], acts), "Sofia").map(func(p): return p["title"])
	assert_eq(titles, ["No gas station in Sofia"])
