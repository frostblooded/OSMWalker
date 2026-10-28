## Network access to OSM services: Overpass for streets, Photon (Nominatim as
## backup) for city search.
extends Node

const OfmStreets := preload("res://scripts/ofm_streets.gd")
const CityFacts := preload("res://scripts/city_facts.gd")

## Public Overpass servers, tried in order; the main one is often busy (429/504).
const OVERPASS_URLS := [
	"https://overpass-api.de/api/interpreter",
	"https://overpass.private.coffee/api/interpreter",
	"https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
## Free vector tiles, no key needed. The TileJSON names the current tile set.
const OFM_TILEJSON := "https://tiles.openfreemap.org/planet"
const TILE_TIMEOUT_S := 20.0
## Built for search-as-you-type and forgiving about typos and accents; the
## Nominatim policy forbids autocomplete, so it only steps in when Photon fails.
const PHOTON_URL := "https://photon.komoot.io/api/"
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


## A busy server gets this long before the next one is tried. Longer than the
## query's own [timeout:25], or slow but valid answers get thrown away.
const OVERPASS_TIMEOUT_S := 35.0
## A server that just failed is tried last for this long.
const REST_MS := 60000

## What happened to the latest requests, for the on-screen loading details.
var last_ok := {}  # {host, bytes, ms, at_ms}
var last_error := {}  # {host, error, at_ms}
var active_requests := 0
var server_stats := {}  # host -> {ok, fail, last_error, rest_until_ms}
## Get streets from OpenFreeMap tiles first, with Overpass as the backup.
var use_tiles := true
var _tile_url := ""  # from the TileJSON
var _search_cache := {}  # lowercased query -> places


static func host_of(url: String) -> String:
	return url.get_slice("://", 1).get_slice("/", 0)


## A failed request in plain words.
static func describe_failure(result: int, code: int) -> String:
	if result == HTTPRequest.RESULT_SUCCESS:
		match code:
			429: return "HTTP 429 (server busy)"
			504: return "HTTP 504 (server timed out)"
			503: return "HTTP 503 (server overloaded)"
		return "HTTP %d" % code
	match result:
		HTTPRequest.RESULT_TIMEOUT: return "no answer in time"
		HTTPRequest.RESULT_CANT_CONNECT, HTTPRequest.RESULT_CANT_RESOLVE: return "can't connect"
		HTTPRequest.RESULT_CONNECTION_ERROR: return "connection dropped"
		HTTPRequest.RESULT_BODY_SIZE_LIMIT_EXCEEDED: return "answer too big"
	return "request failed (code %d)" % result


func _fail(url: String, error: String) -> void:
	last_error = {"host": host_of(url), "error": error, "at_ms": Time.get_ticks_msec()}
	push_warning("OSM request failed (%s): %s" % [error, url.left(120)])


## GETs `url` and returns the body, or null on any failure.
func _get_bytes(url: String, timeout := 60.0) -> Variant:
	var req := HTTPRequest.new()
	req.timeout = timeout
	add_child(req)
	var started := Time.get_ticks_msec()
	if req.request(url, headers()) != OK:
		req.queue_free()
		_fail(url, "couldn't start the request")
		return null
	active_requests += 1
	var res: Array = await req.request_completed
	active_requests -= 1
	req.queue_free()
	if res[0] != HTTPRequest.RESULT_SUCCESS or res[1] != 200:
		_fail(url, describe_failure(res[0], res[1]))
		return null
	var body: PackedByteArray = res[3]
	last_ok = {"host": host_of(url), "bytes": body.size(), "ms": Time.get_ticks_msec() - started, "at_ms": Time.get_ticks_msec()}
	return body


## GETs `url` and returns parsed JSON, or null on any failure.
func _get_json(url: String, timeout := 60.0) -> Variant:
	var body: Variant = await _get_bytes(url, timeout)
	if body == null:
		return null
	var parsed: Variant = JSON.parse_string(body.get_string_from_utf8())
	if parsed == null:
		_fail(url, "answer was not valid JSON")
	return parsed


## Walkable streets of one z14 tile from OpenFreeMap, as Overpass-style JSON,
## or null. Tiles sit on a CDN, so they come back far quicker than Overpass.
func fetch_street_tile(tile: Vector2i) -> Variant:
	if _tile_url == "":
		var tj: Variant = await _get_bytes(OFM_TILEJSON, TILE_TIMEOUT_S)
		var parsed: Variant = JSON.parse_string(tj.get_string_from_utf8()) if tj is PackedByteArray else null
		if not parsed is Dictionary or parsed.get("tiles", []).is_empty():
			_server_result(OFM_TILEJSON, _error_for(OFM_TILEJSON))
			return null
		_tile_url = parsed["tiles"][0]
	var url := _tile_url.replace("{z}", str(OfmStreets.TILE_ZOOM)).replace("{x}", str(tile.x)).replace("{y}", str(tile.y))
	var body: Variant = await _get_bytes(url, TILE_TIMEOUT_S)
	if not body is PackedByteArray:
		_server_result(url, _error_for(url))
		return null
	if body.size() > 2 and body[0] == 0x1F and body[1] == 0x8B:
		body = body.decompress_dynamic(-1, FileAccess.COMPRESSION_GZIP)
	_server_result(url, "")
	await get_tree().process_frame  # decoding takes a while; let a frame draw first
	return OfmStreets.from_pbf(body, tile)


## True while the tile server is resting after a failure.
func tiles_resting() -> bool:
	return Time.get_ticks_msec() < server_stats.get(host_of(OFM_TILEJSON), {}).get("rest_until_ms", 0)


func _error_for(url: String) -> String:
	return last_error.get("error", "failed") if last_error.get("host") == host_of(url) else "failed"


## Walkable streets inside `bbox`, as Overpass JSON, or null. Servers are
## tried in turn starting at `first_server`, so parallel downloads spread out.
func fetch_streets(bbox: Array, first_server := 0) -> Variant:
	var query := overpass_query(bbox).uri_encode()
	for url in server_order(first_server):
		var data: Variant = await _get_json(url + "?data=" + query, OVERPASS_TIMEOUT_S)
		# Overpass answers 200 with a "remark" when the query died half way:
		# that data is incomplete and must not be cached as a whole area.
		var remark: String = data.get("remark", "") if data is Dictionary else ""
		if "error" in remark.to_lower():
			_fail(url, "server error: " + remark.left(80))
			data = null
		if data is Dictionary:
			_server_result(url, "")
			return data
		_server_result(url, _error_for(url))
	return null


## Overpass servers to try, starting at `first_server`; ones resting after a
## recent failure go last.
func server_order(first_server := 0) -> Array:
	var now := Time.get_ticks_msec()
	var fresh := []
	var resting := []
	for i in OVERPASS_URLS.size():
		var url: String = OVERPASS_URLS[(first_server + i) % OVERPASS_URLS.size()]
		var st: Dictionary = server_stats.get(host_of(url), {})
		(resting if now < st.get("rest_until_ms", 0) else fresh).append(url)
	return fresh + resting


func _server_result(url: String, error: String) -> void:
	var host := host_of(url)
	var st: Dictionary = server_stats.get(host, {"ok": 0, "fail": 0, "last_error": "", "rest_until_ms": 0})
	if error == "":
		st["ok"] += 1
		st["rest_until_ms"] = 0
	else:
		st["fail"] += 1
		st["last_error"] = error
		st["rest_until_ms"] = Time.get_ticks_msec() + REST_MS
	server_stats[host] = st


## Up to 6 places matching `text`, each {name, lat, lon, bbox}, bbox being
## [south, west, north, east] or empty. Null when every search server fails.
## Answers are kept for the session, so retyping costs no request.
func search_places(text: String) -> Variant:
	var key := text.strip_edges().to_lower()
	if _search_cache.has(key):
		return _search_cache[key]
	var q := text.strip_edges().uri_encode()
	var places: Variant = photon_places(await _get_json("%s?limit=6&q=%s" % [PHOTON_URL, q]))
	if places == null:
		places = nominatim_places(await _get_json("%s?format=jsonv2&limit=6&q=%s" % [NOMINATIM_URL, q]))
	if places != null:
		_search_cache[key] = places
	return places


## Places from a Photon GeoJSON answer, or null if it isn't one.
static func photon_places(data: Variant) -> Variant:
	if not data is Dictionary or not data.get("features") is Array:
		return null
	var out := []
	for f in data["features"]:
		var p: Dictionary = f.get("properties", {})
		var c: Array = f.get("geometry", {}).get("coordinates", [])
		if c.size() < 2:
			continue
		var parts := []
		for k in ["name", "city", "state", "country"]:
			var v: String = str(p.get(k, ""))
			if v != "" and not v in parts:
				parts.append(v)
		var e: Array = p.get("extent", [])  # [west, north, east, south]
		var bbox := [float(e[3]), float(e[0]), float(e[1]), float(e[2])] if e.size() == 4 else []
		out.append({"name": ", ".join(parts), "lat": float(c[1]), "lon": float(c[0]), "bbox": bbox})
	return out


## Places from a Nominatim jsonv2 answer, or null if it isn't one.
static func nominatim_places(data: Variant) -> Variant:
	if not data is Array:
		return null
	var out := []
	for r in data:
		var b: Array = r.get("boundingbox", [])  # [south, north, west, east]
		var bbox := [float(b[0]), float(b[2]), float(b[1]), float(b[3])] if b.size() == 4 else []
		out.append({"name": r.get("display_name", ""), "lat": float(r["lat"]), "lon": float(r["lon"]), "bbox": bbox})
	return out


## Wikidata facts about the city around (lat, lon), as SPARQL result rows.
## Empty on failure.
func fetch_city_facts(lat: float, lon: float) -> Array:
	var data: Variant = await _get_json(CityFacts.url(lat, lon), 30.0)
	if data is Dictionary:
		return data.get("results", {}).get("bindings", [])
	return []
