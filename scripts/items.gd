## Procedural items: a base from the shop's kind, a material that unlocks
## with his level, and 0-3 modifiers that add stats and name the item
## ("Mighty Bronze Sword of the Fox"). More modifiers are rarer.
## There is no combat: gear only adds to his attributes.
extends RefCounted

const SLOTS := ["weapon", "offhand", "head", "body", "feet", "bag", "trinket", "vehicle"]
const RARITY := ["Common", "Uncommon", "Rare", "Legendary"]
## Roll thresholds for 1, 2 and 3 modifiers: 60% none, 28% one, 10% two, 2% three.
const MOD_ROLLS := [0.6, 0.88, 0.98]
const MOD_PRICE := 0.6  # each modifier adds this share of the price

## Bases by the kind of shop that sells them. "stat" is the attribute the
## base raises; metal and cloth pick the material names. Vehicles name their
## kind ("vehicle", see speeds.gd) and raise his speed by a percentage.
const KINDS := {
	"weapons": [
		{"base": "Sword", "slot": "weapon", "stat": "str", "price": 20},
		{"base": "Sabre", "slot": "weapon", "stat": "str", "price": 22},
		{"base": "Dagger", "slot": "weapon", "stat": "str", "price": 12},
		{"base": "Mace", "slot": "weapon", "stat": "str", "price": 18},
		{"base": "Axe", "slot": "weapon", "stat": "str", "price": 18},
		{"base": "Spear", "slot": "weapon", "stat": "str", "price": 16},
		{"base": "Hammer", "slot": "weapon", "stat": "str", "price": 16},
		{"base": "Bow", "slot": "weapon", "stat": "wit", "price": 20},
		{"base": "Buckler", "slot": "offhand", "stat": "str", "price": 12},
		{"base": "Kite Shield", "slot": "offhand", "stat": "str", "price": 18},
		{"base": "Tower Shield", "slot": "offhand", "stat": "str", "price": 24},
		{"base": "Helmet", "slot": "head", "stat": "str", "price": 15},
		{"base": "Mail Shirt", "slot": "body", "stat": "str", "price": 25},
	],
	"improvised": [
		{"base": "Crowbar", "slot": "weapon", "stat": "str", "price": 8},
		{"base": "Wrench", "slot": "weapon", "stat": "wit", "price": 7},
		{"base": "Frying Pan", "slot": "weapon", "stat": "str", "price": 6},
		{"base": "Rolling Pin", "slot": "weapon", "stat": "str", "price": 5},
		{"base": "Umbrella", "slot": "weapon", "stat": "cha", "price": 6},
		{"base": "Bin Lid", "slot": "offhand", "stat": "str", "price": 4},
	],
	"clothes": [
		{"base": "Shirt", "slot": "body", "stat": "cha", "price": 10, "cloth": true},
		{"base": "Jacket", "slot": "body", "stat": "cha", "price": 18, "cloth": true},
		{"base": "Coat", "slot": "body", "stat": "cha", "price": 22, "cloth": true},
		{"base": "Hoodie", "slot": "body", "stat": "luck", "price": 12, "cloth": true},
		{"base": "Boots", "slot": "feet", "stat": "str", "price": 16, "cloth": true},
		{"base": "Trainers", "slot": "feet", "stat": "str", "price": 14, "cloth": true},
		{"base": "Sandals", "slot": "feet", "stat": "luck", "price": 8, "cloth": true},
		{"base": "Cap", "slot": "head", "stat": "cha", "price": 6, "cloth": true},
		{"base": "Beanie", "slot": "head", "stat": "wit", "price": 6, "cloth": true},
		{"base": "Backpack", "slot": "bag", "stat": "str", "price": 15, "cloth": true},
	],
	"trinkets": [
		{"base": "Ring", "slot": "trinket", "stat": "luck", "price": 15},
		{"base": "Amulet", "slot": "trinket", "stat": "luck", "price": 18},
		{"base": "Bracelet", "slot": "trinket", "stat": "cha", "price": 12},
		{"base": "Earring", "slot": "trinket", "stat": "cha", "price": 10},
		{"base": "Pocket Watch", "slot": "trinket", "stat": "wit", "price": 20},
		{"base": "Lucky Charm", "slot": "trinket", "stat": "luck", "price": 8},
	],
	"instruments": [
		{"base": "Lute", "slot": "trinket", "stat": "cha", "price": 20},
		{"base": "Guitar", "slot": "trinket", "stat": "cha", "price": 25},
		{"base": "Harmonica", "slot": "trinket", "stat": "cha", "price": 8},
		{"base": "Drum", "slot": "trinket", "stat": "str", "price": 15},
		{"base": "Violin", "slot": "trinket", "stat": "wit", "price": 30},
	],
	"bicycles": [
		{"base": "Bike", "slot": "vehicle", "vehicle": "bike", "stat": "speed", "price": 80},
		{"base": "Racing Bike", "slot": "vehicle", "vehicle": "bike", "stat": "speed", "price": 95},
	],
	"motorcycles": [
		{"base": "Scooter", "slot": "vehicle", "vehicle": "motorcycle", "stat": "speed", "price": 280},
		{"base": "Motorbike", "slot": "vehicle", "vehicle": "motorcycle", "stat": "speed", "price": 320},
	],
	"cars": [
		{"base": "Hatchback", "slot": "vehicle", "vehicle": "car", "stat": "speed", "price": 780},
		{"base": "Saloon", "slot": "vehicle", "vehicle": "car", "stat": "speed", "price": 850},
	],
}
## Ranks vehicles by kind first, so any car beats any bike.
const VEHICLE_POWER := {"bike": 100.0, "motorcycle": 200.0, "car": 300.0}
## Speed percent per point of material power on a vehicle.
const SPEED_PER_POWER := 2.0

