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
