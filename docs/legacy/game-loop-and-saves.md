# The game loop, time and saves

Files at `a87edab`: `src/game/game.ts`, `src/game/saveFile.ts`,
`src/game/hud.ts`, `src/app/loop.ts`, `src/core/history.ts`,
`src/core/problems.ts`, `src/core/debugLog.ts`. Tests:
`tests/integration/game.test.ts` (game + walker + streets on the fixture
tiles, harness in `tests/support/game.ts`), `tests/unit/saveFile.test.ts`,
`loop.test.ts`, `history.test.ts`.

## Layers

`Game` has no DOM: the app calls `step(dt)` and screens read its state.
`hud(game)` turns the state into plain data for the screens (city, street,
goal distance, walk left, speed, order, "waiting" reason, wait share and
seconds left), so screen numbers are unit-tested without a browser.

## Starting a city

`startCity(name, lat, lon, bbox)`:

1. New walker on a new graph; the loader starts on the 9 cells around the
   point. Poll every 50 ms until **his own cell** is in, showing its state on
   the picker ("Finding streets in Sofia… (loading)", "download failed, retry
   in 12 s", ...). If his cell fails, return "Couldn't load streets. Check your
   connection and try again."
2. Put him on the nearest corner with streets; no corner → "No walkable
   streets there. Try another place."
3. City box = `cityBounds` (search result box clamped to 1.5–25 km radius).
4. Fresh `Stats`, debug log and `Job` (full 60 s wait), History "Set off on his
   bike in Sofia", save.

## The tick (`app/loop.ts`)

- A `setTimeout` chain, not `requestAnimationFrame`, running **only while the
  page is visible** (`visibilitychange` pauses and saves; `pagehide` saves).
- Each tick: `dt` = real seconds since the last; `game.step(dt)`;
  `scene.draw(dt, nextMs)`.
- **Adaptive rate**: the next tick comes after `1000 / hz` ms with
  `hz = clamp(pxPerSec / 4, 2, 10)`, where `pxPerSec` is how fast he moves on
  screen (smoothed 0.7/0.3). So each step is at most ~4 screen px, and between
  ticks his marker **glides with a CSS transition** of exactly that length.
  Slow on screen (zoomed out) → 2 Hz; fast → 10 Hz. The main thread is idle
  most of the time, which saves battery.
- Screen texts re-render at most 4 times a second (`UI_HZ`), plus on game
  events (`game.subscribe`).

## `Game.step(dt)`

1. Ask the loader for the cells around him, ordered toward his goal.
2. `s = min(dt, 1)`: **a step never counts for more than 1 s**, so a stall
   or a hidden tab never jumps him ahead.
3. `walker.advance(s)`. If he moved: extend the trail; run down the order
   wait; at 0, `newOrder()`.
4. Count down the 💶 pop.
5. Once a second: city checks (warn once per city if 3+ cells are loaded and
   the city box has no places of note) and the fresh-map check (past 25
   cells, rebuild on an empty graph from his own save).
6. Every 5 s: save.

## Time while closed

**Time stops.** Nothing runs while the page is hidden or closed, and nothing
is computed on reopen: he continues from exactly where he was. Earlier
versions caught up on reopen (PR #2, removed in #12), then ran a full
catch-up simulation (PR #42), and then a 10× speed
"boost" for as long as you were away (PR #136); both were dropped on
2026-11-08 for simplicity.

## Saves

`localStorage`, key `osmwalker.save`, JSON:

```jsonc
{
  "city": "Sofia, Bulgaria",
  "origin": [42.687, 23.319],
  "zoom": 17,
  "walker": {                      // see walker.md
    "prev": 1234, "from": 5678, "to": 91011,
    "prev_pos": [lat, lon], "from_pos": [lat, lon], "to_pos": [lat, lon],
    "progress_m": 12.3, "total_m": 45678.9,
    "bounds": [s, w, n, e],
    "goal": [lat, lon] | null, "goal_node": 123 | null,
    "route": [ids...], "route_arrives": false,
    "trip_m": 0, "trip_start_m": 0,
    "place": { "name", "class", "subclass", "rank", "lat", "lon" } | null
  },
  "stats": {
    "economy": 2, "cents": 4567, "deliveries": 123,
    "history": { "entries": [{ "text", "t", "at": [lat, lon], "ti" }], "trail": [[lat, lon] | null, ...], "dropped": 0, "here": [lat, lon] },
    "visited": ["Pizza Roma@42.6871,23.3190", ...],
    "upgrades": { "speed": 14, "orders": 3 }
  },
  "debug_log": [{ "t", "order": true, "from", "to", "cents", "pickup_m", "drop_m", "food", "doors", "street_doors"?, "forced"? }, { "t", "delivered": true, "to", "cents" }, { "t", "cancelled": true, "at" }],
  "job": { "order": { "from": Place, "to": { "street", "number", "lat", "lon" }, "cents", "dropM", "picked" } | null, "wait_left_s": 37.5, "wait_s": 60 }
}
```

Rules that kept old saves loading:

- Stored keys never change meaning; unknown extra fields are dropped.
- Every `fromJSON` checks types and falls back to defaults (`Job.fromJSON`,
  `Stats.fromJSON`, `Problems.fromJSON`, `isOrder`).
- Older economy → money and upgrades reset, places and History kept.
- Corner coordinates are saved with ids, so he is drawn and can move before
  streets reload.
- A save that can't be read is copied to `osmwalker.save.bad` before the new
  game overwrites it; the problem log says so.
- Keys from removed features (`osmwalker.weather`, `osmwalker.holidays`) are
  deleted on the next write.

**Settings** live apart under `osmwalker.settings` so New city keeps them:
`show_city_area`, `show_route`, `camera_follows` (default on), and the
problem log.

**New city** clears the save, keeps settings.

## History (`core/history.ts`)

- Last 100 entries `{text, t (unix s), at (where), ti (trail index)}`.
- A trail of points ≥ 15 m apart, at most 5000 (~75 km); points older than the
  oldest entry are cut. `null` in the trail marks a jump (breaks the line).
- `markers()`: one numbered marker per spot; consecutive entries within 10 m
  share one ("4-6"). Newest entry is number 1.
- `trailVersion` bumps on change so the map re-sends the line only then.

## Problems and the debug log

- `Problems`: last 20 warnings and 10 errors, each `{text, details, t,
  count}`; the same title repeated right away counts up ("×3"). `unseen`
  drives the red dot on ☰ and Debug. Also printed to the console.
- `DebugLog`: last 50 order events (order / delivered / cancelled) with
  short titles ("🛎 Order: Pizza Roma → Vitosha 12") and detail lines.
- `cityAlerts()`: "Street downloads are failing" (error), "No places of note
  in the city box: no food to pick up", "He is outside the city box"
  (warnings).
