# Screens, sheets and Help

Files at `a87edab`: `src/ui/*.tsx` (Preact), `src/ui/app.css` (all styles;
exact copy in [reference/app.css](reference/app.css)), `src/ui/kit.tsx` (the
UI kit), `src/ui/help.ts` + `public/data/help.txt` (Help; exact text in
[reference/help.txt](reference/help.txt)), `src/ui/snap.ts` (sheet drag),
`src/ui/format.ts` (short texts). The full rules are in
[ui-guidelines.md](ui-guidelines.md). Rebuilding the look: use the colour
tokens and sizes below, the screenshots, and the CSS copy.

## The look: "Cozy game" (user's pick, 2026-10-28)

Warm paper colours, thick ink edges with a solid "lip" shadow under anything
raised, round corners, **Fredoka 600** for headings, buttons, pills and
numbers, **Nunito 700/800** for text (self-hosted, Latin subsets only, ~16 KB
each, `font-display: swap`). Body text is bold (700) everywhere.

| Token | Value | Meaning |
| --- | --- | --- |
| `--ink` | `#3d2a1c` | text, all edges |
| `--dim` | `#7a5a42` | labels, details |
| `--paper` / `--panel` | `#fff8ec` | cards, sheets, buttons |
| `--ground` | `#efe6d2` | page background, theme colour |
| `--zebra` | `#f6ead6` | every other row, the order chip |
| `--line` | `#e2d3b8` | dividers, pressed rows, the sheet grip |
| `--accent` | `#ff7a3d` | him, his route, ☰, primary buttons |
| `--coin` | `#ffd66b` | money pill |
| `--lilac` | `#e9dcff` | locked-upgrade progress |
| `--hp` / `--error` | `#e5484d` / `#c4282e` | danger, errors |
| `--warning` | `#a35c00` | warnings |
| `--fu` / `--ok` | `#46a758` / `#2f8a3e` | good, a switch that is on |
| `--edge` | `3px solid var(--ink)` | |
| `--lip` | `0 4px 0 var(--ink)` | shadow under raised things |
| `--r` / `--r-small` | 20 px / 14 px | corner radius of cards / buttons |
| `--tap` / `--tap-big` | 48 px / 56 px | smallest tap target / primary buttons and inputs |
| spacing `--s1..--s5` | 4, 8, 12, 16, 24 px | |
| text | title 20, heading 16, body 14, small 12 px | never smaller than 12 |

Buttons (`.btn`): 48 px tall, 3 px ink edge, 14 px corners, paper, 4 px lip;
pressed they move down 3 px and the lip shrinks to 1 px (60 ms). `.primary`
is orange with white text, 56 px tall. `.round` is a circle with a 24 px
glyph.

Safe areas: the top card and sheets add `env(safe-area-inset-*)`.

## Screen by screen

**Boot** (`index.html`, inline CSS so it paints before any script): "OSM
Walker" 28 px and "Loading…" centred on `--ground`.

**Picker** (`Picker.tsx`): `h1` "🏙 Where does he start?" (28 px), lead "Type a
town or city. He rides its real streets.", a 56 px search field with
placeholder "Sofia, Lyon, Kyoto…" and a 🔍 primary button, a status line
("Searching…" with a spinner, "Tap a place", "Nothing found. Try another
name.", or red "✖ Couldn't reach the search server. Check your connection and
try again."), then results as zebra rows where the typed part is normal and
the rest **bold**. Search runs 350 ms after typing stops once 3+ letters are
in, or on Enter. After a tap: "Finding streets in Sofia… (state)".

**Resume** (a save exists): "OSM Walker" and a spinner with "Picking up where
he was…" while the game loads.

**Game screen** (`GameScreen.tsx`), over the full-screen map:

- **Top card** (12 px from the edges): a 44 px orange disc with 🚲; "SOFIA"
  (12 px, dim, uppercase, letter-spaced); "Riding along <street>" or "Riding
  along an unnamed path" (Fredoka 16); the money pill (gold) on the right.
  Below it one chip (zebra, 2 px edge, 48 px tall):
  - waiting: 🛎, a progress bar that fills left to right (`scaleX`), "37 s" in
    a small pill;
  - on an order (a button): "🍽 Picking up at Pizza Roma" or "🏠 Delivering
    to Vitosha Blvd 12", and a pill "850 m · ~1 min · 💶 €3.40" (distance as
    "850 m" / "1.2 km", time as "<1 min" / "~8 min" / "~1 h 5 min").
  - under the chip, when stuck: "⏳ 🛣 Loading streets…" with a spinner, or red
    "✖ Can't reach the map server. Retrying…".
- **Toast** under the card: the newest History line; fades out after 6 s
  (`toast` keyframes: fully visible until 85%).
- **Zoom**: + and − round 48 px buttons on the right, above ☰.
- **Bottom row**: ⓘ (48 px, bottom-left), 🛒 **Shop** filling the middle
  (plain paper; a red dot when something is affordable; hidden while the Shop
  is open), ☰ (orange round, bottom-right; red dot for unseen problems).
- **Back to him** pill centred just above the bottom row, only after a drag
  while the camera follows him.

**Sheets** (`SheetBox`): slide over the bottom of the map, max 60% of the
screen, 24 px top corners, header with a grip line (40 × 4 px) and title (20
px) and "✕ Close". Escape closes. Full-screen sheets (Help, Debug) fill the
screen. **Dragging the header** resizes it: it stays where you let go (up to
60%, or the whole screen for full sheets, which snap back to full above
90%), and closes when let go below 30% of the screen, only on a downward
drag; small jitters under 8 px are taps.

