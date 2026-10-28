## Checks that a city lets him go on: a way out (a bus station, an airport or
## a gas station for a car) and a place where he can earn coins. Missing
## either is severe: he could be stuck there. Pure logic, so it is easy to test.
extends RefCounted


static func is_bus_station(p: Dictionary) -> bool:
	return p.get("class", "") == "bus" and p.get("subclass", "") == "bus_station"


## Places from the aerodrome layer, except military airfields.
static func is_airport(p: Dictionary) -> bool:
	return p.get("class", "") == "aerodrome" and p.get("subclass", "") != "military"


static func is_gas_station(p: Dictionary) -> bool:
	return p.get("class", "") == "fuel" and p.get("subclass", "fuel") == "fuel"


static func is_car_dealer(p: Dictionary) -> bool:
	return p.get("subclass", "") == "car" and p.get("class", "") in ["car", "shop"]


## True when one of the actions at `p` pays him.
static func can_earn_at(p: Dictionary, activities: RefCounted, country := "") -> bool:
	return activities.for_place(p, country).any(func(a): return a.has("earn"))


## How many of each kind of place matter for getting on: bus, airport, gas,
## dealer, earn.
static func summary(places: Array, activities: RefCounted, country := "") -> Dictionary:
	var s := {"bus": 0, "airport": 0, "gas": 0, "dealer": 0, "earn": 0}
	for p in places:
		s["bus"] += int(is_bus_station(p))
		s["airport"] += int(is_airport(p))
		s["gas"] += int(is_gas_station(p))
		s["dealer"] += int(is_car_dealer(p))
		if activities and can_earn_at(p, activities, country):
			s["earn"] += 1
	return s


## Severe problems from a summary, each {title, details}.
static func problems(s: Dictionary, city: String) -> Array:
	var out := []
	if s["bus"] == 0 and s["airport"] == 0 and s["gas"] == 0:
		out.append({"title": "Can't leave %s" % city, "details": [
			"No bus station, airport or gas station is loaded in the city box, so he has no way to travel on."]})
	if s["gas"] == 0:
		out.append({"title": "No gas station in %s" % city, "details": [
			"A car can't refuel here."]})
	if s["earn"] == 0:
		out.append({"title": "No way to earn coins in %s" % city, "details": [
			"No loaded place in the city box has an action that pays him, so he can't afford to leave once his coins run out."]})
	return out
