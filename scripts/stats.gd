## His body, wallet and progress: six meters (0-100), four attributes, coins,
## XP and level, timed buffs, and the activity feed. Time passes in game
## minutes, which are real minutes while the app is open.
## Pure logic: no nodes, so it is easy to test.
extends RefCounted

const METERS := ["health", "energy", "fullness", "mood", "hygiene", "thirst"]
const ATTRS := ["str", "cha", "wit", "luck"]
## Effect keys an action's "fx" may use.
const FX_KEYS := ["health", "energy", "fullness", "mood", "hygiene", "thirst", "str", "cha", "wit", "luck", "xp"]
## Requirement keys an action's "needs" may use.
const NEED_KEYS := ["str", "cha", "wit", "luck", "level", "time", "below"]
## Hours that count as each time of day (night wraps past midnight).
const TIMES := {"morning": [6, 11], "day": [10, 18], "evening": [17, 23], "night": [21, 5]}

const FULLNESS_PER_H := 5.0
const THIRST_PER_H := 6.0
const HYGIENE_PER_H := 2.0
const ENERGY_PER_KM := 2.0
## Health lost per hour for each of hunger and thirst at zero.
const STARVING_PER_H := 5.0
const FIRST_VISIT_XP := 50
const HOSPITAL_FEE := 30
const WAKE_HEALTH := 50.0
const FEED_SIZE := 50

var meters := {"health": 100.0, "energy": 100.0, "fullness": 80.0, "mood": 70.0, "hygiene": 100.0, "thirst": 80.0}
var attrs := {"str": 1.0, "cha": 1.0, "wit": 1.0, "luck": 1.0}
var coins := 50
var xp := 0  # towards the next level
var level := 1
var buffs := []  # {name, left (minutes), per_h: {meter: rate}, xp_mult}
var feed := []  # latest lines, oldest first
var visited := {}  # "name@lat,lon" -> true


static func xp_to_next(lvl: int) -> int:
	return 100 * lvl


func get_meter(name: String) -> float:
	return meters[name]


func buff_names() -> Array:
	return buffs.map(func(b): return b["name"])


## Lets `minutes` pass, `walked_m` of them on foot.
func pass_time(minutes: float, walked_m: float) -> void:
	var h := minutes / 60.0
	var fx := {"fullness": -FULLNESS_PER_H * h, "thirst": -THIRST_PER_H * h, "hygiene": -HYGIENE_PER_H * h,
		"energy": -ENERGY_PER_KM * walked_m / 1000.0}
	for m in ["fullness", "thirst"]:
		if meters[m] <= 0.0:
			fx["health"] = fx.get("health", 0.0) - STARVING_PER_H * h
	for b in buffs:
		var t := minf(minutes, b["left"]) / 60.0
		for m in b.get("per_h", {}):
			fx[m] = fx.get(m, 0.0) + float(b["per_h"][m]) * t
		b["left"] -= minutes
	buffs = buffs.filter(func(b): return b["left"] > 0.0)
	apply_fx(fx)


## Adds meter and attribute changes; meters stay within 0-100.
func apply_fx(fx: Dictionary) -> void:
	for k in fx:
		if meters.has(k):
			meters[k] = clampf(meters[k] + float(fx[k]), 0.0, 100.0)
		elif attrs.has(k):
			attrs[k] = maxf(attrs[k] + float(fx[k]), 0.0)
		elif k == "xp":
			add_xp(int(fx[k]))


func add_xp(n: int) -> void:
	xp += n
	while xp >= xp_to_next(level):
		xp -= xp_to_next(level)
		level += 1
		var best: String = ATTRS[0]
		for a in ATTRS:
			if attrs[a] > attrs[best]:
				best = a
		attrs[best] += 1.0
		say("Reached level %d! %s +1" % [level, best.capitalize()])


func xp_mult() -> float:
	var m := 1.0
	for b in buffs:
		m *= float(b.get("xp_mult", 1.0))
	return m


static func in_time(time: String, hour: int) -> bool:
	var span: Array = TIMES[time]
	if span[0] <= span[1]:
		return hour >= span[0] and hour < span[1]
	return hour >= span[0] or hour < span[1]


