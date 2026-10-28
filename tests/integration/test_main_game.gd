## Main scene end to end inside Godot: UI signals, walker, saving, with a fake OSM API.
extends GutTest

const Main := preload("res://scripts/main.gd")
const Walker := preload("res://scripts/walker.gd")
const StreetGraph := preload("res://scripts/street_graph.gd")
const Stats := preload("res://scripts/stats.gd")
const Activities := preload("res://scripts/activities.gd")
const FakeOsmApi := preload("res://tests/support/fake_osm_api.gd")
const DiskCache := preload("res://scripts/disk_cache.gd")
const Geo := preload("res://scripts/geo.gd")
const Hud := preload("res://scripts/hud.gd")
const SAVE := "user://test_save.json"
const STREETS := "user://test_streets/"

var api: FakeOsmApi
var _window_size: Vector2i


func before_all() -> void:
	_window_size = get_tree().root.size


func before_each() -> void:
	DirAccess.remove_absolute(SAVE)
	DiskCache.new(STREETS).clear()
	api = FakeOsmApi.new()


func after_each() -> void:
	get_tree().root.size = _window_size


func after_all() -> void:
	DirAccess.remove_absolute(SAVE)
	DiskCache.new(STREETS).clear()


func _new_main(with_api: FakeOsmApi = api) -> Main:
	var m := Main.new()
	m.api = with_api
	m.save_path = SAVE
	m.street_cache_dir = STREETS
	m.offline_tiles = true
	m.roll_source = func(): return 0.99  # no trips unless a test asks for one
	add_child_autofree(m)
	return m


func _start_in_testville(m: Main) -> void:
	m.hud.city_chosen.emit("Testville", 42.0, 23.0, [])
	await wait_until(func(): return m.walker != null, 2.0)


func test_first_launch_shows_city_picker() -> void:
	var m := _new_main()
	assert_null(m.walker)
	assert_eq(m.debug_state()["screen"], "picker")


func test_typing_shows_suggestions_without_pressing_search() -> void:
	var m := _new_main()
	var box: LineEdit = m.hud.debug_controls()["search_box"]
	for t in ["Tes", "Test", "Testville"]:
		box.text = t
		box.text_changed.emit(t)
	await wait_until(func(): return m.hud.debug_controls()["result0"] != null, 2.0)
	assert_eq(api.searches, ["Testville"])
	assert_not_null(m.hud.debug_controls()["result0"])


func test_search_server_failure_says_so() -> void:
	api.online = false
	var m := _new_main()
	var box: LineEdit = m.hud.debug_controls()["search_box"]
	box.text = "Testville"
	(m.hud.debug_controls()["search_button"] as Button).pressed.emit()
	await wait_until(func(): return api.searches.size() == 1, 2.0)
	await wait_frames(2)
	assert_string_contains(m.hud.debug_controls()["picker_status"].text, "Couldn't reach")


func test_choosing_a_city_starts_the_walk_and_saves() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	assert_eq(m.debug_state()["screen"], "game")
	assert_eq(m.city, "Testville")
	assert_gte(api.street_requests.size(), 1)
	assert_true(FileAccess.file_exists(SAVE))


func test_destinations_come_from_the_chosen_city() -> void:
	var m := _new_main()
	m.hud.city_chosen.emit("Testville", 42.0, 23.0, [41.9, 22.9, 42.1, 23.1])
	await wait_until(func(): return m.walker != null, 2.0)
	assert_eq(m.walker.bounds, [41.9, 22.9, 42.1, 23.1])


func test_city_bounds_survive_a_restart() -> void:
	var m := _new_main()
	m.hud.city_chosen.emit("Testville", 42.0, 23.0, [41.9, 22.9, 42.1, 23.1])
	await wait_until(func(): return m.walker != null, 2.0)
	m._save()
	var again := _new_main(autofree(FakeOsmApi.new()))
	assert_eq(again.walker.bounds, [41.9, 22.9, 42.1, 23.1])


