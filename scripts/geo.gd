## Geo math helpers: distances and Web Mercator (OSM tile) projection.
## Works in 64-bit floats; convert to Vector2 only after subtracting an origin.
extends RefCounted

const EARTH_RADIUS_M := 6371008.8
const TILE_SIZE := 256


## Great-circle distance in meters between two lat/lon points.
static func distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
	var p1 := deg_to_rad(lat1)
	var p2 := deg_to_rad(lat2)
	var dp := p2 - p1
	var dl := deg_to_rad(lon2 - lon1)
	var a := sin(dp / 2.0) ** 2 + cos(p1) * cos(p2) * sin(dl / 2.0) ** 2
	return 2.0 * EARTH_RADIUS_M * asin(sqrt(clampf(a, 0.0, 1.0)))


## World pixel x for a longitude at a zoom level.
static func lon_to_px(lon: float, zoom: int) -> float:
	return (lon + 180.0) / 360.0 * TILE_SIZE * pow(2.0, zoom)


## World pixel y for a latitude at a zoom level.
static func lat_to_px(lat: float, zoom: int) -> float:
	var r := deg_to_rad(clampf(lat, -85.0511, 85.0511))
	return (1.0 - log(tan(r) + 1.0 / cos(r)) / PI) / 2.0 * TILE_SIZE * pow(2.0, zoom)


static func px_to_lon(x: float, zoom: int) -> float:
	return x / (TILE_SIZE * pow(2.0, zoom)) * 360.0 - 180.0


static func px_to_lat(y: float, zoom: int) -> float:
	var n := PI - 2.0 * PI * y / (TILE_SIZE * pow(2.0, zoom))
	return rad_to_deg(atan(sinh(n)))


## [south, west, north, east] box that contains a circle of radius_m around a point.
static func bbox_around(lat: float, lon: float, radius_m: float) -> Array:
	var dlat := rad_to_deg(radius_m / EARTH_RADIUS_M)
	var dlon := dlat / maxf(cos(deg_to_rad(lat)), 0.01)
	return [lat - dlat, lon - dlon, lat + dlat, lon + dlon]
