## What he can do at each kind of place, from data/actions.json, keyed by
## "class/subclass" or "class" of the tiles' POI layer, with "_generic" for
## places we have no actions for yet and "_spot" for random spots.
## data/flavour.json adds each country's own actions (by its code in
## data/cities.tsv) under the same keys; they join the usual ones there.
## Picks an action he can do, leaning towards what he needs.
extends RefCounted

const Stats := preload("res://scripts/stats.gd")

const ACTIONS_PATH := "res://data/actions.json"
const FLAVOUR_PATH := "res://data/flavour.json"
## Every action takes this many minutes, whatever its listed time, so he is
## never still for long.
const MAX_MINUTES := 1.0
## Below this many coins he looks for work and avoids spending.
const SKINT := 20
## Extra weight for a country's own actions, so they come up often.
const FLAVOUR_WEIGHT := 2.0

static var _shared: RefCounted

var data := {}  # key -> [action]
var flavour := {}  # country code -> {key -> [action]}
var unknown := {}  # "class/subclass" -> {count, example}: places with no actions yet


static func shared() -> RefCounted:
	if _shared == null:
		_shared = new(JSON.parse_string(FileAccess.get_file_as_string(ACTIONS_PATH)),
			JSON.parse_string(FileAccess.get_file_as_string(FLAVOUR_PATH)))
	return _shared


func _init(d: Dictionary = {}, f: Dictionary = {}) -> void:
	data = d
	for code in f:
		flavour[code] = {}
		for key in f[code]:
			flavour[code][key] = f[code][key].map(func(a): return a.merged({"flavour": true}))


## Actions for `place` ({} for a random spot) in `country`: its subclass's,
## else its class's, else the generic ones (and the place is tallied as
## unknown), plus the country's own for its subclass or class.
func for_place(place: Dictionary, country := "") -> Array:
	return _usual(place) + _local(place, flavour.get(country, {}))


static func _keys(place: Dictionary) -> Array:
	if place.is_empty():
		return ["_spot"]
	var cls: String = place.get("class", "")
	return ["%s/%s" % [cls, place.get("subclass", "")], cls]


static func _local(place: Dictionary, table: Dictionary) -> Array:
	for key in _keys(place):
		if table.has(key):
			return table[key]
	return []


func _usual(place: Dictionary) -> Array:
	for key in _keys(place):
		if data.has(key):
			return data[key]
	if place.is_empty():
		return []
	var key: String = _keys(place)[0]
	var u: Dictionary = unknown.get(key, {"count": 0, "example": place.get("name", "")})
	u["count"] += 1
	unknown[key] = u
	return data.get("_generic", [])


## How much he wants to do `action` now: more when it fills a low meter,
## pays while he is skint, less when it would leave him broke.
static func weight(action: Dictionary, stats: Stats) -> float:
	var w := 1.0 + (FLAVOUR_WEIGHT if action.get("flavour", false) else 0.0)
	var fx: Dictionary = action.get("fx", {})
	for m in fx:
		if stats.meters.has(m) and float(fx[m]) > 0.0:
			w += maxf(60.0 - stats.meters[m], 0.0) / 20.0 * minf(float(fx[m]), 50.0) / 20.0
	if action.has("item"):
		w += 1.0 if stats.coins > 3 * SKINT else 0.0
	if action.get("sell", false):
		w += 2.0
	if action.has("earn"):
		w += 3.0 if stats.coins < SKINT else 0.5
	if stats.coins - int(action.get("cost", 0)) < SKINT and action.has("cost"):
		w *= 0.5
	return w


## One of `actions` he can do at `hour`, picked by weight with `r` in [0, 1),
## or {} when he can do none of them.
static func choose(actions: Array, stats: Stats, hour: int, r: float) -> Dictionary:
	var options := actions.filter(func(a): return stats.can_do(a, hour))
	var total := 0.0
	for a in options:
		total += weight(a, stats)
	r *= total
	for a in options:
		r -= weight(a, stats)
		if r < 0.0:
			return a
	return options[-1] if not options.is_empty() else {}


static func rest_minutes(_action: Dictionary) -> float:
	return MAX_MINUTES