func test_old_save_without_city_bounds_gets_them_from_the_city_center() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	m.walker.bounds = []
	m._save()
	var again := _new_main(autofree(FakeOsmApi.new()))
	assert_eq(again.walker.bounds, Walker.city_bounds(42.0, 23.0, []))


func test_search_results_carry_the_city_box() -> void:
	var m := _new_main()
	var chosen := []
	m.hud.city_chosen.connect(func(n, lat, lon, box): chosen.append(box))
	m.hud.show_results([{"name": "Testville, Nowhere", "lat": 42.0, "lon": 23.0, "bbox": [41.9, 22.9, 42.1, 23.1]}])
	(m.hud.debug_controls()["result0"] as Button).pressed.emit()
	assert_eq(chosen, [[41.9, 22.9, 42.1, 23.1]])


func test_he_walks_in_real_time() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	await wait_seconds(0.6)
	assert_almost_eq(m.walker.total_m, 0.6 * 200.0 / 60.0, 1.0)
	assert_ne(m.hud.street_label.text, "")


## Meters walked plus minutes rested (as walking meters): what the clock owed him.
func _covered(m: Main) -> float:
	return m.walker.total_m + m.walker.rested_m


func test_he_freezes_while_the_app_is_closed() -> void:
	var first := _new_main()
	await _start_in_testville(first)
	first._save()
	var d: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(SAVE))
	d["last_tick"] = Time.get_unix_time_from_system() - 3600.0  # older saves kept the clock: an hour away
	var f := FileAccess.open(SAVE, FileAccess.WRITE)
	f.store_string(JSON.stringify(d))
	f.close()
	var pos: Array = first.walker.position()
	first.queue_free()
	await wait_frames(1)
	var second := _new_main(autofree(FakeOsmApi.new()))
	await wait_frames(3)
	assert_lt(_covered(second), 10.0, "no walking for the time away")
	var now: Array = second.walker.position()
	assert_almost_eq(now[0], pos[0], 1e-3)
	assert_almost_eq(now[1], pos[1], 1e-3)


func test_a_long_frame_does_not_jump_him_ahead() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	var before := _covered(m)
	m._step(600.0)  # e.g. the browser tab was hidden for 10 minutes
	assert_lte(_covered(m) - before, Main.MAX_STEP_S * Walker.SPEED_MPS + 0.01)


func test_keeps_walking_while_streets_download() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	api.delay_frames = 100000
	var home := StreetGraph.cell_of(42.0, 23.0)
	for c in m.walker.graph.cells.keys():
		if c != home:
			m.walker.graph.cells.erase(c)
	await wait_frames(2)
	assert_gt(m.loader.in_flight_count(), 0)
	var before := m.walker.total_m
	await wait_seconds(0.5)
	assert_gt(m.walker.total_m, before)


func test_reopening_loads_streets_from_cache_without_network() -> void:
	var first := _new_main()
	await _start_in_testville(first)
	await wait_until(func(): return first.loader.in_flight_count() == 0, 2.0)
	first._save()
	first.queue_free()
	await wait_frames(1)
	var offline := FakeOsmApi.new()
	var second := _new_main(offline)
	await wait_frames(3)
	assert_eq(offline.street_requests.size(), 0)
	assert_false(second.walker.needs_data())


func test_resumes_from_save_on_next_launch() -> void:
	var first := _new_main()
	await _start_in_testville(first)
	first.walker.advance(40.0)
	first._save()
	var pos: Array = first.walker.position()
	first.queue_free()
	await wait_frames(1)

	var second := _new_main(autofree(FakeOsmApi.new()))
	assert_not_null(second.walker)
	assert_eq(second.city, "Testville")
	assert_eq(second.debug_state()["screen"], "game")
	var resumed: Array = second.walker.position()
	assert_almost_eq(resumed[0], pos[0], 1e-4)
	assert_almost_eq(resumed[1], pos[1], 1e-4)


func test_reset_goes_back_to_picker_and_deletes_save() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	m.hud.reset_confirmed.emit()
	assert_null(m.walker)
	assert_false(FileAccess.file_exists(SAVE))
	assert_eq(m.debug_state()["screen"], "picker")


