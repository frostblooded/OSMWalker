## Stand-in for OsmApi that answers from the fixture instead of the network.
extends "res://scripts/osm_api.gd"

const Fixture := preload("res://tests/support/osm_fixture.gd")

var online := true
var delay_frames := 1
var street_requests: Array = []  # bboxes asked for
var searches: Array = []


func fetch_streets(bbox: Array) -> Variant:
	street_requests.append(bbox)
	for i in delay_frames:
		await get_tree().process_frame
	return Fixture.data() if online else null


func search_places(text: String) -> Array:
	searches.append(text)
	await get_tree().process_frame
	if not online:
		return []
	return [{"name": "Testville, Nowhere", "lat": 42.0, "lon": 23.0}]
