extends GutTest

const Trips := preload("res://scripts/trips.gd")
const Geo := preload("res://scripts/geo.gd")

const LIST := "# comment\nBigtown\tAAA\tA-land\t0.0\t0.0\t1000000\nSmallton\tAAA\tA-land\t1.0\t0.0\t1000\nNexttown\tAAA\tA-land\t0.1\t0.0\t500000\nFarcity\tBBB\tB-land\t10.0\t10.0\t3000\nOther\tCCC\tC-land\t-10.0\t10.0\t1000\n"

var trips: Trips
var rng: RandomNumberGenerator


func before_each() -> void:
	trips = Trips.new()
	trips.cities = Trips.parse(LIST)
	rng = RandomNumberGenerator.new()
	rng.seed = 7


func test_roll_is_75_stay_20_city_5_country() -> void:
	assert_eq(Trips.roll(0.0), Trips.Kind.COUNTRY)
	assert_eq(Trips.roll(0.049), Trips.Kind.COUNTRY)
	assert_eq(Trips.roll(0.05), Trips.Kind.CITY)
	assert_eq(Trips.roll(0.249), Trips.Kind.CITY)
	assert_eq(Trips.roll(0.25), Trips.Kind.STAY)
	assert_eq(Trips.roll(0.999), Trips.Kind.STAY)


const AIRPORTS := "# comment\nBig Intl\tBIG\tAA\t0.1\t0.1\nFar Field\tFAR\tBB\t10.05\t10.0\n"
const BUS_STATION := {"name": "Central Bus", "class": "bus", "subclass": "bus_station", "rank": 5, "lat": 0.01, "lon": 0.0}
const FUEL := {"name": "Fuel Stop", "class": "fuel", "subclass": "fuel", "rank": 9, "lat": 0.0, "lon": 0.01}
const CAFE := {"name": "Cafe", "class": "cafe", "subclass": "cafe", "rank": 1, "lat": 0.0, "lon": 0.002}


func _with_airports() -> void:
	trips.airports = Trips.parse_airports(AIRPORTS)


func test_bus_and_plane_go_at_real_speeds() -> void:
	assert_almost_eq(Trips.ride_s(Trips.Mode.BUS, 80000.0), 3600.0, 0.01, "80 km/h")
	assert_almost_eq(Trips.ride_s(Trips.Mode.PLANE, 800000.0), 3600.0, 0.01, "800 km/h")
	assert_almost_eq(Trips.ride_s(Trips.Mode.CAR, 90000.0), 3600.0, 0.01, "90 km/h on the road")


func test_fares_follow_real_prices_in_euros() -> void:
	assert_eq(Trips.fare(Trips.Mode.BUS, 300000.0), 24, "8 cents a km")
	assert_eq(Trips.fare(Trips.Mode.PLANE, 1430000.0), 93, "50 plus 3 cents a km")
	assert_eq(Trips.fare(Trips.Mode.CAR, 100000.0), 12, "fuel at 12 cents a km")
	assert_eq(Trips.fare(Trips.Mode.BUS, 1000.0), 1, "never free")


func test_planes_get_likelier_with_distance() -> void:
	assert_eq(Trips.plane_chance(100000.0), 0.0)
	assert_between(Trips.plane_chance(500000.0), 0.3, 0.5)
	assert_eq(Trips.plane_chance(1200000.0), 1.0)


func test_parses_airports() -> void:
	_with_airports()
	assert_eq(trips.airports.size(), 2)
	assert_eq(trips.airports[0]["name"], "Big Intl")
	assert_eq(trips.airports[0]["class"], "aerodrome")
	assert_true(Trips.is_airport(trips.airports[0]))


func test_nearest_airport_within_reach() -> void:
	_with_airports()
	assert_eq(trips.nearest_airport(0.0, 0.0)["name"], "Big Intl")
	assert_eq(trips.nearest_airport(5.0, 5.0), {}, "none within reach")


func test_knows_bus_and_gas_stations() -> void:
	assert_true(Trips.is_bus_station(BUS_STATION))
	assert_false(Trips.is_bus_station({"class": "bus", "subclass": "bus_stop"}))
	assert_true(Trips.is_gas_station(FUEL))
	assert_false(Trips.is_gas_station(CAFE))


func test_a_short_trip_takes_the_bus_from_the_nearest_station() -> void:
	_with_airports()
	var far := {"name": "Smallton", "lat": 1.0, "lon": 0.0}
	var plan := trips.plan_trip(far, [0.0, 0.0], [CAFE, BUS_STATION], 100, false, 0.99)
	assert_eq(plan["mode"], Trips.Mode.BUS)
	assert_eq(plan["station"]["name"], "Central Bus")
	assert_eq(plan["fare"], Trips.fare(Trips.Mode.BUS, Geo.distance_m(0.0, 0.0, 1.0, 0.0) * Trips.ROAD_FACTOR))
	assert_eq(plan["arrive"], [1.0, 0.0], "a bus ends in the city centre")
	assert_eq(plan["city"], far)


func test_a_long_trip_flies_between_airports() -> void:
	_with_airports()
	var far := {"name": "Farcity", "lat": 10.0, "lon": 10.0}
	var plan := trips.plan_trip(far, [0.0, 0.0], [BUS_STATION], 1000, false, 0.0)
	assert_eq(plan["mode"], Trips.Mode.PLANE)
	assert_eq(plan["station"]["name"], "Big Intl")
	assert_eq(plan["arrive"], [10.05, 10.0], "lands at the airport there")


