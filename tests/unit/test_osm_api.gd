extends GutTest

const OsmApi := preload("res://scripts/osm_api.gd")


## Answers like a list of servers where only the last one works.
class FlakyApi:
	extends "res://scripts/osm_api.gd"
	var asked: Array = []

	func _get_json(url: String, _timeout := 60.0) -> Variant:
		asked.append(url)
		return {"elements": []} if url.begins_with(OVERPASS_URLS[-1]) else null


func test_has_fallback_overpass_servers() -> void:
	assert_gte(OsmApi.OVERPASS_URLS.size(), 2)


func test_falls_back_to_next_server_on_failure() -> void:
	var api: FlakyApi = autofree(FlakyApi.new())
	var data: Variant = await api.fetch_streets([1.0, 2.0, 3.0, 4.0])
	assert_eq(data, {"elements": []})
	assert_eq(api.asked.size(), OsmApi.OVERPASS_URLS.size())


## Every server down.
class DownApi:
	extends "res://scripts/osm_api.gd"
	func _get_json(_url: String, _timeout := 60.0) -> Variant:
		return null


func test_returns_null_when_every_server_fails() -> void:
	var api: DownApi = autofree(DownApi.new())
	assert_null(await api.fetch_streets([1.0, 2.0, 3.0, 4.0]))


func test_query_returns_way_names_and_lean_nodes() -> void:
	var q := OsmApi.overpass_query([1.0, 2.0, 3.0, 4.0])
	assert_string_contains(q, "out body;")
	assert_string_contains(q, "out skel qt;")


func test_starts_at_the_requested_server() -> void:
	var api: FlakyApi = autofree(FlakyApi.new())
	await api.fetch_streets([1.0, 2.0, 3.0, 4.0], 1)
	assert_true(api.asked[0].begins_with(OsmApi.OVERPASS_URLS[1]))
