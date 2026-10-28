"""Builds data/cities.tsv from Natural Earth's populated places (public domain).

Usage: python3 tools/make_cities.py ne_10m_populated_places_simple.geojson
Source: https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_10m_populated_places_simple.geojson
"""
import json
import sys

rows = []
for f in json.load(open(sys.argv[1], encoding="utf-8"))["features"]:
    p = f["properties"]
    pop = int(p["pop_max"] or 0)
    if pop <= 0:
        continue
    name = p["name"].replace("\t", " ")
    rows.append((p["adm0_a3"], p["adm0name"], name, round(p["latitude"], 4), round(p["longitude"], 4), pop))
rows.sort()
with open("data/cities.tsv", "w", encoding="utf-8", newline="\n") as out:
    out.write("# name\tcountry code\tcountry\tlat\tlon\tpopulation. Natural Earth, public domain.\n")
    for code, country, name, lat, lon, pop in rows:
        out.write(f"{name}\t{code}\t{country}\t{lat}\t{lon}\t{pop}\n")
print(len(rows), "cities")