func test_reset_button_needs_reset_typed() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	(m.hud.debug_controls()["new_city"] as Button).pressed.emit()
	assert_true(m.hud.is_confirm_open())
	assert_false(m.hud.is_confirm_enabled())
	var box: LineEdit = m.hud.debug_controls()["confirm_box"]
	box.text_changed.emit("reset")
	assert_false(m.hud.is_confirm_enabled())
	box.text_changed.emit("RESET")
	assert_true(m.hud.is_confirm_enabled())


func test_offline_start_shows_error_and_stays_on_picker() -> void:
	api.online = false
	var m := _new_main()
	m.hud.city_chosen.emit("Testville", 42.0, 23.0, [])
	await wait_frames(3)
	assert_null(m.walker)
	assert_eq(m.debug_state()["screen"], "picker")


func test_buttons_are_big_enough_to_tap() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	m.hud.open_menu()
	await wait_frames(2)
	for key in ["menu", "new_city", "history", "zoom_in"]:
		var c: Control = m.hud.debug_controls()[key]
		assert_gte(c.size.y, 100.0, key)
		assert_gte(c.size.x, 100.0, key)


func test_downloads_streets_around_him_before_he_needs_them() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	await wait_until(func(): return m.loader.in_flight_count() == 0, 2.0)
	assert_true(m.walker.graph.covers(42.0, 23.0, 1500.0))
	assert_false(m.walker.needs_data())


func test_tells_the_player_when_map_server_is_unreachable() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	api.online = false
	_forget_streets(m)
	await wait_frames(4)
	assert_true(m.hud.overlay_label.visible)
	assert_string_contains(m.hud.overlay_label.text, "map server")


func test_shows_loading_while_waiting_for_streets() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	api.delay_frames = 30
	_forget_streets(m)
	await wait_frames(3)
	assert_true(m.hud.overlay_label.visible)
	assert_eq(m.hud.overlay_label.text, "Loading streets…")
	assert_true(m.hud.progress_bar.is_visible_in_tree())
	assert_true(m.hud.progress_bar.indeterminate)


## Drops every loaded cell, the disk cache too, so he has to wait for the network.
func _forget_streets(m: Main) -> void:
	m.walker.graph.cells.clear()
	m.walker.to_node = -1
	DiskCache.new(STREETS).clear()
	m.loader.forget_cache_checks()


func test_loading_streets_shows_details() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	api.delay_frames = 100000
	_forget_streets(m)
	await wait_frames(3)
	assert_eq(m.hud.overlay_label.text, "Loading streets…")
	assert_string_contains(m.hud.detail_label.text, "Streets:")


func test_no_details_while_walking_normally() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	await wait_frames(3)
	assert_false(m.hud.detail_label.visible)


func test_finding_streets_for_a_new_city_shows_details() -> void:
	api.delay_frames = 100000
	var m := _new_main()
	m.hud.city_chosen.emit("Testville", 42.0, 23.0, [])
	await wait_frames(3)
	var text: String = m.hud._picker_status.text
	assert_string_contains(text, "Finding streets in Testville")
	assert_string_contains(text, "downloading")
	assert_string_contains(text, "Streets:")


func test_stands_still_while_resting() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	m.walker.rest_m = Walker.REST_M
	m._step(0.1)
	assert_false(m.character.walking)


## Starts in Testville with every roll set to `r`, then makes him pick his next spot.
func _start_and_pick_again(r: float) -> Main:
	var m := _new_main()
	m.roll_source = func(): return r
	await _start_in_testville(m)
	m._step(0.1)
	m.walker.goal = []
	m.walker.rest_m = 0.0
	m.walker.to_node = -1
	m._step(0.1)
	return m


func test_first_pick_after_choosing_a_city_never_travels() -> void:
	var m := _new_main()
	m.roll_source = func(): return 0.0
	await _start_in_testville(m)
	m._step(0.1)
	assert_false(m.walker.is_traveling())
	assert_eq(m.walker.goal.size(), 2)


func test_a_stay_roll_keeps_him_in_the_city() -> void:
	var m: Main = await _start_and_pick_again(0.5)
	assert_false(m.walker.is_traveling())
	assert_eq(m.city, "Testville")


