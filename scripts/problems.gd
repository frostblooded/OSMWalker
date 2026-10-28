## Warnings and errors from anywhere in the game, for the Debug panel: the
## last MAX_WARNINGS warnings and MAX_ERRORS errors, each also printed to the
## console. A message repeated right away counts up instead of filling the log.
## Pure logic, so it is easy to test.
extends RefCounted

const History := preload("res://scripts/history.gd")

const MAX_WARNINGS := 20
const MAX_ERRORS := 10

static var _shared: RefCounted

var warnings := []  # {text, t (unix s), count}, oldest first
var errors := []
var unseen := 0  # added since the Debug panel was last opened
var quiet := false  # tests skip the console


## The game's one log.
static func shared() -> RefCounted:
	if _shared == null:
		_shared = new()
	return _shared


static func warn_now(text: String) -> void:
	shared().warn(text)


static func error_now(text: String) -> void:
	shared().error(text)


func warn(text: String) -> void:
	if not quiet:
		push_warning(text)
	warnings = _add(warnings, text, MAX_WARNINGS)


func error(text: String) -> void:
	if not quiet:
		printerr("ERROR (game): " + text)
	errors = _add(errors, text, MAX_ERRORS)


func _add(list: Array, text: String, cap: int) -> Array:
	var now := int(Time.get_unix_time_from_system())
	if not list.is_empty() and list[-1]["text"] == text:
		list[-1]["count"] = int(list[-1]["count"]) + 1
		list[-1]["t"] = now
	else:
		list.append({"text": text, "t": now, "count": 1})
	unseen += 1
	return list.slice(maxi(list.size() - cap, 0))


func mark_seen() -> void:
	unseen = 0


func clear() -> void:
	warnings = []
	errors = []
	unseen = 0


## Errors, then warnings, newest first: "14:05 · ERROR · text (×3)".
func lines(bias_min: int) -> Array:
	var out := []
	for pair in [["ERROR", errors], ["Warning", warnings]]:
		var list: Array = pair[1]
		for i in range(list.size() - 1, -1, -1):
			var e: Dictionary = list[i]
			var times := " (×%d)" % int(e["count"]) if int(e["count"]) > 1 else ""
			out.append("%s · %s · %s%s" % [History.time_text(int(e["t"]), bias_min), pair[0], e["text"], times])
	return out


func to_dict() -> Dictionary:
	return {"warnings": warnings, "errors": errors, "unseen": unseen}


func load_dict(d: Variant) -> void:
	if not d is Dictionary:
		return
	warnings = Array(d.get("warnings", [])).filter(func(e): return e is Dictionary)
	errors = Array(d.get("errors", [])).filter(func(e): return e is Dictionary)
	unseen = int(d.get("unseen", 0))
