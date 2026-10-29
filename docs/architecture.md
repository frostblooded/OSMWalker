# Architecture map

Where things live, and the links between files that no import shows. Every
source file opens with a comment saying what it does; read that before the
code.

## Layers

Imports only point down this list (`src/sw/` imports nothing).

| Layer | Folder | What it holds |
| --- | --- | --- |
| Screens | `src/ui/` | Preact screens and sheets. `kit.tsx` + `app.css` are the UI kit (see `docs/ui-guidelines.md`). `help.ts` fills Help text with numbers from `src/core`. |
| App | `src/app/` | `loop.ts` ticks the game while the page is visible. `data.ts` fetches `public/data/` once. |
| Map | `src/map/` | `scene.ts` decides what the map shows and where the camera points. `mapView.ts` is the only file that talks to MapLibre. |
| Game | `src/game/` | `game.ts` runs a city: walker, streets, trips, saves. `journey.ts` trips, `saveFile.ts` saves and settings, `hud.ts` what the screens show. |
| Streets | `src/streets/` | The Web Worker that fetches, decodes and caches street tiles (`source.ts`), and `loader.ts`, which picks which tiles to load next. |
| Network | `src/net/api.ts` | Every outside service: OpenFreeMap, Overpass, Photon, Nominatim, OSRM, Wikidata. |
| Core | `src/core/` | Pure logic with no DOM and no network: walker, route (A*), goal weights, stats, items, trips, history, money in cents, a seedable RNG. |
| Offline | `src/sw/` | The service worker and its cache rules, built on its own. |

## Hidden links

- **Help text.** `public/data/help.txt` holds `{PLACEHOLDERS}`, and `src/ui/help.ts` fills them from core constants. `tests/unit/help.test.ts` fails on a missing or unused value, or on a meter, attribute, slot or screen button with no page.
- **Game data.** `public/data/actions.json`, `flavour.json`, `cities.tsv` and `airports.tsv` are read through `src/app/data.ts`. `tools/` rebuilds `cities.tsv` and runs the POI sweep (`.github/workflows/poi-sweep.yml`).
- **Saves.** Changing a saved field means a repair step in `src/game/saveFile.ts`, because players keep old saves.
- **Perf budgets.** `tests/perf/budgets.json` sets the CI limits (transfer, JS size, first paint, long tasks). A new dependency or eager import usually shows up there first.
- **Layout.** `tests/e2e/layout.spec.ts` opens every screen at 360 and 412 px and fails on overlap or sideways scroll. A new screen or sheet needs a step there. CI keeps the shots as the `screens` artifact.

## Tests

- `tests/unit/`: one file per core or ui module.
- `tests/integration/`: `game.test.ts` (game + walker + streets on fixture tiles) and `scene.test.ts` (scene + a fake map).
- `tests/e2e/`: Playwright on a Pixel 7 profile with mocked services (`mock.ts`). `live.spec.ts` plays the deployed site after each deploy.
