# Street data: from OSM to a walkable graph

Files at `a87edab`: `src/core/ofm.ts` (tile decoding, 367 lines),
`src/core/graph.ts` (cells and the graph), `src/streets/*` (worker, cache,
loader), `src/net/api.ts` (fetching). Tests: `tests/unit/ofm.test.ts`,
`graph.test.ts`, `streets.test.ts`, `idb.test.ts`, with two real tiles in
`tests/fixtures/ofm/14_9253_6039.pbf` and `14_9254_6039.pbf` (Sofia, side by
side, so tests could check that streets join across a tile edge).

## History of the data source

1. **Overpass API** first (Godot, PR #2). Per-area queries for walkable
   `highway` ways. The public servers are often busy (HTTP 429/504), so PR #8
   added three servers tried in turn, with a 60 s rest for a server that just
   failed.
2. **OpenFreeMap vector tiles** from PR #9 (2026-10-27) on, Overpass kept as
   backup. Free, no API key, served from a CDN, cacheable by URL, and the
   same tiles also hold POIs and house numbers. This is what the last
   version used.

## Cells

The world is cut into fixed **cells, one per z14 slippy-map tile** (about
1.8 × 2.4 km at 42°N). Fixed cells mean downloads never overlap, can be
cached by name and simply add up in the graph.

- `cellOf(lat, lon)` = the z14 tile containing the point.
- `cellKey(tile) = x * 2^14 + y`, a single number.
- **Ring**: the game keeps the 3 × 3 cells around him loaded
  (`STREET_RING = 1`).
- **Priority** (`cellsByPriority`): his own cell first, then by distance from
  him to the cell centre, minus half the component along his heading, so
  cells in the direction he rides load first. The heading is towards his
  goal, or his next corner while wandering.

## Fetching a tile

```
GET https://tiles.openfreemap.org/planet           -> TileJSON
    .tiles[0] is a template like https://tiles.openfreemap.org/planet/20251203_001001_pt/{z}/{x}/{y}.pbf
GET <template with z=14, x, y>                      -> Mapbox Vector Tile (protobuf), sometimes gzipped
```

The TileJSON is fetched once and shared by every load that starts at the same
time; its URL names the current planet build, so tile URLs never go stale
(good for caching). If the body starts with `1f 8b` it is gunzipped first
(`DecompressionStream`). Timeout 20 s.

The tile uses the **OpenMapTiles schema**. Layers read: `transportation`,
`transportation_name`, `poi`, `housenumber`. Field notes from the sweep of 8
cities are in the project files (`poi/openfreemap-poi-fields.md`,
`poi/poi-sweep-8-cities.md`).

## Decoding: tile → cell (`ofm.ts`)

Decoding used `pbf` + `@mapbox/vector-tile` (in Rust the equivalent would be
a crate like `mvt-reader` / `geozero` / `prost` on the MVT proto). Every
geometry was flattened to `[x0, y0, x1, y1, ...]` in tile units.

### Units and node ids

- Positions are rescaled to **4096 units per z14 tile** (`UNITS`), which are
  exactly pixels at zoom 18 (`UNIT_ZOOM`): `lat = pxToLat(tile.y*4096 + y, 18)`.
- Tiles carry **no OSM node ids**, so a node's id is its **grid position**:
  `id = gx * 2^26 + gy` with `gx = tile.x*4096 + round(x)`. The same point gets
  the same id in every tile, which is what lets cells join. Ids stay below
  2^52, safe as JS numbers (and as `u64`/`i64`).
- Overpass node ids were **negated** so they never clash with grid ids.

### Which lines are streets

`transportation` features whose `class` is one of
`primary, secondary, tertiary, minor, service, track, path`, except
`subclass` `platform` or `corridor`. Motorways/trunks are left out.

### Clipping at the tile edge

Tiles include a buffer past their edge. Each segment is clipped to the
0..4096 square (Liang-Barsky, `clip`). A **cut point** is snapped onto the
edge and its position along the edge rounded to 4 units (~2 m, `SNAP`), so
the left tile's cut and the right tile's cut of the same street land on the
**same id** and the graph is continuous across tiles.

### Street names

Names live in the separate `transportation_name` layer, with simplified
geometry. Every segment of every named line is keyed by its two end ids
(`segKey`), and each street segment looks up its name there. A line becomes
one way per run of segments with the same name.

### Joining crossings (PR #150) and junctions

Vector tiles **drop the shared node where two streets cross without
bending**, so without help the graph has streets that cross but don't
connect, and he could never turn there. Two passes fix it:

- `joinCrossings` (ground-level streets only): a uniform grid of 64-unit
  squares buckets every segment's box (widened by 1.5 units, `JOIN_TOL`
  ~0.6 m). Each pair of segments is tested once, in the grid square where
  their boxes' overlap starts. If a corner of one lies on the other, that
  segment is split at the corner; if they properly cross, a **new node** is
  made at the crossing and both are split there.