func test_no_airport_means_the_bus_even_far_away() -> void:
	var far := {"name": "Farcity", "lat": 10.0, "lon": 10.0}
	var plan := trips.plan_trip(far, [0.0, 0.0], [BUS_STATION], 1000, false, 0.0)
	assert_eq(plan["mode"], Trips.Mode.BUS)


func test_no_bus_crosses_an_ocean() -> void:
	var far := {"name": "Overseas", "lat": 0.0, "lon": 60.0}
	var plan := trips.plan_trip(far, [0.0, 0.0], [BUS_STATION], 100000, false, 0.0)
	assert_eq(plan["error"], "too far to go by road, and no airport within reach")


func test_with_a_car_he_fills_up_and_drives() -> void:
	var far := {"name": "Smallton", "lat": 1.0, "lon": 0.0}
	var plan := trips.plan_trip(far, [0.0, 0.0], [BUS_STATION, FUEL], 100, true, 0.99)
	assert_eq(plan["mode"], Trips.Mode.CAR)
	assert_eq(plan["station"]["name"], "Fuel Stop")


func test_no_way_out_says_why() -> void:
	var far := {"name": "Smallton", "lat": 1.0, "lon": 0.0}
	var plan := trips.plan_trip(far, [0.0, 0.0], [CAFE], 100, false, 0.5)
	assert_eq(plan["error"], "no bus station or airport within reach")
	assert_false(plan.has("station"))


func test_too_little_money_says_how_much_is_needed() -> void:
	var far := {"name": "Smallton", "lat": 1.0, "lon": 0.0}
	var plan := trips.plan_trip(far, [0.0, 0.0], [BUS_STATION], 3, false, 0.99)
	var fare := Trips.fare(Trips.Mode.BUS, Geo.distance_m(0.0, 0.0, 1.0, 0.0) * Trips.ROAD_FACTOR)
	assert_eq(plan["error"], "can't afford the bus to Smallton: needs €%d, has €3" % fare)
	assert_eq(plan["short_of"], fare)


func test_bundled_airports_cover_the_world() -> void:
	var all := Trips.shared()
	assert_gt(all.airports.size(), 3000)
	assert_eq(all.nearest_airport(42.69, 23.32)["name"], "Sofia Airport")


func test_parses_the_list() -> void:
	assert_eq(trips.cities.size(), 5)
	assert_eq(trips.cities[0], {"name": "Bigtown", "code": "AAA", "country": "A-land", "lat": 0.0, "lon": 0.0, "pop": 1000000})


func test_country_comes_from_the_nearest_city() -> void:
	assert_eq(trips.country_at(9.0, 9.0), "BBB")
	assert_eq(trips.country_at(0.01, 0.02), "AAA")


func test_city_trip_stays_in_the_country_and_leaves_town() -> void:
	for i in 50:
		var c := trips.pick(Trips.Kind.CITY, "AAA", 0.0, 0.0, rng)
		assert_eq(c["code"], "AAA")
		assert_ne(c["name"], "Bigtown")


func test_country_trip_leaves_the_country() -> void:
	for i in 50:
		assert_ne(trips.pick(Trips.Kind.COUNTRY, "AAA", 0.0, 0.0, rng)["code"], "AAA")


func test_bigger_cities_are_picked_more_often() -> void:
	var counts := {}
	for i in 2000:
		var name: String = trips.pick(Trips.Kind.COUNTRY, "AAA", 0.0, 0.0, rng)["name"]
		counts[name] = counts.get(name, 0) + 1
	# Farcity has 3000 people, Other 1000: about 3 to 1.
	var ratio: float = float(counts["Farcity"]) / counts["Other"]
	assert_between(ratio, 2.4, 3.8)


func test_nowhere_to_go_means_no_trip() -> void:
	assert_eq(trips.pick(Trips.Kind.CITY, "BBB", 10.0, 10.0, rng), {})
	assert_eq(trips.pick(Trips.Kind.STAY, "AAA", 0.0, 0.0, rng), {})


func test_bigger_cities_get_wider_destination_areas() -> void:
	assert_eq(Trips.city_radius_m(100), Trips.MIN_CITY_RADIUS_M)
	assert_almost_eq(Trips.city_radius_m(1000000), 8000.0, 0.01)
	assert_eq(Trips.city_radius_m(30000000), Trips.MAX_CITY_RADIUS_M)
	var b := Trips.city_bounds(trips.cities[0])
	assert_lt(b[0], 0.0)
	assert_gt(b[2], 0.0)


func test_bundled_list_has_the_world() -> void:
	var all := Trips.shared()
	assert_gt(all.cities.size(), 5000)
	assert_eq(all.country_at(42.69, 23.32), "BGR")


func test_lists_the_options_for_a_trip() -> void:
	var opts := trips.options(Trips.Kind.CITY, "AAA", 0.0, 0.0)
	assert_eq(opts.map(func(c): return c["name"]), ["Smallton"], "Nexttown is too close to count as another city")
	assert_eq(trips.options(Trips.Kind.STAY, "AAA", 0.0, 0.0), [])
