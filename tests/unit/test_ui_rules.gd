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


func test_no_catch_up_message_for_short_waits() -> void:
	assert_eq(Hud.catch_up_text(0.0), "")
	assert_eq(Hud.catch_up_text(150.0), "")


func test_catch_up_message_in_meters_then_km() -> void:
	assert_eq(Hud.catch_up_text(350.0), "Catching up: 350 m walked while you were away…")
	assert_eq(Hud.catch_up_text(1450.0), "Catching up: 1.4 km walked while you were away…")


func test_status_label_spans_the_screen_and_hides_when_empty() -> void:
	var hud: Hud = autofree(Hud.new())
	add_child(hud)
	hud.set_status("Catching up: 350 m walked while you were away…")
	await wait_frames(2)
	assert_true(hud.overlay_label.visible)
	# Regression: a zero-width label wrapped after every letter.
	assert_gt(hud.overlay_label.size.x, 400.0)
	assert_lt(hud.overlay_label.size.y, 200.0)
	hud.set_status("")
	assert_false(hud.overlay_label.visible)
