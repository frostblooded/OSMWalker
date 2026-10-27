## Network access to OSM services: Overpass for streets, Nominatim for city search.
extends Node

## Public Overpass servers, tried in order; the main one is often busy (429/504).
const OVERPASS_URLS := [
	"https://overpass-api.de/api/interpreter",
	"https://overpass.private.coffee/api/interpreter",
	"https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
const NOMINATIM_URL := "https://nominatim.openstreetmap.org/search"
const USER_AGENT := "OSMWalker/0.1 (https://github.com/frostblooded/OSMWalker)"
const WALKABLE := "primary|secondary|tertiary|unclassified|residential|living_street|pedestrian|footway|path|service|track|steps|cycleway"


## Browsers forbid setting User-Agent; they send their own plus a Referer.
static func headers() -> PackedStringArray:
	if OS.has_feature("web"):
		return PackedStringArray()
	return PackedStringArray(["User-Agent: " + USER_AGENT])


static func overpass_query(bbox: Array) -> String:
	# Ways with tags (for street names), then their nodes as bare coordinates.
	return "[out:json][timeout:25];way[\"highway\"~\"^(%s)$\"](%f,%f,%f,%f);out body;node(w);out skel qt;" % [
		WALKABLE, bbox[0], bbox[1], bbox[2], bbox[3]]


## GETs `url` and returns parsed JSON, or null on any failure.
func _get_json(url: String) -> Variant:
	var req := HTTPRequest.new()
	req.timeout = 60.0
	add_child(req)
	if req.request(url, headers()) != OK:
		req.queue_free()
		return null
	var res: Array = await req.request_completed
	req.queue_free()
	if res[0] != HTTPRequest.RESULT_SUCCESS or res[1] != 200:
		push_warning("OSM request failed (%s, HTTP %s): %s" % [res[0], res[1], url.left(120)])
		return null
	return JSON.parse_string((res[3] as PackedByteArray).get_string_from_utf8())


## Walkable streets inside `bbox`, as Overpass JSON, or null.
func fetch_streets(bbox: Array) -> Variant:
	var query := overpass_query(bbox).uri_encode()
	for url in OVERPASS_URLS:
		var data: Variant = await _get_json(url + "?data=" + query)
		if data is Dictionary:
			return data
	return null


## Up to 6 places matching `text`, each {name, lat, lon}. Empty on failure.
func search_places(text: String) -> Array:
	var data: Variant = await _get_json("%s?format=jsonv2&limit=6&q=%s" % [NOMINATIM_URL, text.uri_encode()])
	var out := []
	if data is Array:
		for r in data:
			out.append({"name": r.get("display_name", ""), "lat": float(r["lat"]), "lon": float(r["lon"])})
	return out
