## City trivia from Wikidata: one SPARQL query for the most populous place
## near the city centre and a few facts about it (founding, population,
## height, twin towns, namesake, what it is the capital of), turned into
## quick actions he can do at random spots.
extends RefCounted

const SPARQL_URL := "https://query.wikidata.org/sparql"
const RADIUS_KM := 15
const MAX_TWINS := 5
const FX := {"wit": 0.2, "xp": 10}


static func query(lat: float, lon: float) -> String:
	return """SELECT ?cityLabel ?pop ?inception ?elev ?twinLabel ?namedLabel ?capLabel WHERE {
  { SELECT ?city ?pop WHERE {
      SERVICE wikibase:around { ?city wdt:P625 ?loc .
        bd:serviceParam wikibase:center "Point(%s %s)"^^geo:wktLiteral .
        bd:serviceParam wikibase:radius "%d" . }
      ?city wdt:P1082 ?pop .
    } ORDER BY DESC(?pop) LIMIT 1 }
  OPTIONAL { ?city wdt:P571 ?inception }
  OPTIONAL { ?city wdt:P2044 ?elev }
  OPTIONAL { ?city wdt:P190 ?twin }
  OPTIONAL { ?city wdt:P138 ?named }
  OPTIONAL { ?city wdt:P1376 ?cap }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
} LIMIT 200""" % [str(lon), str(lat), RADIUS_KM]


static func url(lat: float, lon: float) -> String:
	return "%s?format=json&query=%s" % [SPARQL_URL, query(lat, lon).uri_encode()]


## Trivia actions from the query's result rows (results.bindings).
static func actions(rows: Array) -> Array:
	var lines := []
	var twins := 0
	for row in rows:
		var city := _value(row, "cityLabel")
		if city == "":
			continue
		var born := _value(row, "inception")
		var year := born.trim_prefix("-").get_slice("-", 0)
		if year.is_valid_int():
			_add(lines, "Learn that %s was founded in %s" % [city, ("%d BC" if born.begins_with("-") else "%d") % int(year)])
		if _value(row, "pop").is_valid_float():
			_add(lines, "Read that about %s people live in %s" % [_round(int(float(_value(row, "pop")))), city])
		if _value(row, "elev").is_valid_float():
			_add(lines, "Notice %s sits %d m above the sea" % [city, roundi(float(_value(row, "elev")))])
		var twin := _value(row, "twinLabel")
		var line := "Find a signpost to %s's twin town %s" % [city, twin]
		if twin != "" and twins < MAX_TWINS and not lines.has(line):
			lines.append(line)
			twins += 1
		if _value(row, "namedLabel") != "":
			_add(lines, "Learn that %s is named after %s" % [city, _value(row, "namedLabel")])
		if _value(row, "capLabel") != "":
			_add(lines, "Remember that %s is the capital of %s" % [city, _value(row, "capLabel")])
	return lines.map(func(l): return {"name": l, "min": 5, "fx": FX.duplicate()})


static func _add(lines: Array, line: String) -> void:
	if not lines.has(line):
		lines.append(line)


## A field's value, or "" when missing or only a bare Q-id (no English label).
static func _value(row: Dictionary, key: String) -> String:
	var v: String = row.get(key, {}).get("value", "")
	if v.begins_with("Q") and v.substr(1).is_valid_int():
		return ""
	return v


## A population rounded to three significant figures, with thousands commas.
static func _round(n: int) -> String:
	var digits := str(n).length()
	var step := int(pow(10, maxi(digits - 3, 0)))
	var s := str(roundi(float(n) / step) * step)
	var out := ""
	for i in s.length():
		if i > 0 and (s.length() - i) % 3 == 0:
			out += ","
		out += s[i]
	return out
