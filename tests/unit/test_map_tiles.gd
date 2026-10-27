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
