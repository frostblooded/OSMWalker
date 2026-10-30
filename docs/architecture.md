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
| Game | `src/game/` | `game.ts` runs a city: walker, streets, trips, saves, and the catch-up on reopen (`wake()`). `journey.ts` trips, `saveFile.ts` saves and settings, `hud.ts` what the screens show. |
| Streets | `src/streets/` | The Web Worker that fetches, decodes and caches street tiles (`source.ts`), and `loader.ts`, which picks which tiles to load next. |
| Network | `src/net/api.ts` | The game's outside services: OpenFreeMap street tiles, Overpass, Photon, Nominatim, OSRM, Wikidata, Nager.Date (public holidays). The map style and map tiles are fetched by `src/map/mapView.ts` and MapLibre itself. |
| Core | `src/core/` | Pure logic with no DOM and no network: walker, route (A*), goal weights, stats, items, trips, history, money in cents, a seedable RNG, and `catchup.ts`, which lives through the time the game was closed without walking the map. |
| Offline | `src/sw/` | The service worker and its cache rules, built on its own. |

## Hidden links

- **Help text.** `public/data/help.txt` holds `{PLACEHOLDERS}`, and `src/ui/help.ts` fills them from core constants. `tests/unit/help.test.ts` fails on a missing or unused value, or on a meter, attribute, slot or screen button with no page.
- **Game data.** `public/data/actions.json`, `flavour.json`, `cities.tsv` and `airports.tsv` are read through `src/app/data.ts`. `tools/` rebuilds `cities.tsv` and runs the POI sweep (`.github/workflows/poi-sweep.yml`).
- **Saves.** Changing a saved field means a repair step in `src/game/saveFile.ts`, because players keep old saves. Public holiday lists sit apart under `HOLIDAYS_KEY` (fetched once per country per year); `src/core/iso2.ts` must keep a two-letter code for every country code in `cities.tsv`, or that country gets no holidays.
- **Catch-up.** The save's `saved_at` is where the catch-up starts; `tests/e2e/mock.ts` (`reopenAfter`) moves it back by editing the stored save, so a change to the save's key or that field breaks it. `catchup.ts` copies the walker's goal odds (`goals.ts`) and the trip rules (`trips.ts`, `game/journey.ts`) instead of calling the walker, so a change to either belongs in both. Its made-up place kinds (`MADE_UP_KINDS`) must keep their own entries in `actions.json` (`tests/unit/catchup.test.ts` checks).
- **Perf budgets.** `tests/perf/budgets.json` sets the CI limits (transfer, JS size, first paint, long tasks). A new dependency or eager import usually shows up there first.
- **Layout.** `tests/e2e/layout.spec.ts` opens every screen at 360 and 412 px and fails on overlap or sideways scroll. A new screen or sheet needs a step there. CI keeps the shots as the `screens` artifact.

## Tests

- `tests/unit/`: a file per module with logic worth testing alone (`walker.test.ts`, `help.test.ts`...); small or UI-only modules are covered through integration and e2e.
- `tests/integration/`: `game.test.ts` (game + walker + streets on fixture tiles) and `scene.test.ts` (scene + a fake map).
- `tests/e2e/`: Playwright on a Pixel 7 profile with mocked services (`mock.ts`). `live.spec.ts` plays the deployed site after each deploy.
