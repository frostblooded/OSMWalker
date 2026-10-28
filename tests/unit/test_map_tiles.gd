## Which tiles the map asks for, and in what order.
extends GutTest

const MapView := preload("res://scripts/map_view.gd")


func test_tile_range_covers_view_plus_ring() -> void:
	# A 512x512 view starting exactly on tile (10, 20) at origin px (0,0).
	var r := MapView.tile_range(Rect2(2560, 5120, 512, 512), 0.0, 0.0, 0)
	assert_eq(r, Rect2i(10, 20, 3, 3))  # 512 px end lands on the next tile's first pixel
	var ringed := MapView.tile_range(Rect2(2560, 5120, 512, 512), 0.0, 0.0, 2)
	assert_eq(ringed, Rect2i(8, 18, 7, 7))


func test_tile_range_is_clamped_to_the_world_vertically() -> void:
	var r := MapView.tile_range(Rect2(0, -1000, 256, 256), 0.0, 0.0, 2, 4)
	assert_eq(r.position.y, 0)


func test_next_job_is_the_lowest_priority_number() -> void:
	var jobs := {"a": {"prio": 3.0}, "b": {"prio": 0.5}, "c": {"prio": 9.0}}
	assert_eq(MapView.next_job(jobs), "b")
	assert_eq(MapView.next_job({}), "")


func test_underlay_comes_before_detailed_tiles() -> void:
	var under := MapView.priority(Vector2(3, 0), Vector2.ZERO, MapView.Kind.UNDERLAY)
	var shown := MapView.priority(Vector2(0, 0), Vector2.ZERO, MapView.Kind.SHOW)
	assert_lt(under, shown)


func test_tiles_ahead_win_over_tiles_behind() -> void:
	var ahead := MapView.priority(Vector2(2, 0), Vector2.ZERO, MapView.Kind.SHOW, Vector2(1, 0))
	var behind := MapView.priority(Vector2(-2, 0), Vector2.ZERO, MapView.Kind.SHOW, Vector2(1, 0))
	assert_lt(ahead, behind)


func test_zooms_out_to_fit_both_ends_of_a_trip() -> void:
	var size := Vector2(720, 1280)
	assert_eq(MapView.zoom_to_fit([42.0, 23.0], [42.01, 23.01], size), 12)
	var sofia_varna := MapView.zoom_to_fit([42.7, 23.3], [43.2, 27.9], size)
	assert_between(sofia_varna, 6, 8)
	assert_eq(MapView.zoom_to_fit([42.7, 23.3], [-33.9, 151.2], size), 3)


func test_zoom_to_fit_box_goes_close_for_a_small_trail() -> void:
	var size := Vector2(720, 640)
	assert_eq(MapView.zoom_to_fit_box([42.0, 23.0, 42.0, 23.0], size, 17), 17, "a single spot keeps the close zoom")
	var z := MapView.zoom_to_fit_box([42.0, 23.0, 42.02, 23.02], size, 17)
	assert_between(z, 12, 15)
	assert_lt(MapView.zoom_to_fit_box([40.0, 20.0, 48.0, 28.0], size, 17), z)
