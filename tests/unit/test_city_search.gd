## The city picker searches while the player types, like an autocomplete.
extends GutTest

const Hud := preload("res://scripts/hud.gd")

var hud: Hud
var asked: Array


func before_each() -> void:
	hud = add_child_autofree(Hud.new())
	hud.autocomplete_delay = 0.05
	asked = []
	hud.search_requested.connect(func(t): asked.append(t))


func _type(text: String) -> void:
	var box: LineEdit = hud.debug_controls()["search_box"]
	box.text = text
	box.text_changed.emit(text)


func _status() -> String:
	return hud.debug_controls()["picker_status"].text


func test_typing_searches_once_the_player_pauses() -> void:
	_type("Com")
	_type("Comp")
	_type("Compi")
	assert_eq(asked, [])
	await wait_seconds(0.2)
	assert_eq(asked, ["Compi"])


func test_too_short_text_does_not_search() -> void:
	_type("Co")
	await wait_seconds(0.2)
	assert_eq(asked, [])


func test_search_button_searches_at_once() -> void:
	_type("Compiegne")
	(hud.debug_controls()["search_button"] as Button).pressed.emit()
	assert_eq(asked, ["Compiegne"])
	await wait_seconds(0.2)
	assert_eq(asked, ["Compiegne"], "the pending autocomplete was dropped")


func test_results_for_older_text_are_ignored() -> void:
	_type("Compiegne")
	hud.show_results([{"name": "Comp, Somewhere", "lat": 1.0, "lon": 2.0}], "Comp")
	assert_null(hud.debug_controls()["result0"])
	hud.show_results([{"name": "Compiègne, France", "lat": 49.4, "lon": 2.8}], "Compiegne")
	assert_eq((hud.debug_controls()["result0"] as Button).text, "Compiègne, France")


func test_new_results_replace_old_ones() -> void:
	_type("Compi")
	hud.show_results([{"name": "A", "lat": 1.0, "lon": 2.0}, {"name": "B", "lat": 1.0, "lon": 2.0}], "Compi")
	_type("Compie")
	hud.show_results([{"name": "C", "lat": 1.0, "lon": 2.0}], "Compie")
	assert_eq((hud.debug_controls()["result0"] as Button).text, "C")


func test_server_failure_is_not_nothing_found() -> void:
	_type("Compiegne")
	hud.show_results(null, "Compiegne")
	assert_string_contains(_status(), "Couldn't reach")
	hud.show_results([], "Compiegne")
	assert_string_contains(_status(), "Nothing found")