func test_a_city_roll_sends_him_to_another_city_in_the_country() -> void:
	var m: Main = await _start_and_pick_again(0.1)
	assert_true(m.walker.is_traveling())
	var to: Dictionary = m.walker.travel["to"]
	assert_eq(to["code"], "BGR")
	assert_true(m.hud.street_label.text.contains(to["name"]), m.hud.street_label.text)
	assert_true(m.trip_line.visible)
	assert_lt(m.map.zoom, 12)


func test_a_country_roll_sends_him_abroad() -> void:
	var m: Main = await _start_and_pick_again(0.01)
	assert_true(m.walker.is_traveling())
	assert_ne(m.walker.travel["to"]["code"], "BGR")


func test_lands_in_the_new_city_and_walks_its_streets() -> void:
	var m: Main = await _start_and_pick_again(0.1)
	var to: Dictionary = m.walker.travel["to"]
	m.roll_source = func(): return 0.5
	m.walker.advance(m.walker.travel["left_m"] + 60.0)
	await wait_until(func(): m._step(0.5); return not m.walker.is_traveling(), 5.0)
	assert_eq(m.city, "%s, %s" % [to["name"], to["country"]])
	assert_eq(m.hud.city_label.text, m.city)
	assert_eq(m.loader.graph, m.walker.graph)
	assert_false(m.trip_line.visible)
	m._save()
	var d: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(SAVE))
	assert_eq(d["country"], "BGR")


func test_a_trip_survives_a_restart() -> void:
	var m: Main = await _start_and_pick_again(0.1)
	m._save()
	var again := _new_main(autofree(FakeOsmApi.new()))
	assert_true(again.walker.is_traveling())
	again._step(0.1)
	assert_true(again.trip_line.visible)
	assert_eq(again.country, "BGR")


func test_shows_the_place_he_heads_to_with_a_pin() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	m.walker.set_goal(42.0, 23.00135)  # so he does not reach an earlier, nearby goal mid-test
	m.walker.place = {"name": "Cafe East", "class": "cafe", "subclass": "cafe", "rank": 1, "lat": 42.0, "lon": 23.00135}
	await wait_frames(2)
	assert_string_starts_with(m.hud.place_label.text, "Going to Cafe East · ")
	assert_true(m.place_pin.visible)
	assert_eq(m.place_pin.position, m.map.geo_to_local(42.0, 23.00135))
	assert_eq(m.debug_state()["place"], "Cafe East")
	m.walker.place = {}
	m.walker.goal = []
	m.walker.start_travel({"name": "Far", "lat": 43.0, "lon": 24.0})
	m._step(0.0)
	assert_false(m.place_pin.visible, "nothing while he travels to another city")
	assert_false(m.hud.place_label.visible)


func test_shows_a_random_spot_goal_with_a_pin() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	m.walker.set_goal(42.001, 23.0)
	m._step(0.0)
	var here := m.walker.position()
	var dist := Geo.distance_m(here[0], here[1], 42.001, 23.0)
	assert_eq(m.hud.place_label.text, Hud.goal_text("", dist))
	assert_true(m.hud.place_label.visible)
	assert_true(m.place_pin.visible)
	assert_eq(m.place_pin.position, m.map.geo_to_local(42.001, 23.0))
	assert_eq(m.debug_state()["goal_line"], m.hud.place_label.text)


## Puts the goal far enough away that the map has to zoom out to show both.
func _far_goal(m: Main) -> void:
	m.walker.set_goal(42.02, 23.02)
	m._step(0.0)


func test_tapping_the_goal_fits_him_and_the_goal_on_the_map() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	_far_goal(m)
	m.hud.goal_tapped.emit()
	m._step(0.0)
	await wait_frames(2)
	assert_true(m.goal_view)
	assert_lt(m.map.zoom, m.player_zoom, "zoomed out to fit both")
	var view := get_viewport().get_visible_rect().size
	var shown := Rect2(m.camera.position - view / 2.0, view)
	shown = Rect2(shown.position + Vector2(0, m.hud.top_height()), shown.size - Vector2(0, m.hud.top_height()))
	assert_true(shown.has_point(m.character.position), "he is on screen below the top panel")
	assert_true(shown.has_point(m.place_pin.position), "the goal is on screen below the top panel")
	assert_true(m.hud.debug_controls()["back_to_him"].is_visible_in_tree())


