extends GutTest

const DiskCache := preload("res://scripts/disk_cache.gd")
const DIR := "user://test_cache/"

var cache: DiskCache


func before_each() -> void:
	cache = DiskCache.new(DIR)
	cache.clear()


func after_all() -> void:
	DiskCache.new(DIR).clear()


func test_stores_and_reads_back_bytes() -> void:
	cache.put("a", PackedByteArray([1, 2, 3]), 1000)
	assert_true(cache.has("a"))
	var e := cache.read("a")
	assert_eq(e["bytes"], PackedByteArray([1, 2, 3]))
	assert_eq(e["t"], 1000)


func test_missing_entry_is_empty() -> void:
	assert_false(cache.has("nope"))
	assert_eq(cache.read("nope"), {})


func test_survives_a_new_instance() -> void:
	cache.put("b", PackedByteArray([9]), 5)
	assert_eq(DiskCache.new(DIR).read("b")["bytes"], PackedByteArray([9]))


func test_entries_go_stale_after_30_days() -> void:
	var day := 86400
	assert_false(DiskCache.is_stale(0, 29 * day))
	assert_true(DiskCache.is_stale(0, 31 * day))


func test_prune_keeps_the_newest_entries() -> void:
	for i in 5:
		cache.put("k%d" % i, PackedByteArray([i]), 100 + i)
	cache.prune(3)
	assert_false(cache.has("k0"))
	assert_false(cache.has("k1"))
	assert_true(cache.has("k2"))
	assert_true(cache.has("k4"))
