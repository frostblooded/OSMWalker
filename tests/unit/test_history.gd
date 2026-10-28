## The history log: the last 100 things that happened, where, and the trail he walked.
extends GutTest

const History := preload("res://scripts/history.gd")

var h: History


func before_each() -> void:
	h = History.new()


func test_logs_where_and_when() -> void:
	h.move_to(42.0, 23.0)
	h.add("Bought bread", 1000)
	assert_eq(h.entries.size(), 1)
	assert_eq(h.entries[0]["text"], "Bought bread")
	assert_eq(h.entries[0]["t"], 1000)
	assert_eq(h.entries[0]["at"], [42.0, 23.0])
	assert_eq(h.latest(), "Bought bread")


func test_before_he_is_anywhere_entries_have_no_spot() -> void:
	h.add("Hello", 1)
	assert_eq(h.entries[0]["at"], [])


func test_keeps_the_last_100() -> void:
	for i in History.SIZE + 5:
		h.add("e%d" % i, i)
	assert_eq(h.entries.size(), History.SIZE)
	assert_eq(h.entries[0]["text"], "e5")
	assert_eq(h.latest(), "e%d" % (History.SIZE + 4))


func test_trail_drops_points_closer_than_a_step() -> void:
	h.move_to(42.0, 23.0)
	h.move_to(42.00001, 23.0)  # about 1 m
	assert_eq(h.trail_points(), 1)
	h.move_to(42.001, 23.0)  # about 110 m
	assert_eq(h.trail_points(), 2)


func test_a_trip_breaks_the_trail() -> void:
	h.move_to(42.0, 23.0)
	h.move_to(42.001, 23.0)
	h.break_trail()
	h.move_to(48.0, 2.0)
	h.move_to(48.001, 2.0)
	var segs := h.segments()
	assert_eq(segs.size(), 2)
	assert_eq(segs[0].size(), 2)
	assert_eq(segs[1][0], [48.0, 2.0])


func test_trail_starts_where_the_oldest_entry_happened() -> void:
	for i in History.SIZE + 1:
		h.move_to(42.0 + i * 0.001, 23.0)
		h.add("e%d" % i, i)
	var segs := h.segments()
	assert_eq(segs.size(), 1)
	assert_eq(segs[0][0], h.entries[0]["at"], "trail before the oldest entry is gone")


func test_trail_is_capped() -> void:
	for i in History.MAX_TRAIL + 10:
		h.move_to(42.0 + i * 0.001, 23.0)
	assert_eq(h.trail_points(), History.MAX_TRAIL)


func test_markers_number_newest_first_and_group_same_spot() -> void:
	h.move_to(42.0, 23.0)
	h.add("Reached Cafe", 1)
	h.add("Drank coffee at Cafe", 2)
	h.move_to(42.001, 23.0)
	h.add("Reached Park", 3)
	var ms := h.markers()
	assert_eq(ms.size(), 2)
	assert_eq(ms[0], {"at": [42.0, 23.0], "label": "2-3", "first": 2})
	assert_eq(ms[1], {"at": [42.001, 23.0], "label": "1", "first": 1})


func test_number_of_entry_index() -> void:
	for i in 3:
		h.add("e%d" % i, i)
	assert_eq(h.number(2), 1, "newest is 1")
	assert_eq(h.number(0), 3)


func test_entries_with_no_spot_have_no_marker() -> void:
	h.add("Old line", 1)
	assert_eq(h.markers(), [])


func test_bounds_cover_trail_and_entries() -> void:
	h.move_to(42.0, 23.0)
	h.add("a", 1)
	h.move_to(42.002, 23.003)
	assert_eq(h.bounds(), [42.0, 23.0, 42.002, 23.003])
	assert_eq(History.new().bounds(), [])


func test_round_trip() -> void:
	h.move_to(42.0, 23.0)
	h.add("a", 1)
	h.move_to(42.001, 23.0)
	h.break_trail()
	h.move_to(48.0, 2.0)
	var back := History.new()
	back.load_dict(JSON.parse_string(JSON.stringify(h.to_dict())))
	assert_eq(back.entries, h.entries)
	assert_eq(back.segments(), h.segments())
	assert_eq(back.latest(), "a")


func test_old_feed_lines_load_without_spots() -> void:
	var back := History.new()
	back.load_feed(["one", "two"])
	assert_eq(back.latest(), "two")
	assert_eq(back.entries[0]["at"], [])


func test_time_text_is_local_hours_and_minutes() -> void:
	assert_eq(History.time_text(13 * 3600 + 5 * 60, 0), "13:05")
	assert_eq(History.time_text(23 * 3600, 120), "01:00")
