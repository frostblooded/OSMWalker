## How goals are weighed: place importance, a medium walking distance, his
## heading from the last leg, and places he went to lately.
extends GutTest

const Walker := preload("res://scripts/walker.gd")
const StreetGraph := preload("res://scripts/street_graph.gd")
const Fixture := preload("res://tests/support/osm_fixture.gd")
const Geo := preload("res://scripts/geo.gd")


static func _place(name: String, lat: float, lon: float, rank := 1) -> Dictionary:
	return {"name": name, "class": "cafe", "subclass": "cafe", "rank": rank, "lat": lat, "lon": lon}


func test_offsets_go_there_and_back() -> void:
	var v := Geo.offset_m(42.0, 23.0, 42.001, 23.00135)
	assert_almost_eq(v.length(), Geo.distance_m(42.0, 23.0, 42.001, 23.00135), 0.5)
	assert_gt(v.x, 0.0)  # east
	assert_gt(v.y, 0.0)  # north
	var back := Geo.moved(42.0, 23.0, v)
	assert_almost_eq(back[0], 42.001, 1e-6)
	assert_almost_eq(back[1], 23.00135, 1e-6)


func test_medium_distances_weigh_most() -> void:
	var peak := Walker.distance_weight(Walker.GOAL_PEAK_M)
	assert_almost_eq(peak, 1.0, 1e-6)
	assert_lt(Walker.distance_weight(100.0), 0.2)
	assert_lt(Walker.distance_weight(2000.0), 0.12)
	assert_gt(Walker.distance_weight(2000.0), 0.03)
	assert_lt(Walker.distance_weight(5000.0), 0.01)
	assert_gt(Walker.distance_weight(300.0), 0.6)
	assert_gt(Walker.distance_weight(900.0), 0.6)
	assert_eq(Walker.distance_weight(0.0), Walker.distance_weight(1.0))


func test_straight_ahead_weighs_twice_straight_back() -> void:
	var north := Vector2(0, 1)
	var ahead := Walker.heading_weight(north, Vector2(0, 500))
	var back := Walker.heading_weight(north, Vector2(0, -500))
	var side := Walker.heading_weight(north, Vector2(500, 0))
	assert_almost_eq(ahead / back, Walker.HEADING_RATIO, 1e-6)
	assert_almost_eq(side, 1.0, 1e-6)
	assert_between(Walker.heading_weight(north, Vector2(300, 300)), side, ahead)


func test_no_heading_means_no_pull() -> void:
	assert_eq(Walker.heading_weight(Vector2.ZERO, Vector2(0, 500)), 1.0)
	assert_eq(Walker.heading_weight(Vector2(0, 1), Vector2.ZERO), 1.0)


func test_picks_follow_the_weights() -> void:
	assert_eq(Walker.pick_index([1.0, 0.25], 0.0), 0)
	assert_eq(Walker.pick_index([1.0, 0.25], 0.79), 0)
	assert_eq(Walker.pick_index([1.0, 0.25], 0.81), 1)
	assert_eq(Walker.pick_index([], 0.5), -1)


func _walker() -> Walker:
	var g := StreetGraph.new()
	g.add_overpass(Fixture.data(), Fixture.BBOX)
	var w := Walker.new(g)
	w.rng.seed = 1
	w.bounds = [41.9, 22.9, 42.1, 23.1]
	w.start_at(1)
	return w


func test_weights_multiply_rank_distance_heading_and_recent() -> void:
	var w := _walker()
	w.leg_from = Geo.moved(42.0, 23.0, Vector2(0, -500))  # came up from the south
	var ahead := Geo.moved(42.0, 23.0, Vector2(0, 500))
	var p := _place("Ahead", ahead[0], ahead[1], 2)
	var parts := w.weigh(p)
	assert_almost_eq(parts["rank_w"], 0.5, 1e-6)
	assert_almost_eq(parts["dist_m"], 500.0, 2.0)
	assert_almost_eq(parts["dist_w"], Walker.distance_weight(parts["dist_m"]), 1e-6)
	assert_almost_eq(parts["heading_w"], Walker.heading_weight(Vector2(0, 1), Vector2(0, 500)), 1e-3)
	assert_eq(parts["recent_w"], 1.0)
	assert_almost_eq(parts["weight"], parts["rank_w"] * parts["dist_w"] * parts["heading_w"], 1e-6)
	w.recent = [[ahead[0], ahead[1]]]
	assert_almost_eq(w.weigh(p)["recent_w"], Walker.RECENT_WEIGHT, 1e-6)


