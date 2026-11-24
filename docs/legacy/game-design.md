# The game as it last played (2026-11-24)

OSM Walker was a tamagotchi-like idle game for phone browsers. A little
character, "he", rides a bike along the real streets of a real city from
OpenStreetMap while the app is open. Since 2026-11-08 he is a **food delivery
rider** in an **incremental game**: he earns money from deliveries and you
spend it on small stacking upgrades.

Live URL (last deployed 2026-11-24, stays up until GitHub Pages is turned off): https://frostblooded.github.io/OSMWalker/

## The loop

1. **Pick a city.** First launch shows a search box. Type 3+ letters, wait
   350 ms (or press Enter) and towns/cities/villages/suburbs appear (Photon,
   Nominatim as backup). Tap one. The game downloads the streets of the tile
   he starts in and puts him on the nearest street corner.
2. **He wanders.** At each street corner he takes a random street, never back
   the way he came unless it is a dead end. No goal, no input needed.
3. **An order comes** after a fixed **60 s of riding** (only time he actually
   moves counts, not time spent waiting for streets to load). The top card
   shows 🛎, a progress bar filling up, and the seconds left.
4. **He takes it by himself.** Pick-up: a random one of the **5 food places
   nearest him** (restaurant, fast food, cafe, bakery, ice cream, pizza; any
   named place of note if there is no food place). Drop: a random real
   **house number 300 m to 1.5 km** (straight line) from the restaurant. If no
   house number is in that ring, one of up to 300 random **street corners**
   in the ring stands in as "a door on Vitosha Blvd"; only if no corner fits
   either, the nearest house number past 1.5 km (or the farthest one). Where
   no house number is in the 3 km box around him, the corner order is used even outside
   the ring (the nearest corner past 1.5 km, or the farthest).
5. **He rides to the restaurant** (unpaid), shortest route over the streets
   loaded so far. Map pin **1** marks it, **2** the door. The top card says
   "🍽 Picking up at Pizza Roma", the distance, the riding time and the pay.
6. **Picked up**, he rides to the door ("🏠 Delivering to Vitosha Blvd 12").
7. **At the door he is paid.** A 💶 pops over him for 2 s, money goes up,
   History gets a line, and a new 60 s wait starts.
8. **Shop** (button at the bottom, any time; a dot on it when something is
   affordable) sells two upgrades. They apply at once.

If he rides more than 2.5 × the straight-line distance to a stop + 2 km and
still isn't there (across water, behind a fence), he gives up: the order is
cancelled without pay and the wait starts again.

Time stops while the app is closed or hidden: he waits where he was. Nothing
is lost and nothing is gained while away.

## Every number

