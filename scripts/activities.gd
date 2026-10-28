## What he can do at each kind of place, from data/actions.json, keyed by
## "class/subclass" or "class" of the tiles' POI layer, with "_generic" for
## places we have no actions for yet and "_spot" for random spots.
## Picks an action he can do, leaning towards what he needs.
extends RefCounted

const Stats := preload("res://scripts/stats.gd")

const ACTIONS_PATH := "res://data/actions.json"
## Actions take their listed time, but never more than this many minutes.
const MAX_MINUTES := 15.0
## Below this many coins he looks for work and avoids spending.
const SKINT := 20

static var _shared: RefCounted

var data := {}  # key -> [action]
var unknown := {}  # "class/subclass" -> {count, example}: places with no actions yet


static func shared() -> RefCounted:
	if _shared == null:
		_shared = new(JSON.parse_string(FileAccess.get_file_as_string(ACTIONS_PATH)))
	return _shared


func _init(d: Dictionary = {}) -> void:
	data = d


## Actions for `place` ({} for a random spot): its subclass's, else its
## class's, else the generic ones (and the place is tallied as unknown).
func for_place(place: Dictionary) -> Array:
	if place.is_empty():
		return data.get("_spot", [])
	var cls: String = place.get("class", "")
	var key := "%s/%s" % [cls, place.get("subclass", "")]
	if data.has(key):
		return data[key]
	if data.has(cls):
		return data[cls]
	var u: Dictionary = unknown.get(key, {"count": 0, "example": place.get("name", "")})
	u["count"] += 1
	unknown[key] = u
	return data.get("_generic", [])


## How much he wants to do `action` now: more when it fills a low meter,
## pays while he is skint, less when it would leave him broke.
static func weight(action: Dictionary, stats: Stats) -> float:
	var w := 1.0
	var fx: Dictionary = action.get("fx", {})
	for m in fx:
		if stats.meters.has(m) and float(fx[m]) > 0.0:
			w += maxf(60.0 - stats.meters[m], 0.0) / 20.0 * minf(float(fx[m]), 50.0) / 20.0
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


static func rest_minutes(action: Dictionary) -> float:
	return minf(float(action.get("min", 1)), MAX_MINUTES)
