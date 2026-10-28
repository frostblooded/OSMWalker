extends GutTest

const UiKit := preload("res://scripts/ui_kit.gd")


func test_icon_fonts_have_the_icons() -> void:
	UiKit.install_icon_fonts()
	var f: Font = ThemeDB.fallback_font
	for key in UiKit.ICON:
		var s: String = UiKit.ICON[key]
		var found := f.has_char(s.unicode_at(0))
		for fb in f.fallbacks:
			found = found or fb.has_char(s.unicode_at(0))
		assert_true(found, "%s (%s) can be drawn" % [key, s])


func test_card_has_a_heading_and_a_body() -> void:
	var c := UiKit.card(UiKit.ICON["city"], "City", "Sofia")
	autofree(c["card"])
	assert_true(c["body"] is VBoxContainer)
	assert_eq(c["value"].text, "Sofia")


func test_rows_alternate_backgrounds() -> void:
	var a := UiKit.zebra(0)
	var b := UiKit.zebra(1)
	autofree(a)
	autofree(b)
	assert_ne((a.get_theme_stylebox("panel") as StyleBoxFlat).bg_color, (b.get_theme_stylebox("panel") as StyleBoxFlat).bg_color)


func test_sizes_follow_the_guidelines() -> void:
	assert_gte(UiKit.SMALL, 24)
	assert_gte(UiKit.TAP, 96)
