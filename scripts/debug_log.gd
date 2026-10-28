## Debug log: how each of his last SIZE goals was picked, with every roll,
## the odds and why a random spot was used. Pure logic, so it is easy to test.
extends RefCounted

const History := preload("res://scripts/history.gd")
const Walker := preload("res://scripts/walker.gd")
const Trips := preload("res://scripts/trips.gd")

const SIZE := 50
const FORCED := {"goal": "New goal button", "city": "New city button", "country": "New country button"}

var entries := []  # info dicts from Walker.picked plus the trip roll, oldest first


func add(info: Dictionary) -> void:
	var e := info.duplicate()
	if not e.has("t"):
		e["t"] = int(Time.get_unix_time_from_system())
	entries.append(e)
	if entries.size() > SIZE:
		entries = entries.slice(entries.size() - SIZE)


func to_array() -> Array:
	return entries


func load_array(a: Variant) -> void:
	entries = a.filter(func(e): return e is Dictionary) if a is Array else []


## The lines that explain one pick.
static func lines(e: Dictionary, bias_min: int) -> Array:
	var out := []
	var head := History.time_text(int(e.get("t", 0)), bias_min)
	if e.has("forced"):
		head += " · forced by the " + FORCED.get(e["forced"], e["forced"])
	out.append(head)
	if e.has("skipped"):
		out.append("Trip dice not rolled: " + e["skipped"])
	elif e.has("roll"):
		var boost := float(e.get("boost", 1.0))
		out.append("Trip dice %.4f → %s (country below %.2f, city below %.2f, else stay)%s" % [
			e["roll"], e.get("outcome", "?"), Trips.COUNTRY_CHANCE * boost, (Trips.COUNTRY_CHANCE + Trips.CITY_CHANCE) * boost,
			"; odds doubled: no places in the city box" if boost > 1.0 else ""])
	if e.has("trip"):
		out.append("Trip to %s: %d cities to pick from by population, this one had %s" % [
			e["trip"], int(e.get("options", 0)), _pct(float(e.get("chance", 0.0)))])
		return out
	if e.get("no_trip", "") != "":
		out.append("No trip: " + e["no_trip"])
	if not e.has("in_box"):
		return out
	out.append("%d places in the city box, %d within %d m of him skipped" % [
		int(e["in_box"]), int(e.get("too_close", 0)), int(Walker.ARRIVE_M)])
	if e.has("place"):
		var w := 1.0 / maxi(int(e.get("rank", 1)), 1)
		out.append("Place dice %.4f → %s (%s, rank %d, weight %.2f of %.2f = %s)" % [
			e.get("r", 0.0), e["place"], e.get("class", ""), int(e.get("rank", 1)), w,
			float(e.get("total_weight", 0.0)), _pct(w / maxf(float(e.get("total_weight", 0.0)), 0.0001))])
	elif e.has("fallback"):
		var spot: Array = e.get("spot", [0.0, 0.0])
		out.append("Random spot %.5f, %.5f because %s (%d street cells loaded)" % [
			spot[0], spot[1], e["fallback"], int(e.get("cells", 0))])
	return out


static func _pct(f: float) -> String:
	return "%.1f%%" % (f * 100.0)
