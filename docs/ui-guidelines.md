# UI guidelines

Every screen in OSM Walker follows these rules, and `scripts/ui_kit.gd`
builds the pieces they describe. They come from mobile and game UI
research (sources at the end), turned into numbers for this game. Read this
before you touch the UI, and run the checklist at the end on every change.

## Units

The game draws on a 720 px wide canvas (`canvas_items` stretch). A typical
phone is about 360 dp wide, so **1 dp ≈ 2 canvas px**. All numbers below are
canvas px.

## 1. Never dump text

Players scan rather than read, and short-term memory holds about four
things at a time. A label full of lines is the most common mistake here.

- Split information into **cards** (`UiKit.card`), one per topic, each with
  a **heading row**: an icon, a short title and, when useful, a value or
  badge on the right ("🏙 City · Sofia").
- Keep a card to about **4 or 5 items**. More than that becomes another
  card or a collapsible group.
- Facts are **key / value rows** (`UiKit.kv_row`): a dim label on the left
  and a dark value on the right ("Places in city box · 37"). Don't use
  sentences for facts.
- Lists of similar entries (log lines, history events, search results) are
  **rows on alternating backgrounds** (`UiKit.zebra`) with a small gap, so
  the eye keeps its place. A row starts with what matters most (an icon or
  a time, then a short title) and puts details after it, dimmed.
- Order cards and rows by importance: problems first, then what the player
  came for, then detail.

## 2. Progressive disclosure: titles that expand

- Long or rarely needed detail goes in a **collapsible section**
  (`UiKit.collapsible`). Tap the whole heading row to open or close it.
  The caret sits **at the end of the row's text**: ▸ closed, ▾ open.
- Logs and lists of events show **one short title per entry** ("🎯 Chosen:
  Cafe East") and open into the full detail when tapped. Each log entry has
  a `title` (at most about 40 characters) and `details` (the lines shown
  when open).
- Closed is the default for detail. Keep what the player must see (alerts,
  the current state) **outside** collapsibles, because people miss hidden
  content.
- Don't nest collapsibles more than one level deep (a section whose rows
  expand is fine; a section inside a section inside a section is not).

## 3. Hierarchy and type

- **Three text sizes per screen** at most: title 40, heading 32, body 28
  (`UiKit.TITLE`, `HEADING`, `BODY`). Small print is 24 (`SMALL`) and
  nothing goes below it (12 dp). Buttons, prices and timers are 30 or more.
- Use weight and colour for hierarchy as well as size: values dark
  (`INK`), labels and details grey (`DIM`).
- Let lines wrap at the card width. Don't truncate names that matter.
- Numbers that change (timers, counters) keep a fixed format so they don't
  jump.

## 4. Colour and icons

- One meaning per colour, used the same way everywhere (`UiKit` constants):
  - red `ERROR` `#c01c28`: error, danger, health
  - amber `WARNING` `#b86e00`: warning
  - green `OK` `#2e9e44`: OK, good, gains
  - blue `LINK` `#1a5fb4`: something tappable, or info
- Rarity follows the colours players know from other games: grey common,
  green uncommon, blue rare, purple epic, orange legendary.
- Colour is never the only signal. Pair it with an icon or a word (⚠
  Warning, ✖ Error, ✔ OK).
- Icons come from `UiKit.ICON`, so the same thing always has the same icon
  (🏙 city, 📍 place, 🎲 dice, ✈ trip, 🎯 goal, 📜 log, ⚠ warning). Use one
  icon per item, and only where it helps recognition. Don't add decoration.
- **Emoji and symbols need the icon fonts.** The game's default font has
  none of them, and the web build has no system fallback, so they show as
  empty boxes. `UiKit.install_icon_fonts()` (called by the HUD) adds Noto
  Emoji and Noto Sans Symbols 2 as fallbacks. Add any new icon to `ICON`,
  and the test checks that a font can draw it.
- Use bright colour for what matters and muted colour for the rest. Don't
  use bright, bold or blinking text everywhere.
- Text needs at least 4.5:1 contrast. Over the map it always sits on a
  panel (white at 92 %) or has an outline.

## 5. Touch

- Every tappable thing is at least **96 × 96** (`UiKit.TAP`, 48 dp), and
  primary actions are **110** tall (`TAP_BIG`). Keep **16** between targets.
- An icon can be small, but its hit box can't.
- **Thumb zone**: the main actions go at the bottom of the screen, where
  the thumb rests. Rarely used things go higher up or in the ☰ menu.
- Destructive actions are kept apart from frequent ones and need a
  confirmation (New city asks for RESET).
- Keep controls **24** or more from the screen edges.
- Show a pressed state for every button, since touch has no hover. Give
  feedback for every action (the list changes, a message appears, a bar
  fills).
- **Scrolling follows the finger 1:1.** Every scroll list is a `TouchScroll`
  (`UiKit.scroll()`). Godot's own touch scrolling moved about twice as far as
  the finger in the web build. Rows and buttons inside a list use
  `mouse_filter = PASS` so drags on them still scroll, and they ignore the
  release that ends a drag (`UiKit.scroll_of(node).is_dragging()`;
  collapsibles already do).

## 6. Layout

- Use containers (VBox, HBox, PanelContainer) and anchors, never hard-coded
  positions except for small offsets.
- Spacing comes from one scale: **8, 12, 16, 24** (`S1` to `S4`). Cards
  have 16 inner padding and 12 between them.
- Texts never overlap. The `overlapping_texts()` tests cover every screen
  and must stay green at 720 × 1280 and 720 × 1560.
- Test with long strings (long city names, text 30 to 50 % longer) and let
  labels wrap rather than clip.
- Panels over the map leave what you need to see uncovered. History and
  Debug take the bottom half, so you can still see him above.

## 7. Checklist for every UI change

1. Is anything a wall of text? Split it into cards, key/value rows, zebra
   rows or collapsibles.
2. Does every group have an icon and a heading, with the most important
   thing first?
3. Do colours keep their meanings, each with an icon or word? Can the font
   draw every icon?
4. Are all tap targets at least 96 px, and are scroll lists `TouchScroll`?
5. Do the overlap tests pass, and have you looked at a screenshot (the e2e
   run saves them)?

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
