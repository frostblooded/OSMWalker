extends GutTest

const Hud := preload("res://scripts/hud.gd")
const OsmApi := preload("res://scripts/osm_api.gd")


func test_reset_needs_the_exact_word() -> void:
	assert_true(Hud.is_reset_word("RESET"))
	assert_true(Hud.is_reset_word("  RESET "))
	assert_false(Hud.is_reset_word("reset"))
	assert_false(Hud.is_reset_word("RESE"))
	assert_false(Hud.is_reset_word(""))


func test_overpass_query_uses_bbox_and_walkable_streets() -> void:
	var q := OsmApi.overpass_query([1.5, 2.5, 3.5, 4.5])
	assert_string_contains(q, "(1.500000,2.500000,3.500000,4.500000)")
	assert_string_contains(q, "residential")
	assert_string_contains(q, "footway")
	assert_false(q.contains("motorway"))


func test_hud_builds() -> void:
	var hud: Hud = autofree(Hud.new())
	add_child(hud)
	hud.show_game("Sofia")
	assert_eq(hud.city_label.text, "Sofia")
	hud.set_street("Vitosha Blvd")
	assert_eq(hud.street_label.text, "Walking along Vitosha Blvd")
	hud.set_street("Vitosha Blvd", true)
	assert_eq(hud.street_label.text, "Stopped on Vitosha Blvd")
	hud.set_street("", true)
	assert_eq(hud.street_label.text, "Stopped on an unnamed path")


func test_status_label_spans_the_screen_and_hides_when_empty() -> void:
	var hud: Hud = autofree(Hud.new())
	add_child(hud)
	hud.set_status("Can't reach the map server. Retrying…")
	await wait_frames(2)
	assert_true(hud.overlay_label.visible)
	# Regression: a zero-width label wrapped after every letter.
	assert_gt(hud.overlay_label.size.x, 400.0)
	assert_lt(hud.overlay_label.size.y, 200.0)
	hud.set_status("")
	assert_false(hud.overlay_label.visible)


func test_progress_bar_shows_real_progress() -> void:
	var hud: Hud = autofree(Hud.new())
	add_child(hud)
	hud.set_status("Downloading…", Hud.Bar.PROGRESS, 0.25)
	assert_true(hud.progress_bar.is_visible_in_tree())
	assert_false(hud.progress_bar.indeterminate)
	assert_almost_eq(hud.progress_bar.value, 25.0, 0.01)


func test_progress_bar_animates_when_progress_is_unknown() -> void:
	var hud: Hud = autofree(Hud.new())
	add_child(hud)
	hud.set_status("Loading streets…", Hud.Bar.BUSY)
	assert_true(hud.progress_bar.is_visible_in_tree())
	assert_true(hud.progress_bar.indeterminate)


func test_progress_bar_hidden_without_bar_or_text() -> void:
	var hud: Hud = autofree(Hud.new())
	add_child(hud)
	hud.set_status("Can't reach the map server. Retrying…")
	assert_false(hud.progress_bar.is_visible_in_tree())
	hud.set_status("Downloading…", Hud.Bar.PROGRESS, 0.5)
	hud.set_status("")
	assert_false(hud.progress_bar.is_visible_in_tree())


func test_progress_bar_is_big_enough_to_see() -> void:
	var hud: Hud = autofree(Hud.new())
	add_child(hud)
	hud.set_status("Downloading…", Hud.Bar.PROGRESS, 0.5)
	await wait_frames(2)
	assert_gte(hud.progress_bar.size.y, 24.0)
	assert_gt(hud.progress_bar.size.x, 400.0)


func test_status_shows_detail_lines() -> void:
	var hud: Hud = add_child_autofree(Hud.new())
	hud.set_status("Loading streets…", Hud.Bar.BUSY, 0.0, "Now: waiting")
	assert_true(hud.detail_label.visible)
	assert_eq(hud.detail_label.text, "Now: waiting")
	hud.set_status("")
	assert_false(hud.detail_label.visible)


func test_detail_text_lists_each_server() -> void:
	var t := Hud.detail_text({"doing": "x", "servers": {
		"overpass-api.de": {"ok": 0, "fail": 3, "last_error": "HTTP 502", "resting": true},
		"overpass.private.coffee": {"ok": 2, "fail": 0, "last_error": "", "resting": false},
	}})
	assert_string_contains(t, "overpass-api.de: 0 ok, 3 failed (HTTP 502), resting")
	assert_string_contains(t, "overpass.private.coffee: 2 ok, 0 failed")


func test_mini_stat_names_stay_on_one_line() -> void:
	var hud: Hud = autofree(Hud.new())
	add_child(hud)
	hud.show_game("Sofia")
	await wait_frames(2)
	for bar in hud.bars.values():
		var name_label: Label = bar.get_parent().get_child(bar.get_index() - 1)
		assert_eq(name_label.autowrap_mode, TextServer.AUTOWRAP_OFF, name_label.text)


func test_goal_line_names_the_place_and_how_far_it_is() -> void:
	assert_eq(Hud.goal_text("Cafe East", 1234.0), "Going to Cafe East · 1.2 km")
	assert_eq(Hud.goal_text("", 350.4), "Going to a random spot · 350 m")


func test_tapping_the_goal_line_asks_to_see_the_goal() -> void:
	var hud: Hud = autofree(Hud.new())
	add_child(hud)
	hud.show_game("Sofia")
	hud.set_goal("Going to Cafe East · 1.2 km")
	watch_signals(hud)
	var tap := InputEventMouseButton.new()
	tap.button_index = MOUSE_BUTTON_LEFT
	tap.pressed = true
	hud.place_label.gui_input.emit(tap)
	assert_signal_emitted(hud, "goal_tapped")
	assert_eq(hud.place_label.mouse_filter, Control.MOUSE_FILTER_STOP, "the tap stops here, so the sheet stays shut")


func test_back_to_him_button_shows_only_in_the_goal_view() -> void:
	var hud: Hud = autofree(Hud.new())
	add_child(hud)
	hud.show_game("Sofia")
	assert_false(hud.debug_controls()["back_to_him"].is_visible_in_tree())
	hud.set_goal_view(true)
	assert_true(hud.debug_controls()["back_to_him"].is_visible_in_tree())
	watch_signals(hud)
	hud.debug_controls()["back_to_him"].pressed.emit()
	assert_signal_emitted(hud, "back_tapped")
