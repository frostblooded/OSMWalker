"""Writes the sheet's icons to assets/icons/<key>.svg from game-icons.net.

Icons by Lorc, Delapouite and contributors at https://game-icons.net,
CC BY 3.0. Source: the @iconify-json/game-icons npm package.
Usage: python3 tools/make_icons.py path/to/icons.json
They are white so the game can tint them.
"""
import json
import pathlib
import sys

ICONS = {
    # meters
    "health": "hearts", "energy": "lightning-helix", "fullness": "roast-chicken",
    "mood": "sun", "hygiene": "soap", "thirst": "water-drop",
    # attributes
    "str": "biceps", "cha": "lips", "wit": "brain", "luck": "clover", "speed": "running-shoe",
    # gear slots
    "weapon": "broadsword", "offhand": "shield", "head": "visored-helm", "body": "chain-mail",
    "feet": "boots", "bag": "knapsack", "trinket": "gem-pendant",
    # headings and badges
    "level": "laurels", "xp": "star-formation", "coins": "two-coins", "vitals": "heart-beats",
    "attrs": "skills", "gear": "battle-gear", "items": "swap-bag", "buff": "sparkles",
    "debuff": "poison-bottle", "close": "cancel", "time": "hourglass",
}

src = json.load(open(sys.argv[1]))
out = pathlib.Path(__file__).resolve().parent.parent / "assets" / "icons"
out.mkdir(parents=True, exist_ok=True)
for key, name in ICONS.items():
    body = src["icons"][name]["body"].replace("currentColor", "#ffffff")
    (out / f"{key}.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 512 512">{body}</svg>\n')
print(len(ICONS), "icons in", out)
