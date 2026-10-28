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


func test_describes_failures_in_plain_words() -> void:
	assert_eq(OsmApi.describe_failure(HTTPRequest.RESULT_SUCCESS, 429), "HTTP 429 (server busy)")
	assert_eq(OsmApi.describe_failure(HTTPRequest.RESULT_SUCCESS, 504), "HTTP 504 (server timed out)")
	assert_eq(OsmApi.describe_failure(HTTPRequest.RESULT_TIMEOUT, 0), "no answer in time")
	assert_eq(OsmApi.describe_failure(HTTPRequest.RESULT_CANT_CONNECT, 0), "can't connect")


## Answers 200 but with an Overpass runtime error, then a good answer.
class RemarkApi:
	extends "res://scripts/osm_api.gd"
	var asked := 0

	func _get_json(_url: String, _timeout := 60.0) -> Variant:
		asked += 1
		if asked == 1:
			return {"elements": [], "remark": "runtime error: Query timed out in \"query\" at line 1 after 26 seconds."}
		return {"elements": [{"type": "node", "id": 1, "lat": 1.0, "lon": 2.0}]}


func test_overpass_runtime_error_counts_as_a_failure() -> void:
	var api: RemarkApi = autofree(RemarkApi.new())
	var data: Variant = await api.fetch_streets([1.0, 2.0, 3.0, 4.0])
	assert_eq(api.asked, 2)
	assert_eq((data["elements"] as Array).size(), 1)
	assert_string_contains(api.last_error["error"], "Query timed out")
	assert_eq(api.last_error["host"], OsmApi.host_of(OsmApi.OVERPASS_URLS[0]))


func test_host_of_url() -> void:
	assert_eq(OsmApi.host_of("https://overpass-api.de/api/interpreter?data=x"), "overpass-api.de")


func test_waits_longer_than_overpass_itself_allows() -> void:
	# The query says [timeout:25]; hanging up sooner throws away slow but valid answers.
	assert_gt(OsmApi.OVERPASS_TIMEOUT_S, 25.0)


func test_failing_servers_rest_and_go_last() -> void:
	var api: FlakyApi = autofree(FlakyApi.new())
	await api.fetch_streets([1.0, 2.0, 3.0, 4.0])
	api.asked.clear()
	await api.fetch_streets([1.0, 2.0, 3.0, 4.0])
	# Only the last server worked, so it is now tried first.
	assert_true(api.asked[0].begins_with(OsmApi.OVERPASS_URLS[-1]))
	assert_eq(api.asked.size(), 1)


func test_counts_successes_and_failures_per_server() -> void:
	var api: FlakyApi = autofree(FlakyApi.new())
	await api.fetch_streets([1.0, 2.0, 3.0, 4.0])
	var first: Dictionary = api.server_stats[OsmApi.host_of(OsmApi.OVERPASS_URLS[0])]
	var last: Dictionary = api.server_stats[OsmApi.host_of(OsmApi.OVERPASS_URLS[-1])]
	assert_eq(first["fail"], 1)
	assert_eq(first["ok"], 0)
	assert_eq(last["ok"], 1)


## Serves the TileJSON and the Sofia tile fixture, like OpenFreeMap.
class TileApi:
	extends "res://scripts/osm_api.gd"
	var asked: Array = []
	var gzip := false
	var down := false

	func _get_bytes(url: String, _timeout := 60.0) -> Variant:
		asked.append(url)
		if down:
			_fail(url, "HTTP 503 (server overloaded)")
			return null
		if url == OFM_TILEJSON:
			return '{"tiles": ["https://tiles.openfreemap.org/planet/v1/{z}/{x}/{y}.pbf"]}'.to_utf8_buffer()
		var pbf := FileAccess.get_file_as_bytes("res://tests/fixtures/ofm/14_9253_6039.pbf")
		return pbf.compress(FileAccess.COMPRESSION_GZIP) if gzip else pbf


func test_street_tile_comes_from_openfreemap() -> void:
	var api: TileApi = add_child_autofree(TileApi.new())
	var data: Variant = await api.fetch_street_tile(Vector2i(9253, 6039))
	assert_true(data is Dictionary)
	assert_gt(data["elements"].size(), 1000)
	assert_eq(api.asked, [OsmApi.OFM_TILEJSON, "https://tiles.openfreemap.org/planet/v1/14/9253/6039.pbf"])
	await api.fetch_street_tile(Vector2i(9253, 6040))
	assert_eq(api.asked.size(), 3, "the TileJSON is only read once")


