## Small files under user:// (IndexedDB in the browser), each stamped with
## the unix time it was saved, so stale entries can be refreshed.
extends RefCounted

const Problems := preload("res://scripts/problems.gd")
const MAX_AGE_S := 30 * 86400

var dir: String


func _init(path: String) -> void:
	dir = path if path.ends_with("/") else path + "/"
	DirAccess.make_dir_recursive_absolute(dir)


static func is_stale(saved_at: int, now: int, max_age_s := MAX_AGE_S) -> bool:
	return now - saved_at > max_age_s


func has(name: String) -> bool:
	return FileAccess.file_exists(dir + name)


func put(name: String, bytes: PackedByteArray, saved_at := int(Time.get_unix_time_from_system())) -> void:
	var f := FileAccess.open(dir + name, FileAccess.WRITE)
	if f == null:
		Problems.warn_now("Couldn't write %s to the cache (%s)" % [name, error_string(FileAccess.get_open_error())])
		return
	f.store_64(saved_at)
	f.store_buffer(bytes)


## {"t": unix time saved, "bytes": contents}, or {} when missing or unreadable.
func read(name: String) -> Dictionary:
	var f := FileAccess.open(dir + name, FileAccess.READ)
	if f == null or f.get_length() < 8:
		return {}
	var t := f.get_64()
	return {"t": t, "bytes": f.get_buffer(f.get_length() - 8)}


## Keeps only the `keep` most recently saved entries.
func prune(keep: int) -> void:
	var names := DirAccess.get_files_at(dir)
	if names.size() <= keep:
		return
	var dated := []
	for n in names:
		var f := FileAccess.open(dir + n, FileAccess.READ)
		dated.append([f.get_64() if f and f.get_length() >= 8 else 0, n])
	dated.sort_custom(func(a, b): return a[0] > b[0])
	for i in range(keep, dated.size()):
		DirAccess.remove_absolute(dir + dated[i][1])


func clear() -> void:
	for n in DirAccess.get_files_at(dir):
		DirAccess.remove_absolute(dir + n)
