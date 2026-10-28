## The in-game Help: data/help.txt split into sections and pages, with
## {NAME} placeholders filled from the game's own numbers so the text never
## goes stale. "# Title" starts a section, "## Title {id}" a page, and the
## lines after it are the page's text.
## Pure logic: no nodes, so it is easy to test.
extends RefCounted

const Stats := preload("res://scripts/stats.gd")
const Items := preload("res://scripts/items.gd")
const Trips := preload("res://scripts/trips.gd")
const Walker := preload("res://scripts/walker.gd")
const Activities := preload("res://scripts/activities.gd")
const History := preload("res://scripts/history.gd")
const CityFacts := preload("res://scripts/city_facts.gd")
const DebugLog := preload("res://scripts/debug_log.gd")

const PATH := "res://data/help.txt"

static var _shared: Array


## The help with every number filled in, read once.
static func shared() -> Array:
	if _shared.is_empty():
		_shared = parse(fill(FileAccess.get_file_as_string(PATH), values()))
	return _shared


## [{title, pages: [{id, title, body}]}] from the help text.
static func parse(text: String) -> Array:
	var sections := []
	var page := {}
	for line in text.split("\n"):
		if line.begins_with("## "):
			var head := line.substr(3).strip_edges()
			var open := head.rfind("{")
			page = {"id": head.substr(open + 1).trim_suffix("}"), "title": head.left(open).strip_edges(), "body": ""}
			sections[-1]["pages"].append(page)
		elif line.begins_with("# "):
			sections.append({"title": line.substr(2).strip_edges(), "pages": []})
			page = {}
		elif not page.is_empty():
			page["body"] += line + "\n"
	for s in sections:
		for p in s["pages"]:
			p["body"] = p["body"].strip_edges()
	return sections


## A page's text as cards: one per paragraph, {text, items}, where items
## are its "- " lines, shown as rows.
static func blocks(body: String) -> Array:
	var out := []
	for chunk in body.split("\n\n", false):
		var text := []
		var items := []
		for line in chunk.strip_edges().split("\n"):
			if line.begins_with("- "):
				items.append(line.substr(2).strip_edges())
			else:
				text.append(line.strip_edges())
		out.append({"text": " ".join(text), "items": items})
	return out


## The page with `id`, or {} when there is none.
static func page(id: String) -> Dictionary:
	for s in shared():
		for p in s["pages"]:
			if p["id"] == id:
				return p
	return {}


static func fill(text: String, vals: Dictionary) -> String:
	for k in vals:
		text = text.replace("{%s}" % k, vals[k])
	return text


## Placeholders in `text` with no value, each once.
static func unknown_keys(text: String, vals: Dictionary) -> Array:
	var re := RegEx.create_from_string("\\{([A-Z][A-Z0-9_]*)\\}")
	var out := []
	for m in re.search_all(text):
		var k := m.get_string(1)
		if not vals.has(k) and not out.has(k):
			out.append(k)
	return out


## A number without a trailing ".0".
static func num(f: float) -> String:
	return str(int(f)) if f == floorf(f) else str(f)


static func _pct(f: float) -> String:
	return "%d%%" % roundi(f * 100.0)


