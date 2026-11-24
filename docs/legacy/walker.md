# How he moves: walker and routing

Files at `a87edab`: `src/core/walker.ts`, `src/core/route.ts`,
`src/core/geo.ts`, `src/core/rng.ts`. Tests: `tests/unit/walker.test.ts`,
`route.test.ts`, `geo.test.ts`.

## State

He is always on an edge of the street graph:

- `fromNode`: the corner he left; `toNode`: the corner he rides to (`null`
  while he stands at `fromNode`, waiting for data or for a decision);
  `prevNode`: the corner before, so wandering doesn't turn straight back.
- `progressM`: metres from `fromNode` towards `toNode`. His position is a
  straight lerp of the two corners' lat/lon by `progressM / edgeLength`.
- `goal` (lat/lon or null), `goalNode` (the corner the goal snapped to once
  its streets loaded), `route` (corners still to ride after `fromNode`),
  `routeArrives` (the route really ends at the goal, not at the edge of the
  loaded map), `place` (the place of note he heads for).
- `tripM` and `tripStartM`: metres ridden since the goal was set, and the
  straight line to it then; for giving up.
- `totalM`: everything ever ridden. `speedMps`: set by the game from upgrades.

## `advance(seconds)`

Turns seconds into metres (`seconds * speedMps`) and spends them corner by
corner:

1. No `toNode`? If `fromNode`'s cells aren't all loaded, return the unused
   seconds: he stands still (the screen shows "Loading streets…"). If the
   corner has no streets at all (removed from OSM), hop to the nearest node
   with streets and log a problem.
2. With no goal, fire `events.idle()` first; the game may give him a goal
   right there. Then pick the next corner: `nextStep()` toward the goal, or
   `wander()`.
3. Ride along the edge. Reaching `toNode` makes it `fromNode`; if the route
   was arriving and is now empty, `arrive()`.

So a whole tick of movement can cross many corners, and the leftover
seconds are only lost while streets load.

## Wandering

`wander()`: a uniformly random neighbour, excluding `prevNode`; back the way
he came only at a dead end. The RNG is a seedable mulberry32 (`rng.ts`) so
tests replay exact walks.

## Heading to a goal

`nextStep()`:

1. If the planned route's next corner is a neighbour of here, take it.
2. If `tripM > 2.5 * tripStartM + 2000`, give up: log a problem, drop the
   goal. The game hears `idle` next turn and cancels the order.
3. If the route was arriving and is used up, `arrive()`.
4. Otherwise `plan()` again and take the first step (or arrive if the plan is
   empty, meaning he is already as close as the streets allow).

`plan()`: once every cell within 30 m of the goal is loaded, snap the goal to
the nearest corner (`goalNode`) and move the goal there. Then run A*.

## A* over a half-loaded map (`route.ts`)

`planRoute(graph, from, goal, goalNode, arriveM)`:

- Cost: edge length in metres (haversine). Heuristic: straight-line metres to
  the goal. A small binary heap on parallel arrays.
- Stop with `arrives = true` at `goalNode` or any node within `arriveM`.
- **A corner whose cells aren't loaded yet is a frontier**: the search ends
  there (`arrives = false`) and the route goes to the edge of the known map.
  When he reaches it, more streets have usually loaded (cells toward the goal
  load first), and he plans again. This is why he never waits for the whole
  route to download.
- Capped at 40,000 expanded nodes to keep a frame short; with nothing better
  it routes to the corner closest to the goal found so far.

The route line on the map (`routeLine()`) is solid along planned streets and
dashed in a straight line for the part past the loaded map.
`walkLeftM()` sums the rest of this edge, the route, and the straight line
from the route's end, for the "~8 min" on the top card.

## Arriving

`arrive()` drops the goal and fires `events.arrived(place)`. The game decides
what that means (pick-up or delivery) and may give a new goal at once.

## Saving the walker

`toJSON` saves the three corner ids **and their coordinates**, so after a
reload he can be drawn and keep riding along the current edge before the map
has loaded again. `fromJSON` restores them into an empty graph. Old saves
from the trip era (`travel`, `flight` fields) are put where the ride was
headed, on a fake node `LONE_NODE = Number.MAX_SAFE_INTEGER`, until streets
there load.

## Geo helpers (`geo.ts`)

- Haversine `distanceM` with Earth radius 6,371,008.8 m.
- Web Mercator `lonToPx`/`latToPx`/`pxToLon`/`pxToLat` at 256 px tiles
  (latitude clamped to ±85.0511).
- `tileOf`, `tileBbox`, `bboxAround(lat, lon, radiusM)`.
- `offsetM` / `moved`: flat-earth metres east/north, fine within a city.
- Box order everywhere: `[south, west, north, east]`; points `[lat, lon]`.

## Earlier walker designs (for reference)

- **Random spots** (PR #10): walk to random points in the city box.
- **Places of note** (PR #13 on): pick a POI weighted by importance (rank),
  a medium walking distance, lying ahead along his last leg, less if visited
  lately; stay a minute; with needs (hunger, thirst, energy...) an urgent need
  only allowed places that fix it. `src/core/goals.ts` at `2d468a4`.
- **Three cards** (PR #144): the player picked the next place from 3 cards
  (close / far / different kind, no recent repeats), and he waited for the
  pick. Replaced by the delivery loop in PR #152.