| What | Value | Where (at `a87edab`) |
| --- | --- | --- |
| Real city bike speed | 15 km/h door to door (Copenhagen cyclists average ~15.5) | `src/core/walker.ts` `REAL_BIKE_KMH` |
| Game speed factor | 3× real, on purpose, for pace (user, 2026-11-08) | `GAME_SPEED_X` |
| His start speed | 45 km/h = 12.5 m/s = 750 m/min | `BIKE_MPS` |
| Arrived when within | 30 m | `ARRIVE_M` |
| Give up after | 2.5 × straight line + 2 km of riding | `TRIP_RATIO`, `TRIP_EXTRA_M` |
| City box | the search result's box, clamped to 1.5 km to 25 km from the centre | `MIN/MAX_CITY_RADIUS_M`, `cityBounds` |
| Order wait | 60 s, fixed (was random before PR #153) | `src/core/orders.ts` `ORDER_WAIT_S` |
| Shortest wait | 3 s | `MIN_WAIT_S` |
| Retry when no order can be made | 5 s | `src/game/game.ts` `RETRY_S` |
| Orders draw from | places and doors within 3 km of him | `ORDER_REACH_M` |
| Pick-up pool | 5 nearest food places | `NEAREST_FOOD` |
| Food classes | restaurant, fast_food, cafe, bakery, ice_cream, pizza (OpenMapTiles POI `class`) | `FOOD` |
| Drop distance | 300 m to 1.5 km from the restaurant, straight line | `DROP_MIN_M`, `DROP_MAX_M` |
| Pay | €2 + €1 per km of drop, drop ride taken as 1.3 × straight line, rounded to 10 cents | `BASE_CENTS`, `CENTS_PER_KM`, `ROUTE_FACTOR`, `payOf` |
| Pay examples | 500 m drop → €2.70, 1.5 km → €4.00 | Help page "Pay" |
| Street corners used as doors | up to 300, random, when no house number is in the ring | `STREET_DOORS` |
| 💶 pop over him | 2 s | `POSE_S` |
| 🔧 Bike tune-up | first €4, +10% speed each, multiplicative (1.1^n) | `src/core/upgrades.ts` |
| 📱 Delivery app boost | first €13, wait ×0.9 each (0.9^n), opens after 10 tune-ups | same |
| Price growth | ×1.09 per buy of the same upgrade, rounded to 10 cents | `GROWTH` |
| Opens the next upgrade | 10 of the one before | `OPENS_AFTER` |
| Save | every 5 s and when the page hides | `SAVE_EVERY_S` |
| Longest step | 1 s; a stall or hidden tab never jumps him ahead | `MAX_STEP_S` |
| Streets kept loaded | 3 × 3 z14 tiles around him (~5 × 4 km) | `STREET_RING = 1` |
| Fresh map past | 25 street cells in one city (memory stays flat) | `MAX_CELLS` |
| History | last 100 events, trail up to ~75 km (5000 points, 15 m apart) | `src/core/history.ts` |

### Why the price growth is 9%

The user picked it on 2026-11-08 after the simulation: at 15% the gaps between
upgrades grew to ~12 minutes; at 7% they shrank under 3 minutes after ~4 h
because income outgrew prices. 9% kept the gap at 4.3 to 5.5 minutes through
~80 buys (~6.5 h of play). See
[orders-and-economy.md](orders-and-economy.md#the-economy-simulation).

## The screens

- **Picker**: "🏙 Where does he start?", a search box, results as buttons.
- **Game screen**: the map full-screen. A compact card on top (🚲, city,
  "Riding along <street>", money pill, then the order line or the wait bar,
  then "Loading streets…" or "Can't reach the map server" when stuck). Under
  it a toast with the latest History line. + / − zoom on the right. One
  bottom row: ⓘ map credit, 🛒 Shop, ☰ menu. "🙂 Back to him" pill when the
  player dragged the map away.
- **Menu (☰)**: 📜 History, 🧍 Stats, ❓ Help, 🐞 Debug, switches for 🧭 Route
  to goal (off), 🎥 Camera follows him (on), 🗺 City area (off), and 🔄 New
  city (type RESET to confirm).
- **Shop**: a card per upgrade with how many he owns, what one more does,
  "Still needs €x" when short, a "Buy · €x" button; a locked one shows 🔒
  "Opens after 10 Bike tune-ups (n / 10)" and a bar.
- **Stats**: money, deliveries, places visited; owned upgrades, his speed in
  km/h and the order wait in s.
- **History**: last 100 events newest first, each numbered and timed; the map
  shows his trail and numbered markers; tapping a row zooms there.
- **Help**: searchable pages whose numbers come from the code.
- **Debug**: alerts about the city, facts (box, where he is, what he does),
  load stats, a "🛎 New order" button, and two logs (problems; orders).

Details in [ui.md](ui.md).

## The design rules (CLAUDE.md, 2026-11-08)

They came from the research report `docs/design-research.md` and were meant
to be read before any design decision. They are not tied to TypeScript.

1. The core loop must be fun alone. Cut anything that doesn't feed it, and
   write down what's left out.
2. Every choice is a situational trade-off; no option always wins. Mix
   obvious wins, traps and real trade-offs, with no recent repeats.
3. Few options: 3 (a 4th can be an unlock).
4. Show info clearly: icon + one number + time. Preview effects, and always
   react visibly to a pick.
5. Upgrades come in two kinds: small stacking bumps bought again and again
   (like +10%, multiplied), and one-offs that change what you can do or which
   places appear (keys and locks, the lock near the key, told in world
   words). Buying 10 of one generally opens the next. Prices grow, but don't
   let costs or distances scale the gains away (it is an incremental game).
6. Few currencies; extra ones only later, as depth.
7. Care is visible, forgiving and never guilt-tripping: no death, no lost
   progress in play, and the player's pick clearly beats the automatic one. A
   redesign of the economy may reset money and upgrades in old saves.
8. Returning feels like a gift (a summary, a diary), not a punishment.
9. Prefer real, notable OSM places as free content over hand-made arcs.
10. Log picks and measure; simulate the economy; check UI clarity before
    retuning numbers.
11. About one upgrade every 5 minutes of play, early and later. `npm run sim`
    checked it.

Older standing ideas from the user that shaped earlier versions:

- **Pacing** (2026-10-31): something interesting about once a minute.
- **Cohesion** (2026-10-30): keep every idea in line with the core idea, a
  little character living on real OSM streets.
- **Time while closed**: changed several times. A catch-up on reopen from
  the start (PR #2), removed in PR #12 (he waited in place), back as a full
  simulation in PR #42, then a 10× speed boost for as long as you were away
  (PR #136), and finally (PR #142) time simply stops.

## What was next when it stopped

The user was play-testing the delivery loop. Ideas on the table (from the
research report, Part 3): a delivery ladder of one-off unlocks such as a
thermal bag, phone mount, big bag, scooter and train, following the
"10 opens the next" rule, while keeping about one upgrade every 5 minutes.
