## Street downloads: cache first, nearest cells first, several at once.
extends GutTest

const StreetLoader := preload("res://scripts/street_loader.gd")
const StreetGraph := preload("res://scripts/street_graph.gd")
const DiskCache := preload("res://scripts/disk_cache.gd")
const FakeOsmApi := preload("res://tests/support/fake_osm_api.gd")
const DIR := "user://test_loader_cache/"

var api: FakeOsmApi
var loader: StreetLoader
var home := StreetGraph.cell_of(42.0, 23.0)


func before_each() -> void:
	DiskCache.new(DIR).clear()
	api = FakeOsmApi.new()
	add_child_autofree(api)
	loader = _new_loader(StreetGraph.new())


func after_all() -> void:
	DiskCache.new(DIR).clear()


func _new_loader(graph: StreetGraph) -> StreetLoader:
	var l := StreetLoader.new()
	l.api = api
	l.graph = graph
	l.cache = DiskCache.new(DIR)
	add_child_autofree(l)
	return l


func test_downloads_his_own_cell_first() -> void:
	loader.request(StreetGraph.cells_by_priority(42.0, 23.0, 2))
	# The first request is just his cell, so he can start quickly.
	assert_eq(api.street_requests[0], StreetGraph.cells_bbox([home]))
	assert_lte(api.street_requests.size(), StreetLoader.MAX_PARALLEL)
	await wait_until(func(): return loader.graph.cells.has(home), 1.0)
	assert_true(loader.graph.is_complete(1))


func test_runs_several_downloads_at_once() -> void:
	api.delay_frames = 5
	loader.graph.cells[home] = true  # pretend his cell is in, so the ring goes out in parallel
	loader.request(StreetGraph.cells_by_priority(42.0, 23.0, 2))
	# One slot stays free for his own cell.
	assert_eq(api.street_requests.size(), StreetLoader.MAX_PARALLEL - 1)
	assert_eq(loader.in_flight_count(), StreetLoader.MAX_PARALLEL - 1)


func test_groups_neighbouring_cells_into_one_download() -> void:
	api.delay_frames = 5
	loader.graph.cells[home] = true
	loader.request(StreetGraph.cells_by_priority(42.0, 23.0, 2))
	# More cells than requests means at least one asked for more than one cell.
	assert_gt(loader.in_flight_cells(), loader.in_flight_count())


func test_spreads_downloads_over_servers() -> void:
	api.delay_frames = 5
	loader.graph.cells[home] = true
	loader.request(StreetGraph.cells_by_priority(42.0, 23.0, 2))
	assert_eq(api.first_servers, [0, 1])


func test_saves_cells_and_reads_them_back_without_network() -> void:
	loader.request([home])
	await wait_until(func(): return loader.graph.cells.has(home), 1.0)
	var again := _new_loader(StreetGraph.new())
	var before := api.street_requests.size()
	again.request([home])
	assert_true(again.graph.cells.has(home))
	assert_true(again.graph.is_complete(1))
	assert_eq(api.street_requests.size(), before)


func test_failed_cell_backs_off() -> void:
	api.online = false
	loader.request([home])
	await wait_until(func(): return loader.is_failing(), 1.0)
	assert_true(loader.has_failed(home))
	var asked := api.street_requests.size()
	loader.request([home])
	assert_eq(api.street_requests.size(), asked)


func test_reset_failures_allows_an_immediate_retry() -> void:
	api.online = false
	loader.request([home])
	await wait_until(func(): return loader.is_failing(), 1.0)
	loader.reset_failures()
	api.online = true
	loader.request([home])
	await wait_until(func(): return loader.graph.cells.has(home), 1.0)
	assert_false(loader.is_failing())


func test_counts_cells_from_cache_and_downloads() -> void:
	loader.request([home])
	await wait_until(func(): return loader.graph.cells.has(home), 1.0)
	assert_eq(loader.stats()["downloaded"], 1)
	assert_eq(loader.stats()["from_cache"], 0)
	var again := _new_loader(StreetGraph.new())
	again.request([home])
	assert_eq(again.stats()["from_cache"], 1)


func test_explains_what_a_cell_is_waiting_for() -> void:
	api.delay_frames = 30
	assert_eq(loader.cell_state(home), "not requested yet")
	loader.request([home])
	assert_eq(loader.cell_state(home), "downloading")
	await wait_until(func(): return loader.graph.cells.has(home), 2.0)
	assert_eq(loader.cell_state(home), "loaded")


func test_failed_cell_says_when_it_retries() -> void:
	api.online = false
	loader.request([home])
	await wait_until(func(): return loader.is_failing(), 1.0)
	assert_string_contains(loader.cell_state(home), "retry in")
	assert_eq(loader.stats()["failed"], 1)


func test_his_own_cell_always_gets_a_slot() -> void:
	api.delay_frames = 1000
	var ring := StreetGraph.cells_by_priority(42.0, 23.0, 2)
	loader.graph.cells[Vector2i(0, 0)] = true  # not the very first download
	loader.request(ring.slice(1))  # everything but his cell
	assert_eq(loader.in_flight_count(), StreetLoader.MAX_PARALLEL - 1)
	loader.request(ring)
	assert_eq(loader.in_flight_count(), StreetLoader.MAX_PARALLEL)
	assert_eq(api.street_requests[-1], StreetGraph.cells_bbox([home]), "alone, as a small query")


func test_no_bundling_while_downloads_fail() -> void:
	api.online = false
	loader.request([home + Vector2i(9, 9)])
	await wait_until(func(): return loader.is_failing(), 1.0)
	api.online = true
	api.delay_frames = 1000
	loader.graph.cells[home] = true
	loader.request(StreetGraph.cells_by_priority(42.0, 23.0, 2))
	assert_eq(loader.in_flight_cells(), loader.in_flight_count())