**Menu** sheet: full-width left-aligned buttons: 📜 History, 🧍 Stats, ❓
Help, 🐞 Debug (dot), then three switches (a track that turns green when on):
🧭 Route to goal, 🎥 Camera follows him, 🗺 City area; then 🔄 New city.

**Shop** sheet: "💶 €45.67 to spend", then one card per upgrade: icon +
name, "×14" on the right when owned, "One more: he rides 10% faster.", a
"💶 Still needs €2.10" row when short, and a primary "Buy · €13.40" button
(disabled when short). Locked: 🔒 on the right, a "🔒 Opens after · 10 Bike
tune-ups (4 / 10)" row and a lilac bar.

**Stats** sheet: card "🚲 His work" (💶 Money, 📦 Deliveries, 📍 Places
visited) and card "🧰 Upgrades" (each upgrade ×n, 🚲 Speed in km/h, 🛎 Order
wait in s).

**History** sheet: zebra rows, each a numbered orange circle (1 = newest),
the text and the time (HH:MM, local). Empty: "Nothing yet. What he does shows
up here."

**Debug** sheet (full): coloured alert boxes; cards for the city (box size in
km, where he is, places in box, what he is doing in words), what has loaded
(cells loaded / from cache / downloaded / loading / queued / failed, last
request and errors per server); a "🛎 New order" button; collapsible logs
"Problems" and "Orders" whose entries open into detail lines.

**New city** dialog: dimmed background, card "🔄 Start over in a new city?",
"He forgets everything: his money, upgrades, places and history. Type RESET
to confirm.", a letter-spaced input, a red "Start over" button enabled only
when the text is exactly RESET, and "Keep riding".

## The Help system

- `public/data/help.txt`: `# Section` lines, `## Page title {id}` lines, then
  the page's text. Blank lines split a page into cards; lines starting with
  "- " become rows.
- `{PLACEHOLDERS}` are filled from the game's own constants by
  `help.ts values()` (e.g. `{BIKE_KMH}` → 45, `{ORDER_WAIT_S}` → 60,
  `{UPGRADES}` → the upgrade list), so Help never goes stale. A unit test
  failed on any placeholder without a value, any value never used, or a
  screen button without a Help page.
- Search: every word must appear (in title or body) at the start of a word
  ("fast" finds "faster", "fee" doesn't find "coffee"), case and accents
  ignored, title hits first, each result with a snippet and the match marked.
- Project rule: every mechanic or number change updates Help in the same PR.

The final Help text is in [reference/help.txt](reference/help.txt) (with
placeholders), and the rendered pages are in the screenshots below.

## Screenshots

Taken 2026-11-24 from `a87edab` in headless Chromium on a Pixel 7 profile
(412 × 839 CSS px, shown at half the device pixels), with the real Liberty
style on two real Sofia tiles (no POI icons or road shields: the sprite sheet
couldn't be fetched). Earlier per-width layout shots came from
`npm run screens`.

| | |
| --- | --- |
| ![](screens/01-picker.png) Picker | ![](screens/02-picker-results.png) Search results |
| ![](screens/03-picker-search-failed.png) Search failed | ![](screens/04-game-waiting-for-order.png) Riding about, waiting for an order |
| ![](screens/05-game-order-pickup.png) Order: riding to pick up (pins 1 and 2) | ![](screens/06-goal-chip-tapped-shows-him-and-stop.png) Order line tapped: him and his stop |
| ![](screens/07-menu-switches-on.png) Menu with switches on | ![](screens/08-game-route-line.png) Route to goal line |
| ![](screens/09-city-area-box-and-outline.png) Zoomed out with City area on (the whole view is inside the orange-tinted box; tiles exist only at z14) | ![](screens/10-game-delivering.png) Delivering |
| ![](screens/11-back-to-him-after-drag.png) Back to him after a drag | ![](screens/12-map-credit-open.png) Map credit open |
| ![](screens/13-paid-money-pop.png) Paid: 💶 pop, toast, new wait | ![](screens/14-toast-after-delivery-new-wait.png) A moment later |
| ![](screens/20-menu.png) Menu | ![](screens/32-menu-dragged-lower.png) Menu dragged lower |
| ![](screens/21-shop-poor-locked.png) Shop, can't afford, app boost locked | ![](screens/22-shop-can-buy.png) Shop, can buy |
| ![](screens/23-shop-after-buy.png) Shop after a buy | ![](screens/24-shop-both-open.png) Shop, both upgrades open |
| ![](screens/25-stats.png) Stats | ![](screens/26-history-with-trail.png) History |
| ![](screens/27-debug.png) Debug | ![](screens/28-debug-orders-open.png) Debug, orders log open |
| ![](screens/29-debug-scrolled.png) Debug, scrolled | ![](screens/50-loading-or-failing-streets.png) Streets failing to load |
| ![](screens/30-new-city-dialog.png) New city dialog | ![](screens/31-new-city-dialog-typed.png) RESET typed |
| ![](screens/40-help-list.png) Help topics | ![](screens/41-help-list-bottom.png) Help topics, bottom |
| ![](screens/42-help-page-what-osm-walker-is.png) Help page | ![](screens/43-help-page-orders.png) Help: Orders |
| ![](screens/44-help-page-pay.png) Help: Pay | ![](screens/45-help-page-upgrades.png) Help: Upgrades |
| ![](screens/46-help-page-the-map.png) Help: The map | ![](screens/47-help-search.png) Help search |
