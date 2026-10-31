# UI guidelines

Every screen in OSM Walker follows these rules. `src/ui/kit.tsx` has the
pieces they describe and `src/ui/app.css` the numbers and colours. They come
from mobile and game UI research (sources at the end), turned into numbers
for this game. Read this before you touch the UI, and run the checklist at
the end on every change.

## Units

All numbers are CSS px. On a phone 1 CSS px is 1 dp, so 48 px is the
Material 48 dp touch target (96 px on the old Godot 720 px canvas).

## Look: Cozy game

The game commits to one look, the "Cozy game" style the user picked
(2026-10-28): warm paper colours, thick ink edges with a solid lip under
anything raised, round corners, Fredoka for headings and buttons and Nunito
for text (both self-hosted, Latin only). The tokens live on `:root` in
`app.css` (`--ink`, `--paper`, `--ground`, `--zebra`, `--accent`,
`--edge`, `--lip`, ...). Use them, never new hex values.

## 1. Never dump text

Players scan rather than read, and short-term memory holds about four
things at a time. A block full of lines is the most common mistake here.

- Split information into **cards** (`Card`), one per topic, each with a
  **heading row**: an icon, a short title and, when useful, a value or
  badge on the right ("🏙 City · Sofia").
- Keep a card to about **4 or 5 items**. More than that becomes another
  card or a collapsible group.
- Facts are **key / value rows** (`KV`): a dim label on the left and a
  dark value on the right ("Places in city box · 37"). Don't use sentences
  for facts.
- Lists of similar entries (log lines, history events, search results) are
  **rows on alternating backgrounds** (`.zebra`) with a small gap, so the
  eye keeps its place. A row starts with what matters most (an icon or a
  time, then a short title) and puts details after it, dimmed.
- Order cards and rows by importance: problems first, then what the player
  came for, then detail.

## 2. Progressive disclosure: titles that expand

- Long or rarely needed detail goes in a **collapsible section**
  (`Collapsible`). Tap the whole heading row to open or close it. The caret
  sits **at the end of the row's text**: ▸ closed, ▾ open.