func test_back_to_him_follows_him_again() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	_far_goal(m)
	m.hud.goal_tapped.emit()
	m._step(0.0)
	m.hud.back_tapped.emit()
	m._step(0.0)
	assert_false(m.goal_view)
	assert_eq(m.map.zoom, m.player_zoom)
	assert_eq(m.camera.position, m.character.position)
	assert_false(m.hud.debug_controls()["back_to_him"].is_visible_in_tree())


func test_tapping_the_goal_again_follows_him_again() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	_far_goal(m)
	m.hud.goal_tapped.emit()
	m.hud.goal_tapped.emit()
	m._step(0.0)
	assert_false(m.goal_view)


func test_goal_view_ends_when_the_goal_changes() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	_far_goal(m)
	m.hud.goal_tapped.emit()
	m._step(0.0)
	m.walker.set_goal(41.99, 22.99)
	m._step(0.0)
	assert_false(m.goal_view)
	assert_eq(m.camera.position, m.character.position)


func test_nothing_overlaps_in_the_goal_view() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	_crowd_the_top_panel(m)
	m.hud.goal_tapped.emit()
	m._step(0.01)
	await wait_frames(3)
	assert_true(m.hud.debug_controls()["back_to_him"].is_visible_in_tree())
	assert_eq(m.hud.overlapping_texts(), [])


const CAFE := {"name": "Cafe East", "class": "cafe", "subclass": "cafe", "rank": 1, "lat": 42.0, "lon": 23.00135}


func test_does_an_action_on_arriving_at_a_place() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	m.clock_hour = 12
	m.walker.arrived.emit(CAFE)
	var line: String = m.stats.feed[-1]
	assert_string_contains(line, "Cafe East")
	m._step(0.01)
	assert_eq(m.hud.feed_label.text, line)
	assert_almost_eq(m.walker.rest_m, Walker.REST_M, 0.1)


func test_shows_a_countdown_while_he_is_at_a_place() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	m.clock_hour = 12
	m.activities = Activities.new({"cafe": [{"name": "Espresso at the bar", "min": 3}]})
	m.walker.place = CAFE
	m.walker.arrived.emit(CAFE)
	m._step(0.01)
	assert_true(m.hud.wait_bar.is_visible_in_tree(), "in the top panel")
	assert_eq(m.hud.wait_label.text, "Moving again in 1:00")
	assert_false(m.hud.overlay_label.visible, "nothing over the map")
	assert_string_contains(m.hud.street_label.text, "Stopped on")
	for i in 15:
		m._step(1.0)
	assert_eq(m.hud.wait_label.text, "Moving again in 0:45")
	assert_almost_eq(m.hud.wait_bar.value, 25.0, 1.0)
	for i in 46:
		m._step(1.0)
	assert_false(m.walker.is_resting())
	assert_false(m.hud.wait_bar.is_visible_in_tree())


func test_first_visit_gives_bonus_xp() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	m.walker.arrived.emit(CAFE)
	assert_gte(m.stats.xp, Stats.FIRST_VISIT_XP)


func test_time_and_walking_wear_him_down() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	var before: float = m.stats.get_meter("fullness")
	for i in 30:
		m._step(1.0)
	assert_lt(m.stats.get_meter("fullness"), before)


func test_mini_bars_show_his_stats() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	m.stats.coins = 42
	m.stats.meters["health"] = 30.0
	m._step(0.1)
	assert_string_contains(m.hud.money_label.text, "42c")
	assert_almost_eq(m.hud.bars["health"].value, 30.0, 0.5)


func test_tapping_the_stats_opens_the_full_sheet() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	m._step(0.1)
	m.hud.open_sheet()
	assert_true(m.hud.is_sheet_open())
	assert_string_contains(m.hud.sheet_label.text, "Level 1")
	m.hud.close_sheet()
	assert_false(m.hud.is_sheet_open())


