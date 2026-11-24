# Performance

"Performance first" was a standing project rule from 2026-10-28: loading,
startup, frame rate, memory and network on phones, measured on every change
with before/after numbers in the PR.

## Why the game left Godot (2026-10-28)

Measured in the cloud container (headless Chromium, mocked servers, gzip
like GitHub Pages; no GPU, so no frame rates). Research notes and scripts are
in the project files under `perf/` (`research-godot.md`,
`research-webmap.md`, `research-wasm.md`, `game.mjs`, `bench.mjs`).

| | Godot 4.7 web export | TypeScript |
| --- | --- | --- |
| Engine download | `index.wasm` 39.5 MB raw, 10.1 MB gzip (Pages has no brotli) | MapLibre ~440 KB gzip, the game's own JS tens of KB |
| City picker visible | 3.1–3.9 s desktop; 8.5–10.5 s at 4× CPU; 20 s on 4G + 4× CPU; 61 s on slow 4G | first paint ~140–200 ms in the perf check |
| Main thread, idle scene | 93–100% busy even for an empty scene (no-threads web build busy-spins) | Canvas2D test scene 6%, PixiJS 3% |
| Decode one street tile (89 KB) | GDScript 58 ms, + graph 181 ms (955 ms at 4× CPU) | JS pbf + vector-tile 9 ms (29 ms at 4×) |

Other sizes compared then (gzip): Leaflet 43 KB, PixiJS 160–240 KB,
macroquad 125 KB (brotli), a hand-trimmed Godot ~3.7–4 MB.

For a native Rust app most of this is moot (no download, real threads), but
the lessons hold: decode off the main thread, don't redraw what didn't
change, keep the tick rate low.

## Budgets the TS version kept (`tests/perf/budgets.json`)

Profile: 4G (9 Mbps, 85 ms) + 4× CPU throttle, median of 3 cold loads.

| Measure | Budget | Last measured (PR #145) |
| --- | --- | --- |
| Transfer to ready | 500 KB | 79 KB |
| First paint | 1000 ms | 160 ms |
| Ready (first game frame) | 2000 ms | 304 ms |
| Main thread busy | 15% | well under |
| Long tasks after ready | 0 | 0 |
| JS heap after 10 s of play | 20 MB | under |
| DOM nodes in play | 400 | under |

A startup JS size budget existed (60, then 64 KB) and was dropped by the user
on 2026-10-30, but small startup was still preferred.

## Tricks that mattered

- **Streets in a worker**, transferring typed arrays back without copying.
- **IndexedDB street cache** (400 cells, 30-day refresh), service worker
  cache for app files and map tiles (3000 entries): repeat starts used no
  network and worked offline.
- **Adaptive tick rate** 2–10 Hz from his on-screen speed, with a CSS
  transition gliding him between ticks; no `requestAnimationFrame` loop.
- **Camera dead zone**: the map redraws only when he leaves the middle 20%.
- **No 3D buildings**, `pixelRatio` capped at 2, no fade animations.
- Map layers re-sent only when a key changes; map size read only on resize.
- Screen texts re-render at most 4 Hz.
- **Fresh map past 25 cells** keeps memory flat on long rides.
- A* capped at 40,000 nodes per search.
- Lazy chunks for MapLibre and Help; fonts as Latin subsets with swap; the
  boot screen styled inline in `index.html`.
- Performance marks `osmwalker:ready` and `osmwalker:map` for the perf
  script.
