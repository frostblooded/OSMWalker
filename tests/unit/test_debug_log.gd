extends GutTest

const DebugLog := preload("res://scripts/debug_log.gd")


func test_keeps_only_the_latest_picks() -> void:
	var log := DebugLog.new()
	for i in DebugLog.SIZE + 5:
		log.add({"n": i})
	assert_eq(log.entries.size(), DebugLog.SIZE)
	assert_eq(log.entries[-1]["n"], DebugLog.SIZE + 4)
	assert_true(log.entries[-1].has("t"), "stamped with when it happened")


func test_survives_a_save() -> void:
	var log := DebugLog.new()
	log.add({"fallback": "x"})
	var again := DebugLog.new()
	again.load_array(JSON.parse_string(JSON.stringify(log.to_array())))
	assert_eq(again.entries.size(), 1)
	assert_eq(again.entries[0]["fallback"], "x")


func test_a_place_pick_shows_both_rolls_and_the_odds() -> void:
	var text := "\n".join(DebugLog.lines({
		"t": 0, "roll": 0.4312, "outcome": "stay",
		"in_box": 37, "too_close": 2, "total_weight": 10.0,
		"r": 0.612, "place": "Cafe East", "class": "cafe", "rank": 4}, 0))
	assert_string_contains(text, "0.4312")
	assert_string_contains(text, "stay")
	assert_string_contains(text, "37 places")
	assert_string_contains(text, "2 within 30 m")
	assert_string_contains(text, "0.6120")
	assert_string_contains(text, "Cafe East")
	assert_string_contains(text, "rank 4")
	assert_string_contains(text, "2.5%")  # weight 0.25 of 10


func test_a_random_spot_says_why() -> void:
	var text := "\n".join(DebugLog.lines({
		"t": 0, "skipped": "first pick in a new city", "in_box": 0, "too_close": 0,
		"fallback": "no places loaded in the city box yet", "spot": [42.01, 23.02], "cells": 3}, 0))
	assert_string_contains(text, "first pick in a new city")
	assert_string_contains(text, "Random spot")
	assert_string_contains(text, "no places loaded in the city box yet")
	assert_string_contains(text, "42.01")
	assert_string_contains(text, "3 street cells")


func test_a_trip_shows_where_and_its_odds() -> void:
	var text := "\n".join(DebugLog.lines({
		"t": 0, "forced": "country", "trip": "Paris, France", "options": 120, "chance": 0.041}, 0))
	assert_string_contains(text, "button")
	assert_string_contains(text, "Paris, France")
	assert_string_contains(text, "120 cities")
	assert_string_contains(text, "4.1%")


func test_a_trip_says_how_he_goes() -> void:
	var text := "\n".join(DebugLog.lines({"t": 0, "trip": "Varna, Bulgaria", "by": "bus from Central Station"}, 0))
	assert_string_contains(text, "Going by bus from Central Station")