func test_fainting_wakes_him_at_a_hospital_for_a_fee() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	var hospital := {"name": "City Hospital", "class": "hospital", "subclass": "hospital", "rank": 1, "lat": 42.0, "lon": 22.99865}
	m.walker.graph.places[StreetGraph.cell_of(42.0, 23.0)] = [hospital]
	m.stats.meters["health"] = 0.0
	m._step(0.1)
	assert_eq(m.stats.get_meter("health"), Stats.WAKE_HEALTH)
	assert_eq(m.stats.coins, 50 - Stats.HOSPITAL_FEE)
	assert_eq(m.walker.from_node, 5, "moved to the street by the hospital")
	assert_eq(m.walker.place["name"], "City Hospital")
	assert_almost_eq(m.walker.rest_m, Walker.REST_M, 0.01, "out again after a minute")
	m._step(0.01)
	assert_true(m.hud.wait_bar.is_visible_in_tree())


func test_stats_survive_a_restart() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	m.stats.coins = 99
	m.stats.say("Remember me")
	m._save()
	var again := _new_main(autofree(FakeOsmApi.new()))
	assert_eq(again.stats.coins, 99)
	assert_eq(again.stats.feed[-1], "Remember me")


func test_loading_message_sits_below_the_top_panel() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	m.stats.say("Read that about 9,010,000 people live in the People's Republic of Bulgaria, which is a long line")
	api.delay_frames = 100000
	_forget_streets(m)
	await wait_frames(3)
	assert_true(m.hud.overlay_label.visible)
	assert_gte(m.hud.overlay_label.get_global_rect().position.y, m.hud.top_height())


const LONG_LINE := "Read that about 9,010,000 people live in the People's Republic of Bulgaria, which is a long line"


## Long city, street, place and feed texts, the worst case for the top panel.
func _crowd_the_top_panel(m: Main) -> void:
	get_tree().root.size = Vector2i(720, 1560)  # a portrait phone
	m.hud.show_game("Sofia-City, People's Republic of Bulgaria")
	m.stats.say(LONG_LINE)
	m.walker.place = CAFE.merged({"name": "The Very Long Name Of A Little Corner Cafe By The Old Tram Depot"})


func test_nothing_overlaps_while_walking() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	_crowd_the_top_panel(m)
	m._step(0.01)
	await wait_frames(3)
	assert_eq(m.hud.overlapping_texts(), [])


func test_nothing_overlaps_while_he_stays_somewhere() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	m.clock_hour = 12
	m.activities = Activities.new({"cafe": [{"name": "Espresso at the bar", "min": 3}]})
	m.walker.arrived.emit(CAFE)
	_crowd_the_top_panel(m)
	m._step(0.01)
	await wait_frames(3)
	assert_true(m.hud.wait_bar.is_visible_in_tree())
	assert_eq(m.hud.overlapping_texts(), [])


func test_nothing_overlaps_while_streets_load() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	_crowd_the_top_panel(m)
	api.delay_frames = 100000
	_forget_streets(m)
	await wait_frames(3)
	assert_true(m.hud.overlay_label.visible)
	assert_true(m.hud.detail_label.visible)
	assert_eq(m.hud.overlapping_texts(), [])


func test_nothing_overlaps_with_the_history_open() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	_crowd_the_top_panel(m)
	m.hud.open_history()
	m._step(0.01)
	await wait_frames(3)
	assert_eq(m.hud.overlapping_texts(), [])


func test_nothing_overlaps_with_the_menu_open() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	_crowd_the_top_panel(m)
	m.hud.open_menu()
	m.hud.set_goal_view(true)
	m._step(0.01)
	await wait_frames(3)
	assert_true(m.hud.debug_controls()["new_city"].is_visible_in_tree())
	assert_eq(m.hud.overlapping_texts(), [])


func test_nothing_overlaps_in_the_reset_dialog() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	_crowd_the_top_panel(m)
	m.hud._open_confirm()
	m._step(0.01)
	await wait_frames(3)
	assert_eq(m.hud.overlapping_texts(), [])