## True when he has the coins, skills, level and timing for `action`.
func can_do(action: Dictionary, hour: int) -> bool:
	if int(action.get("cost", 0)) > coins:
		return false
	var needs: Dictionary = action.get("needs", {})
	for k in needs:
		match k:
			"level":
				if level < int(needs[k]):
					return false
			"time":
				if not in_time(needs[k], hour):
					return false
			"below":
				for m in needs[k]:
					if meters[m] >= float(needs[k][m]):
						return false
			_:
				if attrs[k] < float(needs[k]):
					return false
	return true


## Does `action` at `where` and returns the feed line it adds.
func do(action: Dictionary, where: String, rng: RandomNumberGenerator) -> String:
	var spent := int(action.get("cost", 0))
	var fx: Dictionary = action.get("fx", {}).duplicate()
	var text: String = action["name"]
	var risk: Dictionary = action.get("risk", {})
	if not risk.is_empty() and rng.randf() < float(risk["p"]):
		spent += int(risk.get("cost", 0))
		for k in risk.get("fx", {}):
			fx[k] = fx.get(k, 0.0) + risk["fx"][k]
		text += ", " + str(risk.get("text", "it went wrong"))
	var earned := 0
	var earn: Variant = action.get("earn", 0)
	if earn is Array:
		earned = rng.randi_range(int(earn[0]), int(earn[1]))
	else:
		earned = int(earn)
	coins = maxi(coins - spent + earned, 0)
	if fx.has("xp"):
		fx["xp"] = roundi(float(fx["xp"]) * xp_mult())
	apply_fx(fx)
	var buff: Dictionary = action.get("buff", {})
	if not buff.is_empty():
		buffs = buffs.filter(func(b): return b["name"] != buff["name"])
		buffs.append({"name": buff["name"], "left": float(buff["min"]), "per_h": buff.get("per_h", {}), "xp_mult": float(buff.get("xp_mult", 1.0))})
	var money := ""
	if earned - spent != 0:
		money = " (%+dc)" % (earned - spent)
	var line := text + (" at " + where if where != "" else "") + money
	say(line)
	return line


## First visit to a named place gives bonus XP; returns the XP given.
func visit(place: Dictionary) -> int:
	var key := "%s@%.4f,%.4f" % [place.get("name", ""), place.get("lat", 0.0), place.get("lon", 0.0)]
	if place.is_empty() or visited.has(key):
		return 0
	visited[key] = true
	add_xp(FIRST_VISIT_XP)
	return FIRST_VISIT_XP


func fainted() -> bool:
	return meters["health"] <= 0.0


## After fainting: patched up at a hospital for a fee.
func wake_in_hospital(hospital: String) -> String:
	coins = maxi(coins - HOSPITAL_FEE, 0)
	meters["health"] = WAKE_HEALTH
	meters["energy"] = maxf(meters["energy"], 30.0)
	meters["fullness"] = maxf(meters["fullness"], 30.0)
	meters["thirst"] = maxf(meters["thirst"], 30.0)
	return say("Fainted! Woke up at %s (-%dc)" % [hospital if hospital != "" else "the hospital", HOSPITAL_FEE])


func say(line: String) -> String:
	feed.append(line)
	if feed.size() > FEED_SIZE:
		feed = feed.slice(feed.size() - FEED_SIZE)
	return line


func to_dict() -> Dictionary:
	return {"meters": meters, "attrs": attrs, "coins": coins, "xp": xp, "level": level,
		"buffs": buffs, "feed": feed, "visited": visited.keys()}


func load_dict(d: Dictionary) -> void:
	for m in d.get("meters", {}):
		if meters.has(m):
			meters[m] = float(d["meters"][m])
	for a in d.get("attrs", {}):
		if attrs.has(a):
			attrs[a] = float(d["attrs"][a])
	coins = int(d.get("coins", coins))
	xp = int(d.get("xp", 0))
	level = int(d.get("level", 1))
	buffs = []
	for b in d.get("buffs", []):
		buffs.append({"name": b["name"], "left": float(b["left"]), "per_h": b.get("per_h", {}), "xp_mult": float(b.get("xp_mult", 1.0))})
	feed = Array(d.get("feed", []))
	visited = {}
	for k in d.get("visited", []):
		visited[k] = true