- Logs and lists of events show **one short title per entry** ("🎯 Chosen:
  Cafe East") and open into the full detail when tapped (`Entry`). Each log
  entry has a `title` (at most about 40 characters) and `details` (the lines
  shown when open).
- Closed is the default for detail. Keep what the player must see (alerts,
  the current state) **outside** collapsibles, because people miss hidden
  content.
- Don't nest collapsibles more than one level deep.

## 3. Hierarchy and type

- **Three text sizes per screen** at most: title 20, heading 16, body 14
  (`--title`, `--heading`, `--body`). Small print is 12 (`--small`) and
  nothing goes below it.
- Use weight and colour for hierarchy as well as size: values dark
  (`--ink`), labels and details brown-grey (`--dim`).
- Let lines wrap at the card width. Don't truncate names that matter.
- Numbers that change (timers, counters) keep a fixed format so they don't
  jump.

## 4. Colour and icons

- One meaning per colour, used the same way everywhere:
  - red `--error` / `--hp`: error, danger, health
  - amber `--warning` / `--en`: warning, energy
  - green `--ok` / `--fu`: OK, good, gains, fullness
  - orange `--accent`: him, his route, the main button
  - gold `--coin`: money; lilac `--lilac`: level
  - pale gold `--halo`: his halo at good karma (red `--hp` draws his horns)
  - indigo `--magic`: Magic, ley lines and other magic (also the magic map
    icons, `map/icons.ts`, and the ley line layer, `map/mapView.ts`)
- Rarity follows the colours players know from other games: grey common,
  green uncommon, blue rare, orange legendary (`RARITY_COLOR`).
- Colour is never the only signal. Pair it with an icon or a word (⚠
  Warning, ✖ Error, ✔ OK).
- The same thing always has the same icon (🏙 city, 📍 place, 🎲 dice,
  ✈ trip, 🎯 goal, 📜 log, ⚠ warning). One icon per item, only where it
  helps recognition. No decoration.
- Text needs at least 4.5:1 contrast. Over the map it always sits on a
  card.

## 5. Touch

- Every tappable thing is at least **48 × 48** (`--tap`), and primary
  actions are **56** tall (`--tap-big`). The e2e tests check every visible
  button. Keep **8** or more between targets.
- An icon can be small, but its hit box can't.
- **Thumb zone**: the main actions go at the bottom of the screen, where
  the thumb rests. On the map only zoom (+ −) and ☰ sit at the bottom
  right; "Back to him" appears at the bottom when the map isn't following
  him. Everything else is in the ☰ menu, which opens as a bottom sheet.
- Destructive actions are kept apart from frequent ones and need a
  confirmation (New city asks for RESET).
- Keep controls **12** or more from the screen edges, plus the safe-area
  insets.
- Show a pressed state for every button (`.btn:active` presses it into its
  lip), since touch has no hover. Give feedback for every action.
- **Scrolling follows the finger 1:1.** Scroll lists are plain
  `overflow-y: auto` boxes, which browsers scroll 1:1 natively. Don't add
  scroll libraries or JS scrolling.

## 6. Layout

- Use flex and grid, never absolute positions except for things that float
  over the map (the top card, zoom, ☰, sheets).
- Spacing comes from one scale: **4, 8, 12, 16, 24** (`--s1` to `--s5`).
  Cards have 16 inner padding and 12 between them.
- Texts never overlap. Test with long strings (long city names, text 30 to
  50 % longer) and let lines wrap rather than clip.
- Panels over the map leave what you need to see uncovered. History takes
  the bottom 60 %, so you can still see him above.
- Every sheet can be dragged smaller by its title bar (`SheetBox`): it
  stays where the finger lets go, up to its tallest, and closes when let
  go below 30 % of the screen. Keep the title bar free of anything else
  that drags.
- Every screen works at 360 px wide with no sideways scroll.

## 7. Checklist for every UI change

1. Is anything a wall of text? Split it into cards, key/value rows, zebra
   rows or collapsibles.
2. Does every group have an icon and a heading, with the most important
   thing first?
3. Do colours keep their meanings, each with an icon or word? Are they the
   `:root` tokens?
4. Are all tap targets at least 48 px (the e2e `smallButtons` check)?
5. Have you looked at the new screen at 360 and 412 px? `tests/e2e/layout.spec.ts`
   shoots every screen into `screens/` (the `screens` CI artifact) and fails
   on overlap or sideways scroll; add a step there for a new screen.
6. Did you measure the performance cost (`npm run perf`)?

## Sources

- Apple, UI Design Dos and Don'ts (44 pt targets, 11 pt text, contrast, alignment): https://developer.apple.com/design/tips
- Material Design, touch targets and density (48 dp): https://material.io/design/layout/applying-density.html
- UI scaling for mobile games (text sizes, spacing scale, contrast on busy backgrounds): https://cursa.app/en/page/ui-scaling-for-mobile-games-layout-systems-and-readability
- Chunking (about four items per group, headings, visual groups): https://ui-patterns.com/patterns/Chunking
- Accordion design (caret at the end, whole header tappable, don't nest, closed by default, keep key content visible): https://blog.logrocket.com/ux-design/accordion-ui-design
- The thumb zone (main actions low, rare ones high or in a menu): https://shop.smashingmagazine.com/2016/09/the-thumb-zone-designing-for-mobile-users
- World of Warcraft UI lessons (rarity colours, colour per category, detail on demand, ordered by importance): https://indieklem.substack.com/p/12-what-you-can-learn-from-the-ui
- Roblox UI and UX design (consistency, pressed states, feedback, vibrant for critical, muted for the rest): https://create.roblox.com/docs/production/game-design/ui-ux-design
- Zebra striping helps in long lists and tables: https://me.konigi.com/blog/zebra-striping-does-it-really-help/
- Anthropic, improving frontend design (commit to one look, strong contrast in size and weight, a dominant colour with sharp accents): https://claude.com/es/resources/articles/improving-frontend-design-through-skills