## The numbers the help quotes, by placeholder name.
static func values() -> Dictionary:
	var s := Stats.new()
	var v := {
		"SPEED_M_PER_MIN": str(roundi(Walker.SPEED_MPS * 60.0)),
		"ARRIVE_M": str(int(Walker.ARRIVE_M)),
		"MIN_CITY_KM": num(Walker.MIN_CITY_RADIUS_M / 1000.0),
		"MAX_CITY_KM": str(int(Walker.MAX_CITY_RADIUS_M / 1000.0)),
		"MAX_SKIPS": str(Walker.MAX_SKIPS),
		"STAY_MIN": str(int(Activities.MAX_MINUTES)),
		"SKINT": str(Activities.SKINT),
		"SKINT_X3": str(3 * Activities.SKINT),
		"FULLNESS_HOURS": str(roundi(100.0 / Stats.FULLNESS_PER_H)),
		"THIRST_HOURS": str(roundi(100.0 / Stats.THIRST_PER_H)),
		"FLAVOUR_WEIGHT": str(int(Activities.FLAVOUR_WEIGHT)),
		"FULLNESS_PER_H": num(Stats.FULLNESS_PER_H),
		"THIRST_PER_H": num(Stats.THIRST_PER_H),
		"HYGIENE_PER_H": num(Stats.HYGIENE_PER_H),
		"ENERGY_PER_KM": num(Stats.ENERGY_PER_KM),
		"STARVING_PER_H": num(Stats.STARVING_PER_H),
		"FIRST_VISIT_XP": str(Stats.FIRST_VISIT_XP),
		"HOSPITAL_FEE": str(Stats.HOSPITAL_FEE),
		"WAKE_HEALTH": str(int(Stats.WAKE_HEALTH)),
		"BAG_SIZE": str(Stats.BAG_SIZE),
		"KEEP_COINS": str(Stats.KEEP_COINS),
		"SELL_PCT": _pct(Stats.SELL_SHARE),
		"START_COINS": str(s.coins),
		"XP_LV1": str(Stats.xp_to_next(1)),
		"XP_LV2": str(Stats.xp_to_next(2)),
		"XP_LV10": str(Stats.xp_to_next(10)),
		"COUNTRY_PCT": _pct(Trips.COUNTRY_CHANCE),
		"CITY_PCT": _pct(Trips.CITY_CHANCE),
		"SAME_CITY_KM": str(int(Trips.SAME_CITY_M / 1000.0)),
		"TRAVEL_KM_PER_H": str(roundi(Trips.TRAVEL_MPS * 3.6)),
		"MIN_TRAVEL_H": str(int(Trips.MIN_TRAVEL_S / 3600.0)),
		"MAX_TRAVEL_H": str(int(Trips.MAX_TRAVEL_S / 3600.0)),
		"MIN_TRIP_CITY_KM": num(Trips.MIN_CITY_RADIUS_M / 1000.0),
		"MAX_TRIP_CITY_KM": str(int(Trips.MAX_CITY_RADIUS_M / 1000.0)),
		"HISTORY_SIZE": str(History.SIZE),
		"TRAIL_KM": str(roundi(History.MAX_TRAIL * History.TRAIL_STEP_M / 1000.0)),
		"DEBUG_SIZE": str(DebugLog.SIZE),
		"TRIVIA_KM": str(CityFacts.RADIUS_KM),
		"TRIVIA_TWINS": str(CityFacts.MAX_TWINS),
		"TRIVIA_WIT": num(CityFacts.FX["wit"]),
		"TRIVIA_XP": str(CityFacts.FX["xp"]),
		"MOD_PRICE_PCT": _pct(Items.MOD_PRICE),
		"POWER_TO_STAT": num(Items.POWER_TO_STAT),
	}
	var acts: Dictionary = Activities.shared().data
	var flav: Dictionary = Activities.shared().flavour
	v["PLACE_KINDS"] = str(acts.size() - 2)  # without _generic and _spot
	v["ACTION_COUNT"] = str(acts.values().reduce(func(n, a): return n + a.size(), 0))
	v["FLAVOUR_COUNTRIES"] = str(flav.size())
	v["FLAVOUR_ACTIONS"] = str(flav.values().reduce(func(n, t): return n + t.values().reduce(func(m, a): return m + a.size(), 0), 0))
	var cities: Array = Trips.shared().cities
	v["CITY_COUNT"] = str(cities.size())
	var codes := {}
	for c in cities:
		codes[c["code"]] = true
	v["COUNTRY_COUNT"] = str(codes.size())
	for m in s.meters:
		v["START_" + m.to_upper()] = str(int(s.meters[m]))
	var rolls: Array = [0.0] + Items.MOD_ROLLS + [1.0]
	for i in Items.RARITY.size():
		v["MODS%d_PCT" % i] = _pct(rolls[i + 1] - rolls[i])
	for t in Stats.TIMES:
		v["TIME_" + t.to_upper()] = "%02d:00-%02d:00" % Stats.TIMES[t]
	return v
