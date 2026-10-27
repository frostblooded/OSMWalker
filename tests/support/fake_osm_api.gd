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


func search_places(text: String) -> Array:
	searches.append(text)
	await get_tree().process_frame
	if not online:
		return []
	return [{"name": "Testville, Nowhere", "lat": 42.0, "lon": 23.0}]