- `joinJunctions` (everything, after): a dead end (node of degree 1) lying
  within 1.5 units of another segment is joined onto it (the segment split
  at its foot; next to an end it just links to that end).

**Bridges and tunnels** (`brunnel` set, or a `layer` tag) are kept out of
`joinCrossings` so a bridge never connects to the street under it; fords
count as ground.

### Places, bridges and doors

- **Places of note**: named `poi` points inside the tile (the neighbour tile
  owns points in the buffer), except bus/tram stops, subway and train station
  entrances and platforms. Kept: name, class, subclass, rank, lat, lon.
- **Bridges** are places too (class `bridge`, rank 10): one per walkable
  bridge line, named after the street that most of its points share in the
  name layer ("Bridge on X", or the name itself if it already says bridge in
  one of several languages, or "Footbridge" for an unnamed path). A bridge
  crossing several tiles is placed only in the tile it doesn't enter from the
  left/top, so it isn't counted twice.
- **Doors**: `housenumber` points inside the tile. The layer has no street
  name, so the street is taken later from the nearest graph corner
  (`StreetGraph.streetAt`) when an order picks the door.

### The cell format

```ts
type Cell = { ids: Float64Array; coords: Float64Array; ways: { name: string; ids: number[] }[];
              places: Place[]; homes?: Home[] };
```

Flat typed arrays so the worker can hand them to the page without copying
(transferable buffers).

## The graph (`graph.ts`)

`StreetGraph` holds `nodes: id → [lat, lon]`, `adjacency: id → (neighbour →
street name)`, the set of loaded cells, and places and homes per cell.

- `addCell` adds nodes, links each consecutive pair of a way both ways (a
  named link wins over an unnamed one), and marks the cell loaded.
- `isComplete(id)`: true when every cell the node touches is loaded (checked
  by nudging ±1e-7° in four directions), because a node on a cell edge only
  knows all its links once both sides are in.
- `covers(lat, lon, m)`: every cell within m of the point is loaded.
- `nearestNode`: linear scan over nodes that have links (fast enough).
- `placesIn(box)`, `homesIn(box)`: linear scans of the loaded cells.

## Overpass fallback (`compactCells`)

If the tile fails (or the tile server is resting after a failure), the cell's
box goes to Overpass:

```
[out:json][timeout:25];
way["highway"~"^(primary|secondary|tertiary|unclassified|residential|living_street|pedestrian|footway|path|service|track|steps|cycleway)$"](s,w,n,e);
out body;node(w);out skel qt;
```

`compactCells` gives each cell every way that has a node inside it, with all
that way's nodes, so the links of every node in the cell are complete.
Overpass gives no POIs here. A 200 answer with a `remark` containing "error"
means the query died half way and is treated as a failure.

## The worker, the cache and the loader

- **Worker** (`streets/worker.ts`): fetching and decoding run in a Web
  Worker so a big tile (real ones are up to ~750 KB) never costs a frame.
  The page sends `{id, tile, opts}` and gets `{id, result, net, ms}` back.
  In a native Rust app this is just a background thread or async task.
- **Cache** (`streets/source.ts`, `idb.ts`): IndexedDB, key
  `v4_14_<x>_<y>` (`CACHE_VERSION` bumps whenever the cell format or ids
  change). Order: cache, then tile, then Overpass. Entries older than 30 days
  are used at once and refetched in the background ("stale"); at most 400
  cells kept, pruned every 50 writes through an index on the save time.
- **Loader** (`streets/loader.ts`): every tick the game asks for the cells it
  wants, most urgent first. At most 3 loads in flight, one slot always free
  for his own cell. A failed cell waits 15 s before a retry. Stale cells are
  refreshed only when nothing else waits (only their places change). Loads
  that land after the graph was replaced (new city, fresh map) are dropped.
- **Fresh map** (PR #149): past 25 cells (~2.4 MB each in memory) the game
  rebuilds the walker on an empty graph from its own save and the 9 cells
  around him reload, mostly from cache. Memory stays flat on long rides.

## Pitfalls we hit

- Streets that cross with no shared node (fixed by `joinCrossings`).
- Side streets ending on the middle of another street (`joinJunctions`).
- Edge cuts that didn't meet because of rounding (snapping to 4 units).
- A node with no streets after an OSM edit: the walker hops to the nearest
  street and logs a problem.
- Overpass 200 answers that are incomplete (the `remark` check).
- The decoder pulled into startup JS on the web; it had to stay in the
  worker (a test read `net/api.ts` and failed if it called `fromPbf`).
