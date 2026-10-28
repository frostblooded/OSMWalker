## Stand-in for OsmApi that answers from the fixture instead of the network.
extends "res://scripts/osm_api.gd"

const Fixture := preload("res://tests/support/osm_fixture.gd")

var online := true
var delay_frames := 1
var street_requests: Array = []  # bboxes asked for
var first_servers: Array = []  # which server each request tried first
var searches: Array = []
var tile_requests: Array = []  # z14 tiles asked for
var tiles_online := true
var city_rows: Array = []  # Wikidata answer; [] acts like no answer
var city_lookups: Array = []  # [lat, lon] asked for
var route_requests: Array = []  # [from, to] asked for
var route: Array = []  # OSRM answer as [[lat, lon]...]; [] acts like no answer


func fetch_streets(bbox: Array, first_server := 0) -> Variant:
	street_requests.append(bbox)
	first_servers.append(first_server)
	for i in delay_frames:
		await get_tree().process_frame
	return Fixture.data() if online else null


func _init() -> void:
	use_tiles = false  # most tests drive the Overpass path


func fetch_street_tile(tile: Vector2i) -> Variant:
	tile_requests.append(tile)
	for i in delay_frames:
		await get_tree().process_frame
	return Fixture.data() if online and tiles_online else null


func search_places(text: String) -> Variant:
	searches.append(text)
	await get_tree().process_frame
	if not online:
		return null
	return [{"name": "Testville, Nowhere", "lat": 42.0, "lon": 23.0}]


func fetch_city_facts(lat: float, lon: float) -> Array:
	city_lookups.append([lat, lon])
	await get_tree().process_frame
	return city_rows if online else []


func fetch_route(a: Array, b: Array) -> Array:
	route_requests.append([a, b])
	await get_tree().process_frame
	return route if online else []
