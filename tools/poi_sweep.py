"""Counts every POI class/subclass in OpenFreeMap tiles around some big
cities, with example names, and marks the ones public/data/actions.json has no
actions for yet. Run by .github/workflows/poi-sweep.yml (the sandbox the
game is built in can't reach the tile host).

Usage: python3 tools/poi_sweep.py [out.tsv]   (needs: pip install mapbox-vector-tile)
Prints a Markdown report; writes the full table as TSV.
"""
import collections
import json
import math
import sys
import urllib.request

import mapbox_vector_tile

TILEJSON = "https://tiles.openfreemap.org/planet"
ZOOM = 14
RING = 1  # 3 x 3 tiles around each center
CITIES = {
    "Sofia": (42.6977, 23.3219), "Paris": (48.8566, 2.3522), "London": (51.5074, -0.1278),
    "Berlin": (52.52, 13.405), "Rome": (41.9028, 12.4964), "Istanbul": (41.0082, 28.9784),
    "New York": (40.7128, -74.006), "Tokyo": (35.6762, 139.6503),
}
AGENT = "OSMWalker poi sweep (https://github.com/frostblooded/OSMWalker)"


def tile_of(lat, lon, z):
    n = 2 ** z
    r = math.radians(lat)
    return int((lon + 180) / 360 * n), int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * n)


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": AGENT})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def actions_for(key, actions):
    """Which actions.json entry a class/subclass would use."""
    cls = key.split("/")[0]
    if key in actions:
        return key
    if cls in actions:
        return cls
    return ""


def tally(features, counts, examples, city):
    for f in features:
        p = f["properties"]
        name = p.get("name")
        if not name:
            continue
        key = "%s/%s" % (p.get("class", ""), p.get("subclass", ""))
        counts[key] += 1
        if len(examples[key]) < 10 and name not in examples[key]:
            examples[key].append("%s (%s)" % (name, city))


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "poi_tags.tsv"
    url = json.loads(get(TILEJSON))["tiles"][0]
    actions = json.load(open("public/data/actions.json", encoding="utf-8"))
    counts = collections.Counter()
    examples = collections.defaultdict(list)
    for city, (lat, lon) in CITIES.items():
        cx, cy = tile_of(lat, lon, ZOOM)
        for dx in range(-RING, RING + 1):
            for dy in range(-RING, RING + 1):
                t = url.replace("{z}", str(ZOOM)).replace("{x}", str(cx + dx)).replace("{y}", str(cy + dy))
                layers = mapbox_vector_tile.decode(get(t))
                tally(layers.get("poi", {}).get("features", []), counts, examples, city)
    rows = sorted(counts.items(), key=lambda kv: -kv[1])
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write("class/subclass\tcount\tactions\texamples\n")
        for key, n in rows:
            f.write("%s\t%d\t%s\t%s\n" % (key, n, actions_for(key, actions) or "-", "; ".join(examples[key])))
    missing = [(k, n) for k, n in rows if not actions_for(k, actions)]
    print("## POI tags in %d cities (%d named places, %d tags)\n" % (len(CITIES), sum(counts.values()), len(rows)))
    print("%d tags (%d places) have no actions yet and use the generic ones.\n" % (len(missing), sum(n for _, n in missing)))
    print("| class/subclass | count | actions | examples |\n| --- | --- | --- | --- |")
    for key, n in rows:
        print("| %s | %d | %s | %s |" % (key, n, actions_for(key, actions) or "**none**", "; ".join(examples[key][:5])))


if __name__ == "__main__":
    main()
