## Trips: each time he picks a new destination he may travel to another city
## in the same country (20%) or in another country (5%) instead.
## Cities come from a bundled list and are picked weighted by population.
## Pure logic plus the city list, so it is easy to test.
extends RefCounted

const Geo := preload("res://scripts/geo.gd")

const CITIES_PATH := "res://data/cities.tsv"
const COUNTRY_CHANCE := 0.05
const CITY_CHANCE := 0.20
## Travel takes about an hour per 500 km, between 1 and 12 hours.
const TRAVEL_MPS := 500000.0 / 3600.0
const MIN_TRAVEL_S := 3600.0
const MAX_TRAVEL_S := 12.0 * 3600.0
## Cities closer than this to him count as the city he is already in.
const SAME_CITY_M := 20000.0
## Destinations in a new city are picked within this radius, scaled by population.
const MIN_CITY_RADIUS_M := 1500.0
const MAX_CITY_RADIUS_M := 25000.0

enum Kind { STAY, CITY, COUNTRY }

static var _shared: RefCounted

var cities: Array = []  # {name, code, country, lat, lon, pop}


## The bundled city list, read once.
static func shared() -> RefCounted:
	if _shared == null:
		_shared = new()
		_shared.cities = parse(FileAccess.get_file_as_string(CITIES_PATH))
	return _shared


## Tab-separated lines: name, country code, country, lat, lon, population.
static func parse(text: String) -> Array:
	var out := []
	for line in text.split("\n", false):
		if line.begins_with("#"):
			continue
		var f := line.split("\t")
		if f.size() < 6:
			continue
		out.append({"name": f[0], "code": f[1], "country": f[2],
			"lat": f[3].to_float(), "lon": f[4].to_float(), "pop": f[5].to_int()})
	return out


## What a roll means: r is uniform in [0, 1).
static func roll(r: float) -> Kind:
	if r < COUNTRY_CHANCE:
		return Kind.COUNTRY
	if r < COUNTRY_CHANCE + CITY_CHANCE:
		return Kind.CITY
	return Kind.STAY


static func travel_s(distance_m: float) -> float:
	return clampf(distance_m / TRAVEL_MPS, MIN_TRAVEL_S, MAX_TRAVEL_S)


## How far from the center destinations are picked: bigger cities spread wider.
static func city_radius_m(pop: int) -> float:
	return clampf(8.0 * sqrt(float(pop)), MIN_CITY_RADIUS_M, MAX_CITY_RADIUS_M)


## [south, west, north, east] where he picks destinations in `city`.
static func city_bounds(city: Dictionary) -> Array:
	return Geo.bbox_around(city["lat"], city["lon"], city_radius_m(city["pop"]))


## Country code of the listed city nearest to the point.
func country_at(lat: float, lon: float) -> String:
	var best := ""
	var best_d := INF
	for c in cities:
		var d := Geo.distance_m(lat, lon, c["lat"], c["lon"])
		if d < best_d:
			best_d = d
			best = c["code"]
	return best


## A city for a trip of `kind` from (lat, lon) in `country`, weighted by
## population, or {} when there is nowhere to go.
func pick(kind: Kind, country: String, lat: float, lon: float, rng: RandomNumberGenerator) -> Dictionary:
	var opts := options(kind, country, lat, lon)
	if opts.is_empty():
		return {}
	var total: float = opts.reduce(func(acc, c): return acc + c["pop"], 0.0)
	var r := rng.randf() * total
	for c in opts:
		r -= c["pop"]
		if r < 0.0:
			return c
	return opts[-1]


## Cities a trip of `kind` from (lat, lon) in `country` can go to.
func options(kind: Kind, country: String, lat: float, lon: float) -> Array:
	if kind == Kind.STAY:
		return []
	return cities.filter(func(c): return (c["code"] == country) == (kind == Kind.CITY) \
		and Geo.distance_m(lat, lon, c["lat"], c["lon"]) >= SAME_CITY_M)
