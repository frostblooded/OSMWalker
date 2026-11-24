# The map, his marker and the camera

Files at `a87edab`: `src/map/mapView.ts` (the only file that talked to
MapLibre), `src/map/scene.ts` (what the map shows each tick, behind a
`MapPort` interface so tests used a fake), `src/core/look.ts`,
`src/ui/app.css` (marker styles; copy in
[reference/app.css](reference/app.css)). Tests:
`tests/integration/scene.test.ts`, `tests/unit/mapView.test.ts`, e2e in
`tests/e2e/screens.spec.ts`. Screenshots: [ui.md](ui.md#screenshots).

## The base map

- **MapLibre GL JS 6** with **OpenFreeMap's Liberty style**
  (`https://tiles.openfreemap.org/styles/liberty`). Free, no API key, vector
  tiles from the same OpenMapTiles planet the streets came from.
- `lightStyle()` removed the `fill-extrusion` layer (3D buildings): it
  redraws on every move and needs the depth buffer, costly on phones. Flat
  buildings stayed.
- A flat, north-up map: `maxPitch: 0`, no drag-rotate, no touch pitch or
  rotate, `renderWorldCopies: false`, `fadeDuration: 0`,
  `pixelRatio: min(devicePixelRatio, 2)`. Zoom 3 to 19; default 17.
- The style's own font (Noto Sans Bold) labels the numbered markers, so no
  extra font download.
- Map credit: MapLibre's compact attribution as a 48 px round ⓘ bottom-left,
  kept folded until the player taps it (MapLibre opens it by itself whenever
  the credit text changes; the code folds it back unless tapped).

The screenshots in `screens/` use the real Liberty style on two real Sofia
tiles, but without its sprite sheet (so no POI icons or road shields) and
nothing below zoom 14.

## His marker

An HTML `Marker` (not a map layer), anchored at its centre:

- A 40 px orange (`--accent`) disc with a 3 px ink border holding 🙂 at 22 px,
  with a soft drop shadow.
- A **bubble** above his head (18 px, paper, 2 px ink border, round): the
  icon of where he heads, from `placeIcon(class/subclass)` (🍕 pizza, 🍽
  restaurant, 🍟 fast food, ☕ cafe, 🥐 bakery, 🍦 ice cream, 🏠 a door, 🌉
  bridge, ~90 kinds, 📍 fallback). Hidden while he wanders.
- **Pop**: when paid, the bubble shows 💶 with no background and plays the
  `rise` keyframes (from 6 px below, fade in by 25%, up to −10 px, fade out),
  2 s, 3 times. Disabled under `prefers-reduced-motion`.
- **Glide**: the marker element has `transition: transform var(--glide)
  linear`; each tick sets `--glide` to the time until the next tick and moves
  the marker, so he slides smoothly while the map itself isn't redrawn. The
  transition is turned off while the map moves (else he lags behind the
  streets) and back on at `moveend`.

## Layers the game adds

All GeoJSON sources, each re-sent to MapLibre **only when a cheap key
changes** (trail version, route key, stops key...), never every tick.

| Layer | Look | When |
| --- | --- | --- |
| Order stops | orange circles r=13 with a white 3 px ring, white "1" / "2" labels 14 px | 1 = restaurant until picked up, 2 = the door |
| Goal pin | 📍 HTML marker, bottom anchor | while he has a goal |
| Route | orange `#ff7a3d`, 5 px, round caps; solid along planned streets, dashed `[1, 1.5]` straight line past the loaded map | Route to goal switch on; refreshed once a second |
| Trail | blue `#1a5fb4`, 4 px, 70% opacity | only while History is open |
| Event markers | blue circles r=11, white 2 px ring, white labels 11 px ("1", "4-6") | only while History is open |
| City area | box: orange `#e8730c` fill 10% + 3 px line; real outline from Nominatim: purple `#7b3fbf` 3 px line | City area switch on |

## The camera

- **Follows him with a dead zone.** While following, the camera stays still
  as long as he is within the middle 20% of the visible map (each way, the
  top card and bottom bar taken out as padding). Once he leaves it, the
  camera eases to him over 800 ms. So the map is redrawn every few seconds,
  not every tick. This was a big battery win.
- Dragging the map stops following; a "🙂 Back to him" pill appears above
  the bottom row and eases back to him at the remembered zoom.
- The **Camera follows him** switch (on by default) turns the auto-follow off
  completely.
- **Tapping the order line** fits him and his stop in view; tapping again, or
  the goal changing, goes back to following him.
- **History open**: padding grows by the sheet's height, the map fits the
  whole trail and markers above the sheet (max zoom 17), and refits after
  the sheet is dragged; closing it follows him again. Tapping a History row
  centres on where it happened.
- + / − zoom by whole steps with a 200 ms ease; the zoom is saved.

## Performance notes

- MapLibre only redraws when something changes. The game moves the camera a
  few times a second at most, and his marker is a CSS transform, so the main
  thread is mostly idle (measured main-thread busy well under the 15% budget).
- The map size is read only on `resize` (reading it per tick forced layout).
- MapLibre (~440 KB gzip) was loaded with a dynamic `import()` after the first
  paint, together with its worker URL and the style JSON.
