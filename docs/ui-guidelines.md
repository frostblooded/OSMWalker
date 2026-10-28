# UI guidelines

Every screen in OSM Walker follows these rules. They come from Apple's and
Google's touch guidelines and from research on how people scan dense screens
(sources at the end), turned into numbers for this game.

## Units

The game draws on a 720 px wide canvas (`canvas_items` stretch). A typical
phone is about 360 dp wide, so **1 dp ≈ 2 canvas px**. All numbers below are
canvas px.

## 1. Never dump text

- No screen is one long label. Split information into **cards** (a panel
  per topic) with a **heading row**: an icon, a short title and, when useful,
  a value or badge on the right.
- Keep each card to about **4 or 5 items** (chunking). More than that becomes
  its own card or a collapsible group.
- Show **key / value rows**, not sentences: a dim label on the left and a
  bold value on the right ("Places in city box · **37**").
- Lists of similar entries (log lines, history events) are **rows with
  alternating backgrounds** (zebra striping) and a small gap, so the eye
  doesn't lose its place. Each row starts with what matters most: an icon or
  time, then a short title, then dim details.
- Long or rarely needed detail sits in a **collapsible section** (tap the
  heading to open or close it; show ▸ / ▾). The important bits stay open by
  default (progressive disclosure).
- Put problems first, with colour and an icon, so they can't be missed.

## 2. Hierarchy and type

- Use **three text sizes per screen**, at most: title 40, heading 32, body 26 to 28.
  Nothing below **24** (12 dp). Buttons, prices and timers are at least 30.
- Line length: wrap at the card width. Avoid lines longer than about 60
  characters on wide screens.
- Use weight and colour, not only size, for hierarchy: titles dark, labels
  grey (`#5e5e5e`), values near-black.
- Numbers that change (timers, counters) keep the same width (pad with
  spaces or keep the format fixed) so they don't jump.

## 3. Colour and icons

- One meaning per colour, used the same everywhere:
  - red `#c01c28`: error or danger
  - amber `#b86e00`: warning
  - green `#2e9e44`: OK or good
  - blue `#1a5fb4`: tappable link or info
- Never rely on colour alone: pair it with an icon or a word (⚠ Warning,
  ✖ Error, ✔ OK).
- Use simple emoji or symbol icons in headings and rows (🏙 city, 📍 places,
  🎲 dice, ✈ trip, ⚠ warning). One icon per item, the same icon for the same
  thing on every screen.
- Text must contrast with its background (at least 4.5:1). Text over the
  map always sits on a panel (white at 92 %) or has an outline.

## 4. Touch

- Every tappable thing is at least **96 × 96** (48 dp), primary actions
  **110** tall or more. Keep **16** between neighbouring targets.
- The visible icon can be small, but its hit box is not.
- Destructive actions are kept apart from frequent ones and need a
  confirmation (New city asks for RESET).
- Keep controls **24** or more from the screen edges.
- **Scrolling follows the finger 1:1.** Use the shared `TouchScroll`
  (`scripts/touch_scroll.gd`) for every scroll list, never a bare
  `ScrollContainer`.

## 5. Layout

- Use containers (VBox, HBox, margins) and anchors, never hard-coded
  positions, except for small offsets.
- Spacing comes from one scale: **8, 12, 16, 24, 32**. Cards have 16 to 24
  inner padding and 12 to 16 between them.
- Texts never overlap. The `overlapping_texts()` tests cover every screen
  and must stay green, at 720 × 1280 and 720 × 1560.
- Test with long strings (long city names, 30 to 50 % longer text) and let
  labels wrap rather than clip.
- Panels that cover the map leave what you need to see uncovered (the
  bottom half for History and Debug).

## 6. Checklist for every UI change

1. Is anything a wall of text? Split it into cards, rows or collapsibles.
2. Are related things grouped, with icons and headings?
3. Are all tap targets at least 96 px, and do scroll lists use `TouchScroll`?
4. Are the colours the four above, each with an icon or word?
5. Do the overlap tests pass, and have you looked at a screenshot of it?

## Sources

- Apple, UI Design Dos and Don'ts: https://developer.apple.com/design/tips
- Material Design, touch targets and density: https://material.io/design/layout/applying-density.html
- UI scaling for mobile games, readability: https://cursa.app/en/page/ui-scaling-for-mobile-games-layout-systems-and-readability
- Chunking pattern: https://ui-patterns.com/patterns/Chunking
- Zebra striping discussion: https://me.konigi.com/blog/zebra-striping-does-it-really-help/
