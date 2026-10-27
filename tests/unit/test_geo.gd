extends GutTest

const Geo := preload("res://scripts/geo.gd")


func test_distance_of_a_thousandth_degree_of_latitude() -> void:
	assert_almost_eq(Geo.distance_m(42.0, 23.0, 42.001, 23.0), 111.2, 0.5)


func test_distance_is_zero_for_same_point() -> void:
	assert_almost_eq(Geo.distance_m(51.5, -0.12, 51.5, -0.12), 0.0, 0.0001)


func test_tile_pixels_at_zoom_zero() -> void:
	assert_almost_eq(Geo.lon_to_px(-180.0, 0), 0.0, 0.0001)
	assert_almost_eq(Geo.lon_to_px(0.0, 0), 128.0, 0.0001)
	assert_almost_eq(Geo.lat_to_px(0.0, 0), 128.0, 0.0001)


func test_pixel_round_trip() -> void:
	var x := Geo.lon_to_px(23.3219, 17)
	var y := Geo.lat_to_px(42.6977, 17)
	assert_almost_eq(Geo.px_to_lon(x, 17), 23.3219, 1e-9)
	assert_almost_eq(Geo.px_to_lat(y, 17), 42.6977, 1e-9)


func test_bbox_contains_radius() -> void:
	var b := Geo.bbox_around(42.0, 23.0, 500.0)
	assert_almost_eq(Geo.distance_m(42.0, 23.0, b[2], 23.0), 500.0, 1.0)
	assert_almost_eq(Geo.distance_m(42.0, 23.0, 42.0, b[3]), 500.0, 1.0)


func test_tile_of_a_point() -> void:
	assert_eq(Geo.tile_of(0.0, 0.0, 1), Vector2i(1, 1))
	assert_eq(Geo.tile_of(42.6977, 23.3219, 17), Vector2i(floori(Geo.lon_to_px(23.3219, 17) / 256.0), floori(Geo.lat_to_px(42.6977, 17) / 256.0)))


func test_tile_bbox_contains_its_points() -> void:
	var t := Geo.tile_of(42.0, 23.0, 15)
	var b := Geo.tile_bbox(t, 15)
	assert_lt(b[0], 42.0)
	assert_lt(b[1], 23.0)
	assert_gt(b[2], 42.0)
	assert_gt(b[3], 23.0)
	# Its corners map back to the same tile from the inside.
	assert_eq(Geo.tile_of(b[2] - 1e-7, b[1] + 1e-7, 15), t)
	assert_eq(Geo.tile_of(b[0] + 1e-7, b[3] - 1e-7, 15), t)