func test_nothing_overlaps_on_the_picker() -> void:
	get_tree().root.size = Vector2i(720, 1560)
	var m := _new_main()
	await wait_frames(3)
	assert_eq(m.hud.overlapping_texts(), [])


func test_new_city_starts_a_fresh_character() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	m.stats.coins = 99
	m._reset()
	await _start_in_testville(m)
	assert_eq(m.stats.coins, 50)


func test_arrival_uses_the_country_flavour() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	m.clock_hour = 12
	m.country = "ZZZ"
	m.activities = Activities.new({"_generic": [{"name": "Look", "min": 1}], "cafe": []},
		{"ZZZ": {"cafe": [{"name": "Local brew", "min": 1}]}})
	m.walker.arrived.emit(CAFE)
	assert_string_contains(m.stats.feed[-1], "Local brew")


func test_city_trivia_from_wikidata_happens_at_places() -> void:
	var m := _new_main()
	m.api.city_rows = [{"cityLabel": {"value": "Testville"}, "capLabel": {"value": "Nowhere"}}]
	await _start_in_testville(m)
	await wait_until(func(): return m.city_facts.size() > 0, 1.0)
	assert_eq(m.api.city_lookups.size(), 1)
	assert_eq(m.city_facts.size(), 1)
	m.clock_hour = 12
	m.activities = Activities.new({"cafe": []})
	m.walker.arrived.emit(CAFE)
	assert_string_contains(m.stats.feed[-1], "capital of Nowhere")


func test_no_trivia_when_wikidata_is_unreachable() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	await wait_until(func(): return m.api.city_lookups.size() > 0, 1.0)
	await wait_seconds(0.1)
	assert_eq(m.city_facts, [])


func test_reaching_a_place_goes_in_the_history_with_its_spot() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	m.clock_hour = 12
	m.walker.arrived.emit(CAFE)
	var reached: Array = m.stats.history.entries.filter(func(e): return e["text"].begins_with("Reached Cafe East"))
	assert_eq(reached.size(), 1)
	assert_eq(reached[0]["at"].size(), 2)


func test_walking_draws_a_trail() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	for i in 20:
		m._step(1.0)
	assert_gt(m.stats.history.trail_points(), 1)


func test_trips_go_in_the_history_and_break_the_trail() -> void:
	var m: Main = await _start_and_pick_again(0.1)
	var to: Dictionary = m.walker.travel["to"]
	assert_string_contains(m.stats.history.latest(), "Set off for " + to["name"])
	m.roll_source = func(): return 0.5
	m.walker.advance(m.walker.travel["left_m"] + 60.0)
	await wait_until(func(): m._step(0.5); return not m.walker.is_traveling(), 5.0)
	assert_string_contains(m.stats.feed[-2] + m.stats.feed[-1], "Arrived in " + to["name"])
	for i in 5:
		m._step(1.0)
	assert_eq(m.stats.history.segments().size(), 2)


func test_history_panel_shows_the_trail_and_numbered_markers() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	m.clock_hour = 12
	m.walker.arrived.emit(CAFE)
	for i in 20:
		m._step(1.0)
	assert_false(m.trail_view.visible)
	m.hud.open_history()
	m._step(0.1)
	assert_true(m.hud.is_history_open())
	assert_true(m.trail_view.visible)
	assert_gt(m.trail_view.markers.size(), 0)
	assert_eq(m.hud.history_rows(), m.stats.history.entries.size())
	assert_false(m.hud.debug_controls()["menu"].is_visible_in_tree(), "map buttons hide under the panel")
	m.hud.close_history()
	m._step(0.1)
	assert_false(m.trail_view.visible)
	assert_eq(m.map.zoom, m.player_zoom)
	assert_true(m.hud.debug_controls()["menu"].is_visible_in_tree())


