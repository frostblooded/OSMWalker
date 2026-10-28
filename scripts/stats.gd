## His body, wallet and progress: six meters (0-100), four attributes, coins,
## XP and level, timed buffs, gear and a bag of items, and his history (see history.gd). Time passes in game
## minutes, which are real minutes while the app is open.
## Pure logic: no nodes, so it is easy to test.
extends RefCounted

const Items := preload("res://scripts/items.gd")
const History := preload("res://scripts/history.gd")

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
const BAG_SIZE := 20
## He won't buy gear that leaves him with fewer coins than this.
const KEEP_COINS := 20
## Share of an item's price he gets selling it, before his charm.
const SELL_SHARE := 0.4

var meters := {"health": 100.0, "energy": 100.0, "fullness": 80.0, "mood": 70.0, "hygiene": 100.0, "thirst": 80.0}
var attrs := {"str": 1.0, "cha": 1.0, "wit": 1.0, "luck": 1.0}
var coins := 50
var xp := 0  # towards the next level
var level := 1
var buffs := []  # {name, left (minutes), per_h: {meter: rate}, xp_mult}
var history := History.new()
var feed: Array:  # latest lines, oldest first
	get:
		return history.texts()
var visited := {}  # "name@lat,lon" -> true
var gear := {}  # slot -> item worn (see items.gd)
var bag := []  # items carried, up to BAG_SIZE


static func xp_to_next(lvl: int) -> int:
	return 100 * lvl


func get_meter(name: String) -> float:
	return meters[name]


## An attribute with his gear's bonuses.
func attr(name: String) -> float:
	var v: float = attrs[name]
	for slot in gear:
		v += float(gear[slot]["stats"].get(name, 0.0))
	return v


## Wears `item`; whatever was in its slot goes in the bag.
func equip(item: Dictionary) -> void:
	var old: Dictionary = gear.get(item["slot"], {})
	gear[item["slot"]] = item
	if not old.is_empty():
		_bag_add(old)


func unequip(slot: String) -> void:
	if gear.has(slot):
		_bag_add(gear[slot])
		gear.erase(slot)


## True when `item` beats what he wears in its slot.
func is_upgrade(item: Dictionary) -> bool:
	return Items.power(item) > Items.power(gear.get(item["slot"], {}))


## Buys and wears `item` if it is an upgrade he can afford; returns the feed line.
func buy(item: Dictionary, where: String) -> String:
	var at := " at " + where if where != "" else ""
	if not is_upgrade(item) or coins - int(item["price"]) < KEEP_COINS:
		return say("Looked at a %s %s%s but didn't buy it (%dc)" % [item["rarity"], item["name"], at, item["price"]])
	coins -= int(item["price"])
	equip(item)
	return say("Bought a %s %s%s (-%dc)" % [item["rarity"], item["name"], at, item["price"]])


## Sells the cheapest thing in his bag; returns the feed line.
func sell_loot(where: String) -> String:
	var at := " at " + where if where != "" else ""
	if bag.is_empty():
		return say("Had nothing to sell" + at)
	var item := _sell_cheapest()
	return say("Sold his %s%s (+%dc)" % [item["name"], at, sell_price(item)])


func sell_price(item: Dictionary) -> int:
	return roundi(float(item["price"]) * SELL_SHARE * (1.0 + 0.05 * attr("cha")))


func _sell_cheapest() -> Dictionary:
	var i := 0
	for j in bag.size():
		if bag[j]["price"] < bag[i]["price"]:
			i = j
	var item: Dictionary = bag.pop_at(i)
	coins += sell_price(item)
	return item


func _bag_add(item: Dictionary) -> void:
	if bag.size() >= BAG_SIZE:
		var sold := _sell_cheapest()
		if sold["price"] > item["price"]:
			bag.append(sold)  # keep the better one
			coins -= sell_price(sold)
			coins += sell_price(item)
			return
	bag.append(item)


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
	if action.has("item") and coins <= KEEP_COINS:
		return false
	if action.get("sell", false) and bag.is_empty():
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
				if attr(k) < float(needs[k]):
					return false
	return true


## Does `action` at `where` and returns the feed line it adds. A shop
## action ("item": kind) offers him a random item; "sell" sells his loot.
func do(action: Dictionary, where: String, rng: RandomNumberGenerator) -> String:
	if action.has("item"):
		apply_fx(action.get("fx", {}))
		return buy(Items.make(action["item"], level, rng), where)
	if action.get("sell", false):
		apply_fx(action.get("fx", {}))
		return sell_loot(where)
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
	history.add(line, int(Time.get_unix_time_from_system()))
	return line


func to_dict() -> Dictionary:
	return {"meters": meters, "attrs": attrs, "coins": coins, "xp": xp, "level": level,
		"buffs": buffs, "history": history.to_dict(), "visited": visited.keys(), "gear": gear, "bag": bag}


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
	history = History.new()
	if d.has("history"):
		history.load_dict(d["history"])
	else:
		history.load_feed(d.get("feed", []))
	visited = {}
	for k in d.get("visited", []):
		visited[k] = true
	gear = {}
	var worn: Dictionary = d.get("gear", {})
	for slot in worn:
		gear[slot] = _item_from(worn[slot])
	bag = Array(d.get("bag", [])).map(_item_from)


## An item read back from JSON, with numbers as the right types.
static func _item_from(d: Dictionary) -> Dictionary:
	var stats := {}
	for k in d.get("stats", {}):
		stats[k] = float(d["stats"][k])
	return {"name": d["name"], "slot": d["slot"], "stats": stats, "rarity": d.get("rarity", "Common"), "price": int(d.get("price", 0))}
