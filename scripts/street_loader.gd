## Keeps the street graph filled around the walker: disk cache first, then
## Overpass. Nearest cells go first, a few downloads run at once on different
## servers, and neighbouring cells share one query.
extends Node

const StreetGraph := preload("res://scripts/street_graph.gd")
const DiskCache := preload("res://scripts/disk_cache.gd")
const OsmApi := preload("res://scripts/osm_api.gd")

const MAX_PARALLEL := 3
const RETRY_MS := 15000
## Time per frame spent reading cached cells, so a big ring does not hitch.
const CACHE_BUDGET_US := 4000
## Time per frame spent turning a download into street data.
const BUILD_BUDGET_US := 6000

var api: OsmApi
var graph: StreetGraph:
	set(g):
		graph = g
		_cache_checked.clear()  # a fresh graph needs its cells read again
var cache: DiskCache  # null: no disk cache
var _in_flight := {}  # cell -> true
var _slots := []  # server slot -> busy downloading
var _busy := 0  # downloads still being downloaded or unpacked
var _failed := {}  # cell -> msec of last failure
var _cache_checked := {}
var _stale: Array = []  # cells served from an old cache entry, refreshed when idle
var _failing := false
# Counters for the on-screen loading details.
var _from_cache := 0
var _downloaded := 0
var _failed_downloads := 0
var _queued := 0


func _init() -> void:
	_slots.resize(MAX_PARALLEL)
	_slots.fill(false)


static func cache_name(cell: Vector2i) -> String:
	return "%d_%d_%d.bin" % [StreetGraph.CELL_ZOOM, cell.x, cell.y]


## Makes sure `wanted` (most urgent first) gets loaded. Call every frame.
func request(wanted: Array) -> void:
	var start := Time.get_ticks_usec()
	var now := Time.get_ticks_msec()
	var missing := []
	for c in wanted:
		if graph.cells.has(c) or _in_flight.has(c):
			continue
		if cache and not _cache_checked.has(c):
			if Time.get_ticks_usec() - start > CACHE_BUDGET_US:
				continue  # read it next frame
			_cache_checked[c] = true
			if _load_cached(c):
				continue
		if _failed.has(c) and now - _failed[c] < RETRY_MS:
			continue
		missing.append(c)
	# His own cell (wanted[0]) goes alone, as the smallest and quickest query,
	# and may use the slot the others leave free for it.
	if not missing.is_empty() and missing[0] == wanted[0] and _slots.has(false):
		_fetch([missing.pop_front()], false)
	# Big 2 x 2 queries only while the servers are coping.
	var bundle := not _failing
	while _slots.count(true) < MAX_PARALLEL - 1 and not missing.is_empty():
		var c: Vector2i = missing.pop_front()
		var group := [c]
		if bundle:
			for s in _siblings(c):
				if missing.has(s) and s != wanted[0]:
					group.append(s)
					missing.erase(s)
		_fetch(group, false)
	_queued = missing.size()
	if missing.is_empty() and _slots.count(true) < MAX_PARALLEL - 1 and not _stale.is_empty():
		_fetch([_stale.pop_front()], true)


## The other cells of the 2 x 2 block that `c` belongs to.
static func _siblings(c: Vector2i) -> Array:
	var base := Vector2i(c.x & ~1, c.y & ~1)
	var out := []
	for d in [Vector2i(0, 0), Vector2i(1, 0), Vector2i(0, 1), Vector2i(1, 1)]:
		if base + d != c:
			out.append(base + d)
	return out


func _load_cached(c: Vector2i) -> bool:
	var e := cache.read(cache_name(c))
	if e.is_empty():
		return false
	var compact: Variant = bytes_to_var(e["bytes"])
	if not compact is Dictionary:
		return false
	graph.add_cell(c, compact)
	_from_cache += 1
	if DiskCache.is_stale(e["t"], int(Time.get_unix_time_from_system())):
		_stale.append(c)
	return true


## Downloads `group` in one query. A refresh only rewrites the cache, for next time.
func _fetch(group: Array, refresh: bool) -> void:
	var g := graph
	var slot := _slots.find(false)
	_slots[slot] = true
	_busy += 1
	if not refresh:
		for c in group:
			_in_flight[c] = true
	var data: Variant = await api.fetch_streets(StreetGraph.cells_bbox(group), slot)
	_slots[slot] = false
	if not data is Dictionary:
		for c in group:
			_in_flight.erase(c)
		if not refresh:
			_failing = true
			_failed_downloads += 1
			for c in group:
				_failed[c] = Time.get_ticks_msec()
		_busy -= 1
		return
	_failing = false
	# Split over frames, so a big city download does not freeze the game.
	var builder := StreetGraph.CellBuilder.new(data, group)
	while not builder.step(BUILD_BUDGET_US):
		await get_tree().process_frame
	for c in builder.out:
		_failed.erase(c)
		if cache:
			cache.put(cache_name(c), var_to_bytes(builder.out[c]))
		if not refresh:
			g.add_cell(c, builder.out[c])
			_downloaded += 1
			_in_flight.erase(c)
			await get_tree().process_frame  # one cell per frame
	for c in group:
		_in_flight.erase(c)
	_busy -= 1


## Downloads still running, including ones being unpacked.
func in_flight_count() -> int:
	return _busy


func in_flight_cells() -> int:
	return _in_flight.size()


## True when the last street download failed.
func is_failing() -> bool:
	return _failing


func has_failed(c: Vector2i) -> bool:
	return _failed.has(c)


func reset_failures() -> void:
	_failed.clear()
	_failing = false


func forget_cache_checks() -> void:
	_cache_checked.clear()


## Numbers for the on-screen loading details.
func stats() -> Dictionary:
	var downloading := _slots.count(true)
	return {
		"loaded": graph.cells.size() if graph else 0,
		"from_cache": _from_cache, "downloaded": _downloaded,
		"downloading": downloading, "unpacking": _busy - downloading,
		"queued": _queued, "failed": _failed_downloads,
	}


## What a cell is waiting for, in plain words.
func cell_state(c: Vector2i) -> String:
	if graph and graph.cells.has(c):
		return "loaded"
	if _in_flight.has(c):
		return "downloading"
	if _failed.has(c):
		var left: int = RETRY_MS - (Time.get_ticks_msec() - _failed[c])
		if left > 0:
			return "download failed, retry in %d s" % ceili(left / 1000.0)
		return "queued for retry"
	if _cache_checked.has(c):
		return "queued for download"
	return "not requested yet"
