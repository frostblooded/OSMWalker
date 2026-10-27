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


func test_progress_bar_shows_real_progress() -> void:
	var hud: Hud = autofree(Hud.new())
	add_child(hud)
	hud.set_status("Catching up…", Hud.Bar.PROGRESS, 0.25)
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
	hud.set_status("Catching up…", Hud.Bar.PROGRESS, 0.5)
	hud.set_status("")
	assert_false(hud.progress_bar.is_visible_in_tree())


func test_progress_bar_is_big_enough_to_see() -> void:
	var hud: Hud = autofree(Hud.new())
	add_child(hud)
	hud.set_status("Catching up…", Hud.Bar.PROGRESS, 0.5)
	await wait_frames(2)
	assert_gte(hud.progress_bar.size.y, 24.0)
	assert_gt(hud.progress_bar.size.x, 400.0)


func test_catch_up_fraction() -> void:
	assert_almost_eq(Hud.catch_up_fraction(1000.0, 1000.0), 0.0, 1e-6)
	assert_almost_eq(Hud.catch_up_fraction(1000.0, 250.0), 0.75, 1e-6)
	assert_almost_eq(Hud.catch_up_fraction(0.0, 0.0), 1.0, 1e-6)


func test_detail_text_spells_out_catch_up_progress() -> void:
	var t := Hud.detail_text({
		"total_m": 288000.0, "pending_m": 144000.0, "speed_mps": 9600.0,
		"doing": "waiting for streets here: downloading",
		"streets": {"loaded": 40, "from_cache": 10, "downloaded": 30, "downloading": 3, "unpacking": 1, "failed": 2, "queued": 5},
		"last_ok": {"host": "overpass-api.de", "bytes": 2500000, "ms": 8200},
		"last_error": {"host": "maps.mail.ru", "error": "HTTP 429 (server busy)", "ago_s": 12},
		"tiles": {"on_screen": 24, "loaded": 20, "downloading": 4, "queued": 2, "failed": 0},
	})
	assert_string_contains(t, "144.0 of 288.0 km")
	assert_string_contains(t, "50%")
	assert_string_contains(t, "9.6 km/s")
	assert_string_contains(t, "2880x")
	assert_string_contains(t, "15 s left")
	assert_string_contains(t, "waiting for streets here: downloading")
	assert_string_contains(t, "40 areas loaded (10 from cache, 30 downloaded)")
	assert_string_contains(t, "3 downloading")
	assert_string_contains(t, "overpass-api.de")
	assert_string_contains(t, "2.4 MB in 8.2 s")
	assert_string_contains(t, "HTTP 429 (server busy)")
	assert_string_contains(t, "12 s ago")
	assert_string_contains(t, "20 of 24 on screen")


func test_detail_text_without_catch_up_skips_progress() -> void:
	var t := Hud.detail_text({"doing": "walking", "streets": {}, "tiles": {}})
	assert_false(t.contains("Caught up"))
	assert_string_contains(t, "walking")


func test_status_shows_detail_lines() -> void:
	var hud: Hud = add_child_autofree(Hud.new())
	hud.set_status("Loading streets…", Hud.Bar.BUSY, 0.0, "Now: waiting")
	assert_true(hud.detail_label.visible)
	assert_eq(hud.detail_label.text, "Now: waiting")
	hud.set_status("")
	assert_false(hud.detail_label.visible)
