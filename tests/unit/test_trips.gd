extends GutTest

const Trips := preload("res://scripts/trips.gd")

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


func test_travel_takes_an_hour_per_500_km_between_1_and_12_hours() -> void:
	assert_almost_eq(Trips.travel_s(100000.0), 3600.0, 0.01)
	assert_almost_eq(Trips.travel_s(1000000.0), 7200.0, 0.01)
	assert_almost_eq(Trips.travel_s(20000000.0), 43200.0, 0.01)


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


func test_doubled_odds_send_him_away_half_the_time() -> void:
	assert_eq(Trips.roll(0.099, 2.0), Trips.Kind.COUNTRY)
	assert_eq(Trips.roll(0.1, 2.0), Trips.Kind.CITY)
	assert_eq(Trips.roll(0.499, 2.0), Trips.Kind.CITY)
	assert_eq(Trips.roll(0.5, 2.0), Trips.Kind.STAY)
