"""Builds public/data/placedex.json, the Placedex rarity of each place kind,
from a POI sweep report (the "POI sweep" workflow's markdown).

A kind's rarity comes from how many of it the sweep found in its 8 cities:
1000 or more Common, 100 or more Uncommon, 10 or more Rare, fewer Legendary.
Kinds the sweep never saw are left out; the game counts them Legendary.

Usage: python3 tools/make_placedex.py poi-sweep-8-cities.md
"""
import json
import re
import sys
from pathlib import Path

# The game skips these as goals; copies src/core/ofm.ts NOT_A_PLACE_SUBCLASS.
SKIPPED = {"bus_stop", "tram_stop", "subway_entrance", "train_station_entrance", "platform"}
# Copied by DEX_BANDS in src/core/keepsakes.ts, which Help shows.
BANDS = [(1000, "C"), (100, "U"), (10, "R")]


def main(report: str) -> None:
    out = {}
    for line in Path(report).read_text(encoding="utf8").splitlines():
        m = re.match(r"^\| ([^|]+/[^|]*) \| (\d+) \|", line)
        if not m or m.group(1).split("/", 1)[1] in SKIPPED:
            continue
        count = int(m.group(2))
        out[m.group(1)] = next((r for lo, r in BANDS if count >= lo), "L")
    dest = Path(__file__).resolve().parent.parent / "public" / "data" / "placedex.json"
    dest.write_text(json.dumps(dict(sorted(out.items())), ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")
    print(f"{len(out)} kinds -> {dest}")


if __name__ == "__main__":
    main(sys.argv[1])
