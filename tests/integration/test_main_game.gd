## Main scene end to end inside Godot: UI signals, walker, saving, with a fake OSM API.
extends GutTest

const Main := preload("res://scripts/main.gd")
const FakeOsmApi := preload("res://tests/support/fake_osm_api.gd")
const SAVE := "user://test_save.json"

var api: FakeOsmApi


func before_each() -> void:
	DirAccess.remove_absolute(SAVE)
	api = FakeOsmApi.new()


func after_all() -> void:
	DirAccess.remove_absolute(SAVE)


func _new_main(with_api: FakeOsmApi = api) -> Main:
	var m := Main.new()
	m.api = with_api
	m.save_path = SAVE
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
	assert_eq(api.street_requests.size(), 1)
	assert_true(FileAccess.file_exists(SAVE))


func test_he_walks_in_real_time() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	await wait_seconds(0.6)
	assert_almost_eq(m.walker.total_m, 0.6 * 200.0 / 60.0, 1.0)
	assert_ne(m.hud.street_label.text, "")


func test_catches_up_on_time_away() -> void:
	var m := _new_main()
	await _start_in_testville(m)
	m.last_tick -= 600.0  # 10 minutes away
	await wait_frames(2)
	assert_almost_eq(m.walker.total_m, 2000.0, 5.0)


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