func test_street_tile_unzips_gzipped_answers() -> void:
	var api: TileApi = add_child_autofree(TileApi.new())
	api.gzip = true
	var data: Variant = await api.fetch_street_tile(Vector2i(9253, 6039))
	assert_gt(data["elements"].size(), 1000)


func test_failed_tile_rests_the_tile_server() -> void:
	var api: TileApi = add_child_autofree(TileApi.new())
	api.down = true
	assert_null(await api.fetch_street_tile(Vector2i(9253, 6039)))
	assert_true(api.tiles_resting())
	assert_eq(api.server_stats[OsmApi.host_of(OsmApi.OFM_TILEJSON)]["fail"], 1)


## Answers a city search like Photon or Nominatim do, or fails like a down server.
class SearchApi:
	extends "res://scripts/osm_api.gd"
	var photon_up := true
	var nominatim_up := true
	var asked: Array = []

	func _get_json(url: String, _timeout := 60.0) -> Variant:
		asked.append(url)
		if url.begins_with(PHOTON_URL):
			return {"features": [{
				"geometry": {"type": "Point", "coordinates": [2.8261, 49.4179]},
				"properties": {"name": "Compiègne", "state": "Hauts-de-France", "country": "France",
					"osm_key": "place", "osm_value": "town", "extent": [2.7672, 49.4498, 2.8981, 49.3793]},
			}, {
				"geometry": {"type": "Point", "coordinates": [2.0, 1.0]},
				"properties": {"name": "Nowhere"},
			}]} if photon_up else null
		return [
			{"display_name": "Sofia, Bulgaria", "lat": "42.69", "lon": "23.32", "boundingbox": ["42.6", "42.8", "23.2", "23.5"]},
			{"display_name": "Nowhere", "lat": "1.0", "lon": "2.0"},
		] if nominatim_up else null


func test_search_asks_photon_without_needing_the_accent() -> void:
	var api: SearchApi = add_child_autofree(SearchApi.new())
	var places: Variant = await api.search_places("compiegne France")
	assert_eq(api.asked.size(), 1)
	assert_true(api.asked[0].begins_with(OsmApi.PHOTON_URL))
	assert_string_contains(api.asked[0], "q=compiegne%20France")
	assert_eq(places[0]["name"], "Compiègne, Hauts-de-France, France")
	assert_almost_eq(places[0]["lat"], 49.4179, 0.0001)
	assert_almost_eq(places[0]["lon"], 2.8261, 0.0001)
	# Photon sends [west, north, east, south]; we use [south, west, north, east].
	assert_eq(places[0]["bbox"], [49.3793, 2.7672, 49.4498, 2.8981])
	assert_eq(places[1]["name"], "Nowhere")
	assert_eq(places[1]["bbox"], [])


func test_search_falls_back_to_nominatim_when_photon_fails() -> void:
	var api: SearchApi = add_child_autofree(SearchApi.new())
	api.photon_up = false
	var places: Variant = await api.search_places("Sofia")
	assert_eq(api.asked.size(), 2)
	assert_true(api.asked[1].begins_with(OsmApi.NOMINATIM_URL))
	# Nominatim sends [south, north, west, east]; we use [south, west, north, east].
	assert_eq(places[0]["bbox"], [42.6, 23.2, 42.8, 23.5])
	assert_eq(places[1]["bbox"], [])


func test_search_is_null_when_every_server_fails() -> void:
	var api: SearchApi = add_child_autofree(SearchApi.new())
	api.photon_up = false
	api.nominatim_up = false
	assert_null(await api.search_places("Sofia"))


func test_search_answers_repeat_queries_from_the_cache() -> void:
	var api: SearchApi = add_child_autofree(SearchApi.new())
	var first: Variant = await api.search_places("Compiegne")
	var again: Variant = await api.search_places("  compiegne ")
	assert_eq(api.asked.size(), 1)
	assert_eq(again, first)


func test_failed_searches_are_not_cached() -> void:
	var api: SearchApi = add_child_autofree(SearchApi.new())
	api.photon_up = false
	api.nominatim_up = false
	await api.search_places("Sofia")
	api.photon_up = true
	assert_not_null(await api.search_places("Sofia"))