## Materials in order of power; each unlocks at a level.
const MATERIALS := [
	{"metal": "Wooden", "cloth": "Cotton", "level": 1, "power": 1.0, "price": 1.0},
	{"metal": "Copper", "cloth": "Wool", "level": 1, "power": 2.0, "price": 1.5},
	{"metal": "Bronze", "cloth": "Linen", "level": 3, "power": 3.0, "price": 2.0},
	{"metal": "Iron", "cloth": "Leather", "level": 5, "power": 4.0, "price": 3.0},
	{"metal": "Steel", "cloth": "Silk", "level": 10, "power": 6.0, "price": 5.0},
	{"metal": "Silver", "cloth": "Velvet", "level": 15, "power": 7.0, "price": 8.0},
	{"metal": "Mithril", "cloth": "Dragonhide", "level": 25, "power": 10.0, "price": 15.0},
]
## Main stat per point of material power.
const POWER_TO_STAT := 0.5

const PREFIXES := [
	{"name": "Mighty", "stats": {"str": 2.0}},
	{"name": "Charming", "stats": {"cha": 2.0}},
	{"name": "Clever", "stats": {"wit": 2.0}},
	{"name": "Lucky", "stats": {"luck": 2.0}},
	{"name": "Sharp", "stats": {"str": 1.0, "wit": 1.0}},
	{"name": "Gleaming", "stats": {"cha": 1.0, "luck": 1.0}},
	{"name": "Swift", "stats": {"speed": 4.0}},
]
const SUFFIXES := [
	{"name": "of the Bear", "stats": {"str": 2.0}},
	{"name": "of the Fox", "stats": {"wit": 2.0}},
	{"name": "of the Peacock", "stats": {"cha": 2.0}},
	{"name": "of Fortune", "stats": {"luck": 2.0}},
	{"name": "of the Owl", "stats": {"wit": 1.0, "luck": 1.0}},
	{"name": "of the Hare", "stats": {"speed": 4.0}},
]


## How many modifiers a roll `r` in [0, 1) gives.
static func modifier_count(r: float) -> int:
	var n := 0
	for t in MOD_ROLLS:
		if r >= t:
			n += 1
	return n


## A random item from a shop of `kind` for a walker of `level`.
static func make(kind: String, level: int, rng: RandomNumberGenerator) -> Dictionary:
	var bases: Array = KINDS[kind]
	var base: Dictionary = bases[rng.randi_range(0, bases.size() - 1)]
	var open := MATERIALS.filter(func(m): return m["level"] <= level)
	var mat: Dictionary = open[rng.randi_range(0, open.size() - 1)]
	var mods := []
	var n := modifier_count(rng.randf())
	# At most one suffix; the rest are prefixes, never the same one twice.
	if n > 0:
		mods.append(SUFFIXES[rng.randi_range(0, SUFFIXES.size() - 1)])
	var prefixes := PREFIXES.duplicate()
	for i in n - 1:
		mods.push_front(prefixes.pop_at(rng.randi_range(0, prefixes.size() - 1)))
	return build(base, mat, mods)


## The item made of `base`, material `mat` and modifiers `mods` (prefixes
## first, then the suffix).
static func build(base: Dictionary, mat: Dictionary, mods: Array) -> Dictionary:
	var per: float = SPEED_PER_POWER if base["stat"] == "speed" else POWER_TO_STAT
	var stats := {base["stat"]: mat["power"] * per}
	var before := []
	var after := []
	for m in mods:
		(after if m["name"].begins_with("of ") else before).append(m["name"])
		for k in m["stats"]:
			stats[k] = stats.get(k, 0.0) + m["stats"][k]
	var words := before + [mat["cloth" if base.get("cloth", false) else "metal"], base["base"]] + after
	var item := {
		"name": " ".join(words), "slot": base["slot"], "stats": stats, "rarity": RARITY[mods.size()],
		"price": roundi(base["price"] * mat["price"] * (1.0 + MOD_PRICE * mods.size())),
	}
	if base.has("vehicle"):
		item["vehicle"] = base["vehicle"]
	return item


## Total of an item's stat bonuses, to compare gear.
static func power(item: Dictionary) -> float:
	var p: float = VEHICLE_POWER.get(item.get("vehicle", ""), 0.0)
	for k in item.get("stats", {}):
		p += float(item["stats"][k])
	return p
