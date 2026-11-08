// The economy simulation: plays the delivery loop for some hours in a made-up
// city, with the game's own orders, pay, waits, speeds and prices, buying an
// upgrade as soon as he can afford one. Rides are the straight line times
// ROUTE_FACTOR. Run `npm run sim` for the table; tests/unit/economy.test.ts
// checks the targets.
import { moved, type LatLon } from "../../src/core/geo";
import { distanceM } from "../../src/core/geo";
import { makeOrder, ROUTE_FACTOR, waitS, type Home } from "../../src/core/orders";
import { Rng } from "../../src/core/rng";
import { Stats, type Place } from "../../src/core/stats";
import { isOpen, priceOf, speedX, UPGRADES, waitX } from "../../src/core/upgrades";
import { BIKE_MPS } from "../../src/core/walker";

/** Food places and doors per km² in the made-up city: a mid-sized European centre. */
export const FOOD_PER_KM2 = 25;
export const DOORS_PER_KM2 = 150;
export const CITY_HALF_M = 4000;
/** How far he wanders between orders is his speed times the wait; where he ends up is random within this of where he was. */
export const WANDER_SPREAD_M = 300;

function city(seed: number): { food: Place[]; doors: Home[] } {
  const rng = new Rng(seed);
  const km2 = ((2 * CITY_HALF_M) / 1000) ** 2;
  const spot = () => moved(0, 0, [rng.randfRange(-CITY_HALF_M, CITY_HALF_M), rng.randfRange(-CITY_HALF_M, CITY_HALF_M)]);
  const food = Array.from({ length: Math.round(FOOD_PER_KM2 * km2) }, (_, i) => {
    const [lat, lon] = spot();
    return { name: `food ${i}`, class: "restaurant", subclass: "", rank: 1, lat, lon };
  });
  const doors = Array.from({ length: Math.round(DOORS_PER_KM2 * km2) }, (_, i) => {
    const [lat, lon] = spot();
    return { street: "", number: String(i), lat, lon };
  });
  return { food, doors };
}

export type Run = {
  /** Minutes of play at each buy of each upgrade: speed[0] is the first speed upgrade. */
  bought: Record<string, number[]>;
  /** Minutes of play at each delivery. */
  delivered: number[];
};

/** Plays `hours`; returns when things happened. */
export function play(seed: number, hours: number): Run {
  const rng = new Rng(seed);
  const { food, doors } = city(seed + 1000);
  const s = new Stats();
  let here: LatLon = [0, 0];
  let sec = 0;
  const run: Run = { bought: Object.fromEntries(UPGRADES.map((u) => [u.id, []])), delivered: [] };
  const near = (list: { lat: number; lon: number }[]) => list.filter((p) => Math.abs(p.lat - here[0]) < 0.015 && Math.abs(p.lon - here[1]) < 0.02);
  while (sec < hours * 3600) {
    sec += waitS(rng, waitX(s.upgrades));
    here = moved(here[0], here[1], [rng.randfRange(-WANDER_SPREAD_M, WANDER_SPREAD_M), rng.randfRange(-WANDER_SPREAD_M, WANDER_SPREAD_M)]);
    const o = makeOrder(rng, here, near(food) as Place[], near(doors) as Home[]);
    if (!o) break;
    const mps = BIKE_MPS * speedX(s.upgrades);
    const rideM = (distanceM(here[0], here[1], o.from.lat, o.from.lon) + o.dropM) * ROUTE_FACTOR;
    sec += rideM / mps;
    s.deliver(o.cents);
    run.delivered.push(sec / 60);
    here = [o.to.lat, o.to.lon];
    // He buys the cheapest open upgrade, as often as he can afford one.
    for (;;) {
      const u = UPGRADES.filter((x) => isOpen(x, s.upgrades)).sort((a, b) => priceOf(a, s.upgrades) - priceOf(b, s.upgrades))[0];
      if (!u || !s.buy(u)) break;
      run.bought[u.id]!.push(sec / 60);
    }
  }
  return run;
}

const median = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)]! : NaN;
};

/** Over `seeds` runs: median minutes to the n-th buy of upgrade `id` (Infinity when most runs never got there), and to the n-th delivery. */
export function summary(seeds = 15, hours = 6) {
  const runs = Array.from({ length: seeds }, (_, i) => play(i + 1, hours));
  const at = (id: string, n: number) => median(runs.map((r) => r.bought[id]![n - 1] ?? Infinity));
  /** Minutes to the n-th upgrade of any kind. */
  const buys = (n: number) => median(runs.map((r) => Object.values(r.bought).flat().sort((a, b) => a - b)[n - 1] ?? Infinity));
  const delivery = (n: number) => median(runs.map((r) => r.delivered[n - 1] ?? Infinity));
  return { at, buys, delivery, runs };
}
