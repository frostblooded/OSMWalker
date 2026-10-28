## His history: the last SIZE things that happened, each with when and where,
## and the trail he walked since the oldest of them. Trips break the trail.
## Pure logic: no nodes, so it is easy to test.
extends RefCounted

const Geo := preload("res://scripts/geo.gd")

const SIZE := 100
## Trail points closer together than this are skipped.
const TRAIL_STEP_M := 15.0
## About 75 km of walking at TRAIL_STEP_M.
const MAX_TRAIL := 5000
## Entries this close together share one marker.
const SAME_SPOT_M := 10.0

var entries := []  # {text, t (unix s), at: [lat, lon] or [], ti: trail index}, oldest first
var here := []  # where he is now, [lat, lon]
var _trail := []  # [lat, lon] points; [] marks a break
var _dropped := 0  # trail points cut off the front so far


## Notes where he is and extends the trail.
func move_to(lat: float, lon: float) -> void:
	here = [lat, lon]
	var last: Array = _trail[-1] if not _trail.is_empty() else []
	if last.is_empty() or Geo.distance_m(last[0], last[1], lat, lon) >= TRAIL_STEP_M:
		_trail.append([lat, lon])
	if _trail.size() > MAX_TRAIL:
		_cut(_trail.size() - MAX_TRAIL)


## The trail stops here and starts again wherever he next is.
func break_trail() -> void:
	if not _trail.is_empty() and not _trail[-1].is_empty():
		_trail.append([])


func add(text: String, t: int) -> void:
	entries.append({"text": text, "t": t, "at": here.duplicate(), "ti": _dropped + maxi(_trail.size() - 1, 0)})
	if entries.size() > SIZE:
		entries = entries.slice(entries.size() - SIZE)
		_cut(int(entries[0]["ti"]) - _dropped)


func _cut(n: int) -> void:
	if n <= 0:
		return
	_trail = _trail.slice(n)
	_dropped += n


func latest() -> String:
	return entries[-1]["text"] if not entries.is_empty() else ""


func texts() -> Array:
	return entries.map(func(e): return e["text"])


## The number shown for entries[i]: 1 is the newest.
func number(i: int) -> int:
	return entries.size() - i


func trail_points() -> int:
	return _trail.filter(func(p): return not p.is_empty()).size()


## The trail as runs of [lat, lon] points, split where he travelled.
func segments() -> Array:
	var out := []
	var run := []
	for p in _trail:
		if p.is_empty():
			if run.size() > 0:
				out.append(run)
			run = []
		else:
			run.append(p)
	if run.size() > 0:
		out.append(run)
	return out


## One marker per spot, oldest first: {at, label ("3" or "2-3"), first (lowest number)}.
## Entries in a row at the same spot share a marker.
func markers() -> Array:
	var out := []
	var i := 0
	while i < entries.size():
		var at: Array = entries[i]["at"]
		var j := i
		while j + 1 < entries.size() and _same_spot(at, entries[j + 1]["at"]):
			j += 1
		if not at.is_empty():
			var lo := number(j)
			var hi := number(i)
			out.append({"at": at, "label": str(lo) if lo == hi else "%d-%d" % [lo, hi], "first": lo})
		i = j + 1
	return out


static func _same_spot(a: Array, b: Array) -> bool:
	if a.is_empty() or b.is_empty():
		return a.is_empty() and b.is_empty()
	return Geo.distance_m(a[0], a[1], b[0], b[1]) < SAME_SPOT_M


## [south, west, north, east] around the trail and every entry, [] when there is nothing.
func bounds() -> Array:
	var pts := _trail.filter(func(p): return not p.is_empty())
	for e in entries:
		if not e["at"].is_empty():
			pts.append(e["at"])
	if pts.is_empty():
		return []
	var b := [INF, INF, -INF, -INF]
	for p in pts:
		b = [minf(b[0], p[0]), minf(b[1], p[1]), maxf(b[2], p[0]), maxf(b[3], p[1])]
	return b


## "HH:MM" of unix time `t` with the local time zone `bias_min` minutes from UTC.
static func time_text(t: int, bias_min: int) -> String:
	var s := posmod(t + bias_min * 60, 86400)
	return "%02d:%02d" % [s / 3600, (s / 60) % 60]


func to_dict() -> Dictionary:
	return {"entries": entries, "trail": _trail, "dropped": _dropped}


func load_dict(d: Dictionary) -> void:
	entries = []
	for e in d.get("entries", []):
		entries.append({"text": str(e["text"]), "t": int(e.get("t", 0)), "at": _point(e.get("at", [])), "ti": int(e.get("ti", 0))})
	_trail = Array(d.get("trail", [])).map(_point)
	_dropped = int(d.get("dropped", 0))


## Feed lines from saves made before the history kept spots.
func load_feed(lines: Array) -> void:
	entries = []
	for l in lines:
		entries.append({"text": str(l), "t": 0, "at": [], "ti": 0})


static func _point(p: Array) -> Array:
	return [float(p[0]), float(p[1])] if p.size() == 2 else []