func test_heading_comes_from_where_his_last_leg_started() -> void:
	var w := _walker()
	assert_eq(w.heading(), Vector2.ZERO)  # no leg yet
	w.set_goal(42.001, 23.0)
	assert_eq(w.leg_from, w.position())
	w.leg_from = Geo.moved(42.0, 23.0, Vector2(-400, 0))  # he walked east
	assert_almost_eq(w.heading().x, 1.0, 1e-3)
	assert_almost_eq(w.heading().y, 0.0, 1e-3)


func test_mostly_picks_medium_distance_places_ahead() -> void:
	var w := _walker()
	w.leg_from = Geo.moved(42.0, 23.0, Vector2(-500, 0))  # walking east
	var places := []
	for spec in [["Near east", 50.0, 0.0], ["Mid east", 500.0, 0.0], ["Mid west", -500.0, 0.0], ["Far east", 4000.0, 0.0]]:
		var ll := Geo.moved(42.0, 23.0, Vector2(spec[1], spec[2]))
		places.append(_place(spec[0], ll[0], ll[1]))
	w.graph.places[StreetGraph.cell_of(42.0, 23.0)] = places
	var counts := {}
	for s in range(400):
		w.rng.seed = s
		w.start_at(1)
		w.leg_from = Geo.moved(42.0, 23.0, Vector2(-500, 0))
		w.recent = []
		w.pick_goal()
		counts[w.place["name"]] = counts.get(w.place["name"], 0) + 1
	assert_gt(counts.get("Mid east", 0), counts.get("Mid west", 0))
	assert_gt(counts.get("Mid west", 0), counts.get("Near east", 0))
	assert_gt(counts.get("Mid west", 0), counts.get("Far east", 0))


func test_picked_places_are_remembered_as_recent() -> void:
	var w := _walker()
	var ll := Geo.moved(42.0, 23.0, Vector2(0, 500))
	w.graph.places[StreetGraph.cell_of(42.0, 23.0)] = [_place("Only", ll[0], ll[1])]
	for i in range(Walker.RECENT_COUNT + 3):
		w.pick_goal()
	assert_eq(w.recent.size(), Walker.RECENT_COUNT)
	assert_eq(w.recent[-1], [ll[0], ll[1]])


func test_random_spots_are_drawn_near_and_ahead() -> void:
	var w := _walker()
	var east := 0
	var dists := []
	for s in range(200):
		w.rng.seed = s
		w.start_at(1)
		w.leg_from = Geo.moved(42.0, 23.0, Vector2(-500, 0))
		w.pick_goal()
		var v := Geo.offset_m(42.0, 23.0, w.goal[0], w.goal[1])
		dists.append(v.length())
		if v.x > 0.0:
			east += 1
		assert_between(w.goal[0], 41.9, 42.1)
		assert_between(w.goal[1], 22.9, 23.1)
	dists.sort()
	assert_between(dists[100], 350.0, 700.0)  # median near the peak
	assert_between(east, 115, 160)  # 2:1 ahead pull gives about 2/3 ahead


func test_random_spot_stays_in_a_small_city_box() -> void:
	var w := _walker()
	w.bounds = [41.999, 22.999, 42.001, 23.001]
	for s in range(50):
		w.rng.seed = s
		w.pick_goal()
		assert_between(w.goal[0], 41.999, 42.001)
		assert_between(w.goal[1], 22.999, 23.001)


func test_leg_and_recent_survive_save() -> void:
	var w := _walker()
	w.set_goal(42.001, 23.0)
	w.recent = [[42.0, 23.0]]
	var again := Walker.new(StreetGraph.new())
	again.load_dict(w.to_dict())
	assert_eq(again.leg_from, w.leg_from)
	assert_eq(again.recent, [[42.0, 23.0]])


func test_landing_in_a_new_city_forgets_the_old_heading() -> void:
	var w := _walker()
	w.set_goal(42.001, 23.0)
	w.recent = [[42.0, 23.0]]
	w.start_travel({"name": "Fartown", "lat": 43.0, "lon": 24.0})
	w.land_now()
	assert_eq(w.leg_from, [])
	assert_eq(w.recent, [])
