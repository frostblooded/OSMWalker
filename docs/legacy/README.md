# OSM Walker, the TypeScript version: how it was built

On 2026-11-24 the game was cleared out of this repo so it can be built again
from scratch in Rust, by hand. These pages record what the old version did and
how, so that a question like "how did we load the streets?" or "what were the
order numbers?" can be answered without digging through old code.

The old code is not gone. It lives in git history:

- **Last TypeScript version:** commit `a87edab` (master after PR #154,
  2026-11-24). Every file path in these pages is a path at that commit.
  Read one with `git show a87edab:src/core/walker.ts`, list them with
  `git ls-tree -r --name-only a87edab`, or check the whole tree out
  somewhere else with `git worktree add ../osmwalker-ts a87edab`.
- **The big version, before the refocus cut most features:** commit
  `2d468a4` (master just before PR #142, 2026-11-08). The features listed in
  [feature-history.md](feature-history.md#catalog-of-every-source-file-before-the-refocus)
  under "Catalog of every source file before the refocus" (rows marked "cut")
  live there.
- **The Godot version:** anything before PR #35 (2026-10-28), for example
  `git log --oneline a87edab | grep '#3[0-4]'`.

## Pages

| Page | What it covers |
| --- | --- |
| [game-design.md](game-design.md) | The game as it last played: the delivery loop, every number, the design rules and why they exist. |
| [streets.md](streets.md) | Getting OSM street data: OpenFreeMap vector tiles, decoding them into a walkable graph, joining crossings, cells, the cache, the loader, Overpass as backup. |
| [walker.md](walker.md) | How he moves: the street graph, wandering, A* routing over a half-loaded map, arriving, giving up. |
| [orders-and-economy.md](orders-and-economy.md) | Orders, pay, the wait, upgrades, prices, and the economy simulation that tuned them. |
| [game-loop-and-saves.md](game-loop-and-saves.md) | The tick, time stopping while closed, saving, repairing old saves, settings. |
| [map-and-camera.md](map-and-camera.md) | Drawing the map (MapLibre + OpenFreeMap Liberty), his marker, the camera, the adaptive tick rate. |
| [ui.md](ui.md) | Screens, sheets, the in-game Help system, the look. Detailed rules: [ui-guidelines.md](ui-guidelines.md). |
| [network.md](network.md) | Every outside service it used, with URLs, fallbacks and failure handling. |
| [performance.md](performance.md) | Budgets, what was measured, and the tricks that kept it fast; the Godot-vs-web numbers. |
| [testing-and-workflow.md](testing-and-workflow.md) | Unit / integration / e2e layout, fixtures and fakes, the local check scripts, the review step. |
| [feature-history.md](feature-history.md) | Every PR in order, and a catalog of the ~90 systems that were built and later cut, with where to find them. |
| [architecture.md](architecture.md) | The old architecture map, as it was at `a87edab` (layers and hidden links between files). |
| [ui-guidelines.md](ui-guidelines.md) | The old UI rules, as they were at `a87edab`. |

`docs/design-research.md` (one folder up) is the game design research report
the design rules came from; it is not tied to any language and stays current.

## The shape of it in one paragraph

A Preact page with a MapLibre map. A pure `core/` layer (no DOM, no network)
holds the walker, routing, orders, upgrades, money and history, so all of it
was unit-tested with a seeded RNG. A Web Worker fetched OpenFreeMap z14
vector tiles, decoded them into street "cells" (one tile each) and cached them
in IndexedDB; the game added cells to one street graph as he neared them. The
game ticked 2 to 10 times a second only while the page was visible (time
stops when closed), saved to localStorage every 5 s, and a service worker
made it open offline. Checks ran locally (`npm run verify`), and GitHub
Actions only deployed to GitHub Pages.
