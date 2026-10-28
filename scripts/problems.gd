## Problems from anywhere in the game, for the Debug panel: the last
## MAX_WARNINGS warnings, MAX_ERRORS errors and MAX_SEVERE severe problems
## (he may be stuck: shown on the map too), each also printed to the console.
## Each has a short title and detail lines. A problem repeated right away
## counts up instead of filling the log.
## Pure logic, so it is easy to test.
extends RefCounted

const History := preload("res://scripts/history.gd")

const MAX_WARNINGS := 20
const MAX_ERRORS := 10
const MAX_SEVERE := 10
const LEVELS := ["severe", "error", "warning"]

static var _shared: RefCounted

var warnings := []  # {text (the title), details, t (unix s), count}, oldest first
var errors := []
var severe := []
var unseen := 0  # added since the Debug panel was last opened
var quiet := false  # tests skip the console


## The game's one log.
static func shared() -> RefCounted:
	if _shared == null:
		_shared = new()
	return _shared


static func warn_now(title: String, details := []) -> void:
	shared().warn(title, details)


static func error_now(title: String, details := []) -> void:
	shared().error(title, details)


static func severe_now(title: String, details := []) -> void:
	shared().add_severe(title, details)


func warn(title: String, details := []) -> void:
	if not quiet:
		push_warning(_console(title, details))
	warnings = _add(warnings, title, details, MAX_WARNINGS)


func error(title: String, details := []) -> void:
	if not quiet:
		printerr("ERROR (game): " + _console(title, details))
	errors = _add(errors, title, details, MAX_ERRORS)


func add_severe(title: String, details := []) -> void:
	if not quiet:
		printerr("SEVERE (game): " + _console(title, details))
	severe = _add(severe, title, details, MAX_SEVERE)


static func _console(title: String, details: Array) -> String:
	return title + ("" if details.is_empty() else " | " + " | ".join(details))


func _add(list: Array, title: String, details: Array, cap: int) -> Array:
	var now := int(Time.get_unix_time_from_system())
	if not list.is_empty() and list[-1]["text"] == title:
		list[-1]["count"] = int(list[-1]["count"]) + 1
		list[-1]["t"] = now
		list[-1]["details"] = details
	else:
		list.append({"text": title, "details": details, "t": now, "count": 1})
	unseen += 1
	return list.slice(maxi(list.size() - cap, 0))


func mark_seen() -> void:
	unseen = 0


func clear() -> void:
	warnings = []
	errors = []
	severe = []
	unseen = 0


## Every problem, most serious level first and newest first within it, each
## {level, text, details, t, count}.
func entries() -> Array:
	var out := []
	for pair in [["severe", severe], ["error", errors], ["warning", warnings]]:
		var list: Array = pair[1]
		for i in range(list.size() - 1, -1, -1):
			out.append(list[i].merged({"level": pair[0]}))
	return out


## Errors, then warnings, newest first: "14:05 · ERROR · text (×3)".
func lines(bias_min: int) -> Array:
	var out := []
	for pair in [["SEVERE", severe], ["ERROR", errors], ["Warning", warnings]]:
		var list: Array = pair[1]
		for i in range(list.size() - 1, -1, -1):
			var e: Dictionary = list[i]
			var times := " (×%d)" % int(e["count"]) if int(e["count"]) > 1 else ""
			out.append("%s · %s · %s%s" % [History.time_text(int(e["t"]), bias_min), pair[0], e["text"], times])
	return out


func to_dict() -> Dictionary:
	return {"warnings": warnings, "errors": errors, "severe": severe, "unseen": unseen}


func load_dict(d: Variant) -> void:
	if not d is Dictionary:
		return
	warnings = Array(d.get("warnings", [])).filter(func(e): return e is Dictionary)
	errors = Array(d.get("errors", [])).filter(func(e): return e is Dictionary)
	severe = Array(d.get("severe", [])).filter(func(e): return e is Dictionary)
	unseen = int(d.get("unseen", 0))
