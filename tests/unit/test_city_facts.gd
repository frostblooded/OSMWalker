## City trivia from Wikidata: the query and the actions made from its answer.
extends GutTest

const CityFacts := preload("res://scripts/city_facts.gd")


static func _row(fields: Dictionary) -> Dictionary:
	var row := {"city": {"value": "http://www.wikidata.org/entity/Q472"}, "cityLabel": {"value": "Sofia"}}
	for k in fields:
		row[k] = {"value": fields[k]}
	return row


func _names(actions: Array) -> Array:
	return actions.map(func(a): return a["name"])


func test_query_looks_around_the_city_centre() -> void:
	var q := CityFacts.query(42.6977, 23.3219)
	assert_string_contains(q, "Point(23.3219 42.6977)")
	assert_string_contains(q, "wdt:P1082")
	assert_string_contains(CityFacts.url(42.6977, 23.3219), "https://query.wikidata.org/sparql?format=json&query=")


func test_facts_become_trivia_actions() -> void:
	var rows := [
		_row({"inception": "-0700-01-01T00:00:00Z", "pop": "1286383", "elev": "550", "twinLabel": "Bratislava",
			"namedLabel": "Hagia Sophia", "capLabel": "Bulgaria"}),
		_row({"inception": "-0700-01-01T00:00:00Z", "pop": "1286383", "elev": "550", "twinLabel": "Kyiv",
			"namedLabel": "Hagia Sophia", "capLabel": "Bulgaria"}),
	]
	var names := _names(CityFacts.actions(rows))
	assert_has(names, "Learn that Sofia was founded in 700 BC")
	assert_has(names, "Read that about 1,290,000 people live in Sofia")
	assert_has(names, "Notice Sofia sits 550 m above the sea")
	assert_has(names, "Find a signpost to Sofia's twin town Bratislava")
	assert_has(names, "Find a signpost to Sofia's twin town Kyiv")
	assert_has(names, "Learn that Sofia is named after Hagia Sophia")
	assert_has(names, "Remember that Sofia is the capital of Bulgaria")
	assert_eq(names.size(), 7, "no repeats from the row cross product")


func test_trivia_is_quick_and_teaches_a_little() -> void:
	for a in CityFacts.actions([_row({"inception": "1701-05-01T00:00:00Z"})]):
		assert_eq(a["name"], "Learn that Sofia was founded in 1701")
		assert_lte(a["min"], 10)
		assert_gt(a["fx"]["wit"], 0.0)
		assert_gt(a["fx"]["xp"], 0)


func test_twin_towns_are_capped() -> void:
	var rows := []
	for i in 20:
		rows.append(_row({"twinLabel": "Town %d" % i}))
	assert_eq(CityFacts.actions(rows).size(), CityFacts.MAX_TWINS)


func test_unlabelled_items_and_empty_answers_give_nothing() -> void:
	assert_eq(CityFacts.actions([]), [])
	# The label service falls back to the bare Q-id when there is no English label.
	assert_eq(CityFacts.actions([_row({"twinLabel": "Q12345"})]), [])
