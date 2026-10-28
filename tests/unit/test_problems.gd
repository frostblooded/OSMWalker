extends GutTest

const Problems := preload("res://scripts/problems.gd")

var log: Problems


func before_each() -> void:
	log = Problems.new()
	log.quiet = true


func test_keeps_the_last_20_warnings_and_10_errors() -> void:
	for i in 25:
		log.warn("w%d" % i)
	for i in 15:
		log.error("e%d" % i)
	assert_eq(log.warnings.size(), Problems.MAX_WARNINGS)
	assert_eq(log.errors.size(), Problems.MAX_ERRORS)
	assert_eq(log.warnings[-1]["text"], "w24")
	assert_eq(log.errors[0]["text"], "e5")


func test_a_repeat_counts_up_instead_of_filling_the_log() -> void:
	log.warn("tile failed")
	log.warn("tile failed")
	log.warn("tile failed")
	assert_eq(log.warnings.size(), 1)
	assert_eq(log.warnings[0]["count"], 3)


func test_counts_what_has_not_been_seen() -> void:
	log.warn("a")
	log.error("b")
	assert_eq(log.unseen, 2)
	log.mark_seen()
	assert_eq(log.unseen, 0)


func test_survives_a_save() -> void:
	log.warn("a")
	log.error("b")
	var again := Problems.new()
	again.load_dict(JSON.parse_string(JSON.stringify(log.to_dict())))
	assert_eq(again.warnings[0]["text"], "a")
	assert_eq(again.errors[0]["text"], "b")


func test_lines_show_errors_first_newest_first() -> void:
	log.warn("old warning")
	log.error("bad")
	log.warn("new warning")
	var text := "\n".join(log.lines(0))
	assert_lt(text.find("bad"), text.find("new warning"))
	assert_lt(text.find("new warning"), text.find("old warning"))


func test_shared_log_is_one_instance() -> void:
	assert_same(Problems.shared(), Problems.shared())


func test_severe_problems_have_their_own_list_and_details() -> void:
	log.add_severe("Can't leave Sofia", ["No bus station"])
	log.warn("w")
	assert_eq(log.severe[0]["text"], "Can't leave Sofia")
	assert_eq(log.severe[0]["details"], ["No bus station"])
	var e := log.entries()
	assert_eq(e[0]["level"], "severe", "most serious first")
	assert_eq(e[1]["level"], "warning")
