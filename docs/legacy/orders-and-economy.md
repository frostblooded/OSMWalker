# Orders, pay, upgrades and the economy

Files at `a87edab`: `src/core/orders.ts`, `src/core/upgrades.ts`,
`src/core/stats.ts`, `src/core/money.ts`, `src/game/game.ts` (`newOrder`,
`onArrived`, `onIdle`, `buy`), `tests/support/economy.ts` (the simulation),
`tests/unit/economy.test.ts` (its targets), `orders.test.ts`,
`upgrades.test.ts`. All numbers are listed in
[game-design.md](game-design.md#every-number).

## Money

Euros, always kept as **whole cents** (integers) so sums never drift.
`euro(cents)` formats `€200`, `€1.20`, `€12,345.67` (cents shown only when
there are any, en-US thousands separators).

## The job: an order or a wait

`Job` holds either the current `order` or the wait for the next one
(`waitLeftS` of `waitS`). `waitShare()` = 1 − left/full, clamped to 0..1, drives
the progress bar.

Each game step, **only if he actually moved** this step (`totalM` grew) and
has no order, `waitLeftS -= dt`. At ≤ 0 the game calls `newOrder()`. So the
wait does not run while he stands waiting for streets.

## Making an order (`makeOrder` + `Game.newOrder`)

1. Box of 3 km around him. `places = graph.placesIn(box)`,
   `doors = graph.homesIn(box)`.
2. Pick-up pool: places whose class is in `FOOD`; if none, all places. Sort
   by distance from him, keep the 5 nearest, pick one at random.
3. Drop: one pass over all doors (no sort, there can be thousands): collect
   those 300–1500 m from the restaurant (the "ring"), remember the nearest
   past 1500 m and the farthest overall. Pick at random from the ring, else
   the nearest past it, else the farthest.
4. If no order came out, or the drop is outside the ring, try again with up
   to 300 random **street corners** in the box as doors (street name only,
   number ""), and use that if it lands in the ring.
5. No places or no doors at all: retry in 5 s.
6. The door gets its street from the nearest corner
   (`graph.streetAt(nearestNode)`).
7. Pay is fixed now: `payOf(dropM)`.
8. Log it (debug log entry with pick-up metres, drop metres, pay, counts of
   food places and doors loaded, `street_doors` flag), add a History line
   "New order: pick up at X for Y (€z)", and `walker.goTo(restaurant)`.

Address text (`addressOf`): "Vitosha Blvd 12", "No. 12" (number, no street),
"a door on Vitosha Blvd" (street, no number), "a door nearby" (neither).

## Arriving (`Game.onArrived`)

Places are compared by `visitKey` = `name@lat.toFixed(4),lon.toFixed(4)`.

- At the restaurant, not picked yet: `picked = true`, History "Picked up the
  food at X", `walker.goTo(door)` (the door as a place of class `home`).
- At the door, picked: `stats.deliver(cents)` (money + 1 delivery), History
  "Delivered to Y: +€z", debug log entry, the 💶 pop for 2 s, and
  `endOrder()`: no order, new wait of `waitS(waitX(upgrades))`.
- Every arrival counts the place as visited (`stats.reach`).

If the walker gives up (trip too long) it drops its goal and fires `idle`; the
game sees an order still on and cancels it: History "Couldn't get to X, so
the order was cancelled", debug log, new wait.

The debug "🛎 New order" button drops the current order and runs
`newOrder()` at once, marked "forced".

## Upgrades

```ts
UPGRADES = [
  { id: "speed",  icon: "🔧", name: "Bike tune-up",       cents: 400,  does: "he rides 10% faster" },
  { id: "orders", icon: "📱", name: "Delivery app boost", cents: 1300, does: "orders come 10% sooner", after: "speed" },
]
priceOf(u, owned) = round(u.cents * 1.09^count / 10) * 10        // cents
isOpen(u, owned)  = !u.after || count(owned, u.after) >= 10
speedX(owned)     = 1.1 ^ count(speed)       // his speed = 12.5 m/s * speedX
waitX(owned)      = 0.9 ^ count(orders)      // wait = max(3, 60 * waitX) s
```

`Stats.buy(u)`: refuses if not open or not affordable; else pays, counts up,
History "Bought 🔧 Bike tune-up #5 for €5.60: he rides 10% faster". The game
then re-applies speed to the walker and saves. A new wait length applies
from the next wait.

Prices of the first few tune-ups: €4.00, €4.40, €4.80, €5.20, €5.60, €6.20,
€6.70, €7.30, €8.00, €8.70 (then the app boost opens at €13.00).

## The economy simulation

`tests/support/economy.ts` played the loop for hours **without the map**, in
a made-up 8 × 8 km city with 25 food places and 150 doors per km², using the
game's real `makeOrder`, `waitS`, `Stats` and prices:

```
loop until `hours` are up:
  time += wait
  he drifts up to ±300 m (wandering during the wait)
  order = makeOrder(rng, here, food nearby, doors nearby)
  ride = (distance to restaurant + drop) * 1.3   // streets aren't straight
  time += ride / speed
  deliver; here = door
  buy the cheapest open upgrade as often as he can afford one
```

It reported the **median over 15 seeds** of minutes to the n-th buy.
`npm run sim` printed the table; the test (5 seeds, 7 h) asserted the
targets: first tune-up within 10 min, 1 to 6 min per order at the start, the
app boost opens within 3 h, and between buy 1→10, 10→20, 20→30, 30→50 and
50→70 the average gap stays between 3.5 and 7 minutes (rule 11: about one
upgrade every 5 minutes).

Last output (2026-11-24, `a87edab`):

| Upgrade | Minutes of play |
| --- | --- |
| speed #1 | 6 |
| speed #2 | 9 |
| speed #3 | 13 |
| speed #5 | 21 |
| speed #10 | 44 |
| orders #1 | 72 |
| orders #5 | 118 |
| orders #10 | 172 |
| any upgrade #10 | 44 |
| any upgrade #20 | 101 |
| any upgrade #30 | 156 |
| any upgrade #50 | 254 |
| any upgrade #70 | 339 |

Minutes to delivery 1, 10, 100: 3.2, 26.1, 141.8.

How growth was chosen: 15% made the gaps grow to ~12 min; 7% made them
shrink under 3 min after ~4 h (income grows with speed and shorter waits
faster than prices); 9% kept 4.3–5.5 min through ~80 buys.

## Saves and the economy

`stats.economy` is a version number (`ECONOMY = 2` for deliveries). A save
from an older economy keeps places visited and History but starts money,
deliveries and upgrades at 0 (design rule 7 allows a reset on an economy
redesign; the PR must say so).

## Earlier economies (for reference, all at `2d468a4` or before)

- Coins and XP, then euros with real-world price levels per country
  (`/mnt/project-files/money/`), wages by job, rent, bills, a hospital, saving
  for the next vehicle (PR #43).
- The base loop of PR #142–#146: money + XP, rewards by kind of place per
  walking minute, a ladder of 7 one-off unlocks bought at shop places (map,
  bike, guide, bag, scooter, metro, train).