func test_tapping_a_history_entry_centers_the_map_on_it() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	m.stats.history.move_to(42.001, 23.0)
	m.stats.say("Over there")
	m.stats.history.move_to(42.0, 23.0)
	m.stats.say("Back here")
	m.hud.open_history()
	m._step(0.1)
	m.hud.history_entry_tapped.emit(0)
	m._step(0.1)
	assert_eq(m.trail_view.highlight, m.stats.history.number(0))
	var spot: Vector2 = m.map.geo_to_local(42.001, 23.0)
	assert_almost_eq(m.camera.position.x, spot.x, 0.5)
	assert_gt(m.camera.position.y, spot.y, "the spot sits in the map above the panel")


func test_history_survives_a_restart_but_not_a_new_city() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	m.stats.history.move_to(42.001, 23.0)
	m.stats.say("Remember where")
	m._save()
	var again := _new_main(autofree(FakeOsmApi.new()))
	assert_eq(again.stats.history.entries[-1]["at"], [42.001, 23.0])
	again._reset()
	assert_eq(again.stats.history.entries, [])


func test_debug_button_opens_the_debug_panel_with_city_info() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	m._step(0.1)
	m.hud.debug_controls()["debug"].pressed.emit()
	m._step(0.1)
	assert_true(m.hud.is_debug_open())
	var text: String = m.hud.debug_label.text
	assert_string_contains(text, "Testville")
	assert_string_contains(text, "BGR")
	assert_string_contains(text, "street cells")
	assert_string_contains(text, "Trivia")
	assert_string_contains(text, "first pick in a new city", "the first pick is in the log")
	m.hud.debug_controls()["debug_close"].pressed.emit()
	assert_false(m.hud.is_debug_open())


func test_new_goal_button_rerolls_and_heads_off_at_once() -> void:
	var m := _new_main()
	var rolls := [0]
	m.roll_source = func(): rolls[0] += 1; return 0.99
	await _start_in_testville(m)
	m._step(0.1)
	m.walker.rest_for(1.0)
	m.hud.debug_controls()["debug_goal"].pressed.emit()
	assert_false(m.walker.is_resting())
	assert_eq(m.walker.goal.size(), 2)
	assert_eq(rolls[0], 1, "the trip dice are rolled even for the first pick")
	assert_string_contains(m.debug_text(), "New goal button")
	assert_string_contains(m.debug_text(), "0.9900")


func test_new_city_button_lands_him_in_another_city_of_the_country() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	m._step(0.1)
	m.hud.debug_controls()["debug_city"].pressed.emit()
	assert_false(m.walker.is_traveling(), "arrives at once")
	assert_eq(m.country, "BGR")
	assert_ne(m.city, "Testville")
	assert_string_contains(m.debug_text(), m.city)


func test_new_country_button_lands_him_abroad() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	m._step(0.1)
	m.hud.debug_controls()["debug_country"].pressed.emit()
	assert_false(m.walker.is_traveling())
	assert_ne(m.country, "BGR")


func test_debug_log_survives_a_restart_but_not_a_new_city() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	m._step(0.1)
	m._save()
	var again := _new_main(autofree(FakeOsmApi.new()))
	assert_eq(again.debug_log.entries.size(), 1)
	again._reset()
	assert_eq(again.debug_log.entries, [])


func test_nothing_overlaps_with_the_debug_panel_open() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	_crowd_the_top_panel(m)
	for i in 20:
		m.debug_new_goal()
	m.hud.open_debug()
	m._step(0.01)
	await wait_frames(3)
	assert_eq(m.hud.overlapping_texts(), [])


func test_nothing_overlaps_with_the_debug_button_and_back_to_him() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	_crowd_the_top_panel(m)
	m.hud.goal_tapped.emit()
	m.hud.open_menu()
	m._step(0.01)
	await wait_frames(3)
	assert_true(m.hud.debug_controls()["debug"].is_visible_in_tree())
	assert_eq(m.hud.overlapping_texts(), [])


func test_nothing_overlaps_in_help() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	m.hud.open_help()
	await wait_frames(3)
	assert_eq(m.hud.overlapping_texts(), [], "topic list")
	for id in ["walking", "health", "items"]:
		m.hud.open_help(id)
		await wait_frames(3)
		assert_eq(m.hud.overlapping_texts(), [], id)
