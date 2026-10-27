## Main scene end to end inside Godot: UI signals, walker, saving, with a fake OSM API.
extends GutTest

const Main := preload("res://scripts/main.gd")
const StreetGraph := preload("res://scripts/street_graph.gd")
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
	add_child_autofree(m)
	return m


func _start_in_testville(m: Main) -> void:
	m.hud.city_chosen.emit("Testville", 42.0, 23.0)
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


func test_he_walks_in_real_time() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	await wait_seconds(0.6)
	assert_almost_eq(m.walker.total_m, 0.6 * 200.0 / 60.0, 1.0)
	assert_ne(m.hud.street_label.text, "")


## Runs the game loop by hand in big steps, as if `seconds` passed.
func _fast_forward(m: Main, seconds: float, step := 0.5) -> void:
	var t := 0.0
	while t < seconds:
		m._step(step)
		t += step
		await wait_frames(1)


func test_catches_up_on_time_away_as_a_fast_forward() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	m.last_tick -= 600.0  # 10 minutes away = 2 km owed
	await wait_frames(2)
	assert_true(m.is_catching_up())
	assert_lt(m.walker.total_m, 500.0, "not all at once")
	var before := m.walker.total_m
	m._step(1.0)
	# 50x speed: about 167 m in one second of fast-forward.
	assert_almost_eq(m.walker.total_m - before, 50.0 * 200.0 / 60.0, 15.0)
	await _fast_forward(m, 14.0)
	assert_false(m.is_catching_up())
	assert_almost_eq(m.walker.total_m, 2000.0, 40.0)


func test_long_catch_up_ends_within_30_seconds() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	m.last_tick -= 24.0 * 3600.0
	await wait_frames(2)
	assert_true(m.is_catching_up())
	await _fast_forward(m, 31.0, 1.0)
	assert_false(m.is_catching_up())
	assert_almost_eq(m.walker.total_m, 288000.0, 2000.0)


func test_zooms_out_while_catching_up_then_back() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	var zoom := m.map.zoom
	m.last_tick -= 600.0
	await wait_frames(2)
	assert_eq(m.map.zoom, Main.CATCH_UP_ZOOM)
	await _fast_forward(m, 15.0)
	assert_eq(m.map.zoom, zoom)


func test_saves_the_players_zoom_not_the_catch_up_zoom() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	m.last_tick -= 600.0
	await wait_frames(2)
	m._save()
	var d: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(SAVE))
	assert_eq(int(d["zoom"]), 17)


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

	var second := _new_main(FakeOsmApi.new())
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
	m.hud.city_chosen.emit("Testville", 42.0, 23.0)
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


func test_no_catch_up_message_while_walking_normally() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	m.pending_m = 40.0  # a short stall, e.g. waiting for streets
	await wait_frames(2)
	assert_false(m.hud.overlay_label.visible)


func test_catch_up_message_after_time_away_then_clears() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	api.online = false  # keep him owing distance while we look
	_forget_streets(m)
	m.last_tick -= 300.0  # 5 minutes away = 1 km owed
	await wait_frames(2)
	assert_true(m.hud.overlay_label.visible)
	assert_string_contains(m.hud.overlay_label.text, "km walked while you were away")
	assert_true(m.hud.progress_bar.is_visible_in_tree())
	assert_false(m.hud.progress_bar.indeterminate)
	assert_lt(m.hud.progress_bar.value, 5.0)
	api.online = true
	m.loader.reset_failures()
	await _fast_forward(m, 10.0)
	assert_false(m.hud.overlay_label.visible)
	assert_false(m.hud.progress_bar.is_visible_in_tree())


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


func test_catch_up_bar_fills_as_he_walks_the_owed_distance() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	api.online = false
	_forget_streets(m)
	m.last_tick -= 300.0
	await wait_frames(2)
	var owed := m.pending_m
	# Simulate part of the owed distance being walked.
	m.pending_m = owed / 2.0
	await wait_frames(1)
	assert_almost_eq(m.hud.progress_bar.value, 50.0, 2.0)


## Drops every loaded cell, the disk cache too, so he has to wait for the network.
func _forget_streets(m: Main) -> void:
	m.walker.graph.cells.clear()
	m.walker.to_node = -1
	DiskCache.new(STREETS).clear()
	m.loader.forget_cache_checks()


func test_catch_up_says_when_he_waits_for_streets() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	api.delay_frames = 100000
	_forget_streets(m)
	m.last_tick -= 600.0
	await wait_frames(3)
	assert_true(m.is_catching_up())
	assert_true(m.hud.detail_label.visible)
	assert_string_contains(m.hud.detail_label.text, "waiting for streets")
	assert_string_contains(m.hud.detail_label.text, "downloading")
	assert_string_contains(m.hud.overlay_label.text, "Catching up")


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
	m.hud.city_chosen.emit("Testville", 42.0, 23.0)
	await wait_frames(3)
	var text: String = m.hud._picker_status.text
	assert_string_contains(text, "Finding streets in Testville")
	assert_string_contains(text, "downloading")
	assert_string_contains(text, "Streets:")
