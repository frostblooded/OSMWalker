## Main scene end to end inside Godot: UI signals, walker, saving, with a fake OSM API.
extends GutTest

const Main := preload("res://scripts/main.gd")
const Walker := preload("res://scripts/walker.gd")
const StreetGraph := preload("res://scripts/street_graph.gd")
const Stats := preload("res://scripts/stats.gd")
const Activities := preload("res://scripts/activities.gd")
const FakeOsmApi := preload("res://tests/support/fake_osm_api.gd")
const DiskCache := preload("res://scripts/disk_cache.gd")
const SAVE := "user://test_save.json"
const STREETS := "user://test_streets/"

var api: FakeOsmApi


func before_each() -> void:
	DirAccess.remove_absolute(SAVE)
	DiskCache.new(STREETS).clear()
	api = FakeOsmApi.new()


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


func test_search_shows_results() -> void:
	var m := _new_main()
	m.hud.search_requested.emit("Testville")
	await wait_until(func(): return m.hud.debug_controls()["result0"] != null, 2.0)
	assert_eq(api.searches, ["Testville"])
	assert_not_null(m.hud.debug_controls()["result0"])


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
	for key in ["new_city", "zoom_in"]:
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
	m.walker.place = {"name": "Cafe East", "class": "cafe", "subclass": "cafe", "rank": 1, "lat": 42.0, "lon": 23.00135}
	await wait_frames(2)
	assert_eq(m.hud.place_label.text, "Walking to Cafe East")
	assert_true(m.place_pin.visible)
	assert_eq(m.place_pin.position, m.map.geo_to_local(42.0, 23.00135))
	assert_eq(m.debug_state()["place"], "Cafe East")
	m.walker.place = {}
	await wait_frames(2)
	assert_false(m.place_pin.visible)
	assert_false(m.hud.place_label.visible)


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
	assert_between(m.walker.rest_m, 0.0, 15.0 * 60.0 * Walker.SPEED_MPS + 0.01)


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
	m.stats.say("Did a thing")
	m._step(0.1)
	m.hud.open_sheet()
	assert_true(m.hud.is_sheet_open())
	assert_string_contains(m.hud.sheet_label.text, "Did a thing")
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
	assert_true(m.walker.is_resting())


func test_stats_survive_a_restart() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	m.stats.coins = 99
	m.stats.say("Remember me")
	m._save()
	var again := _new_main(autofree(FakeOsmApi.new()))
	assert_eq(again.stats.coins, 99)
	assert_eq(again.stats.feed[-1], "Remember me")


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


func test_city_trivia_from_wikidata_happens_at_random_spots() -> void:
	var m := _new_main()
	m.api.city_rows = [{"cityLabel": {"value": "Testville"}, "capLabel": {"value": "Nowhere"}}]
	await _start_in_testville(m)
	await wait_until(func(): return m.city_facts.size() > 0, 1.0)
	assert_eq(m.api.city_lookups.size(), 1)
	assert_eq(m.city_facts.size(), 1)
	m.clock_hour = 12
	m.activities = Activities.new({"_spot": []})
	m.walker.arrived.emit({})
	assert_string_contains(m.stats.feed[-1], "capital of Nowhere")


func test_no_trivia_when_wikidata_is_unreachable() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	await wait_until(func(): return m.api.city_lookups.size() > 0, 1.0)
	await wait_seconds(0.1)
	assert_eq(m.city_facts, [])
