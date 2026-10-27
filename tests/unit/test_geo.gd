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
