## Trips: each time he picks a new destination he may travel to another city
## in the same country (20%) or in another country (5%) instead.
## Cities come from a bundled list and are picked weighted by population.
## He gets there by bus from a bus station, by plane from an airport, or in
## his own car after filling up at a gas station, and pays real prices in euros.
## Pure logic plus the city and airport lists, so it is easy to test.
extends RefCounted

const Geo := preload("res://scripts/geo.gd")
const Speeds := preload("res://scripts/speeds.gd")

const CITIES_PATH := "res://data/cities.tsv"
const AIRPORTS_PATH := "res://data/airports.tsv"
const COUNTRY_CHANCE := 0.05
const CITY_CHANCE := 0.20
## Fares in euros, from real tickets (see the Help page on travel):
## buses 8 cents a km, flights 50 plus 3 cents a km, car fuel 12 cents a km.
const BUS_EUR_PER_KM := 0.08
const PLANE_BASE_EUR := 50.0
const PLANE_EUR_PER_KM := 0.03
const FUEL_EUR_PER_KM := 0.12
## Roads are about this much longer than the straight line.
const ROAD_FACTOR := 1.3
## Planes are never taken below the first distance and always above the second.
const PLANE_FROM_M := 200000.0
const PLANE_ALWAYS_M := 1000000.0
## Farther than this he only flies: buses and cars don't cross oceans.
const MAX_ROAD_M := 3000000.0
## Farthest he walks to an airport, and farthest an airport may be from where he lands.
const AIRPORT_REACH_M := 50000.0
## Cities closer than this to him count as the city he is already in.
const SAME_CITY_M := 20000.0
## Destinations in a new city are picked within this radius, scaled by population.
const MIN_CITY_RADIUS_M := 1500.0
const MAX_CITY_RADIUS_M := 25000.0

enum Kind { STAY, CITY, COUNTRY }
enum Mode { BUS, PLANE, CAR }
const MODE_NAMES := ["bus", "plane", "car"]

static var _shared: RefCounted

var cities: Array = []  # {name, code, country, lat, lon, pop}
var airports: Array = []  # places: {name, class "aerodrome", subclass "airport", iata, code, lat, lon, rank}


## The bundled city list, read once.
static func shared() -> RefCounted:
	if _shared == null:
		_shared = new()
		_shared.cities = parse(FileAccess.get_file_as_string(CITIES_PATH))
		_shared.airports = parse_airports(FileAccess.get_file_as_string(AIRPORTS_PATH))
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


## Tab-separated lines: name, IATA code, country code, lat, lon. Each
## airport comes out as a place he can walk to.
static func parse_airports(text: String) -> Array:
	var out := []
	for line in text.split("\n", false):
		if line.begins_with("#"):
			continue
		var f := line.split("\t")
		if f.size() < 5:
			continue
		out.append({"name": f[0], "class": "aerodrome", "subclass": "airport", "iata": f[1], "code": f[2],
			"lat": f[3].to_float(), "lon": f[4].to_float(), "rank": 1})
	return out


static func ride_s(mode: Mode, distance_m: float) -> float:
	var mps: float = [Speeds.BUS, Speeds.PLANE, Speeds.CAR_ROAD][mode]
	return distance_m / mps


## Euros for a ride of `distance_m`, rounded up.
static func fare(mode: Mode, distance_m: float) -> int:
	var km := distance_m / 1000.0
	match mode:
		Mode.PLANE:
			return ceili(PLANE_BASE_EUR + PLANE_EUR_PER_KM * km)
		Mode.CAR:
			return maxi(ceili(FUEL_EUR_PER_KM * km), 1)
	return maxi(ceili(BUS_EUR_PER_KM * km), 1)


## How likely he flies rather than goes by road: 0 below 200 km, 1 above 1000 km.
static func plane_chance(distance_m: float) -> float:
	return clampf((distance_m - PLANE_FROM_M) / (PLANE_ALWAYS_M - PLANE_FROM_M), 0.0, 1.0)


static func is_bus_station(p: Dictionary) -> bool:
	return p.get("class", "") == "bus" and p.get("subclass", "") == "bus_station"


static func is_gas_station(p: Dictionary) -> bool:
	return p.get("class", "") == "fuel"


static func is_airport(p: Dictionary) -> bool:
	return p.get("class", "") == "aerodrome"


## The airport nearest to (lat, lon) within reach, or {}.
func nearest_airport(lat: float, lon: float, reach_m := AIRPORT_REACH_M) -> Dictionary:
	var best := {}
	var best_d := reach_m
	for a in airports:
		var d := Geo.distance_m(lat, lon, a["lat"], a["lon"])
		if d <= best_d:
			best_d = d
			best = a
	return best


static func _nearest(places: Array, here: Array, test: Callable) -> Dictionary:
	var best := {}
	var best_d := INF
	for p in places:
		if not test.call(p):
			continue
		var d := Geo.distance_m(here[0], here[1], p["lat"], p["lon"])
		if d < best_d:
			best_d = d
			best = p
	return best


## How he gets from `here` to `city`: {city, mode, station, fare, arrive,
## distance_m}, or {error, short_of?} when he can't. `places` are the places
## loaded around him, `r` in [0, 1) decides plane or road.
func plan_trip(city: Dictionary, here: Array, places: Array, euros: int, has_car: bool, r: float) -> Dictionary:
	var straight := Geo.distance_m(here[0], here[1], city["lat"], city["lon"])
	var road := Mode.CAR if has_car else Mode.BUS
	var order := [Mode.PLANE, road] if r < plane_chance(straight) else [road, Mode.PLANE]
	for mode in order:
		var station := {}
		var arrive := [float(city["lat"]), float(city["lon"])]
		var dist := straight * ROAD_FACTOR
		if mode == Mode.PLANE:
			station = nearest_airport(here[0], here[1])
			var there := nearest_airport(city["lat"], city["lon"])
			if station.is_empty() or there.is_empty() or there["name"] == station["name"]:
				continue
			arrive = [there["lat"], there["lon"]]
			dist = Geo.distance_m(station["lat"], station["lon"], there["lat"], there["lon"])
		else:
			if straight > MAX_ROAD_M:
				continue
			station = _nearest(places, here, is_gas_station if mode == Mode.CAR else is_bus_station)
			if station.is_empty():
				continue
		var cost := fare(mode, dist)
		if cost > euros:
			return {"error": "can't afford the %s to %s: needs €%d, has €%d" % [MODE_NAMES[mode], city["name"], cost, euros],
				"short_of": cost}
		return {"city": city, "mode": mode, "station": station, "fare": cost, "arrive": arrive, "distance_m": dist}
	if straight > MAX_ROAD_M:
		return {"error": "too far to go by road, and no airport within reach"}
	return {"error": "no %s or airport within reach" % ("gas station" if has_car else "bus station")}


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
