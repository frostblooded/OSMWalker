// Food delivery orders: while he wanders, an order comes now and then (on
// average after ORDER_WAIT_S of wandering, less with upgrades). He takes it
// on his own: first to a real food place near him, then to a customer at a
// real house number near that. It pays a base fee plus a rate per km from the
// restaurant to the door; the walk to the restaurant is unpaid. Pure logic.
import { distanceM, type LatLon } from "./geo";
import type { Rng } from "./rng";
import type { Place } from "./stats";

/** Seconds of wandering before an order, on average at the start. */
export const ORDER_WAIT_S = 60;
/** The shortest wait, so a quick order still feels like one. */
export const MIN_WAIT_S = 3;
/** Pay: a base fee plus this per km of the drop (the ride along the streets, taken as ROUTE_FACTOR times the straight line). */
export const BASE_CENTS = 200;
export const CENTS_PER_KM = 100;
export const ROUTE_FACTOR = 1.3;
/** He picks up at one of the NEAREST_FOOD food places nearest him. */
export const NEAREST_FOOD = 5;
/** The customer lives this far from the restaurant (straight line). */
export const DROP_MIN_M = 300;
export const DROP_MAX_M = 1500;
/** Classes of the tiles' POI layer that cook food. */
export const FOOD = new Set(["restaurant", "fast_food", "cafe", "bakery", "ice_cream", "pizza"]);

/** A door he delivers to: a real house number, and the street it is on (or just the street, where the map has no numbers). */
export type Home = { street: string; number: string; lat: number; lon: number };
export type Order = { from: Place; to: Home; cents: number; dropM: number; picked: boolean };

/** "Vitosha Blvd 12", "a door on Vitosha Blvd" or "a door nearby". */
export const addressOf = (h: Home) => (h.number ? `${h.street ? `${h.street} ` : "No. "}${h.number}` : h.street ? `a door on ${h.street}` : "a door nearby");

/** What an order pays for a drop `dropM` meters (straight line) from the restaurant, rounded to 10 cents. */
export const payOf = (dropM: number) => Math.round((BASE_CENTS + (CENTS_PER_KM * dropM * ROUTE_FACTOR) / 1000) / 10) * 10;

/** Seconds until the next order: random around the mean, which `waitX` (his upgrades) shortens. */
export const waitS = (rng: Rng, waitX = 1) => Math.max(MIN_WAIT_S, -Math.log(1 - rng.randf()) * ORDER_WAIT_S * waitX);

const near = <T extends { lat: number; lon: number }>(list: readonly T[], at: LatLon) =>
  list.map((p) => ({ p, d: distanceM(at[0], at[1], p.lat, p.lon) })).sort((a, b) => a.d - b.d);

/**
 * A new order where he stands: a food place among the nearest (any place of
 * note where none cooks), and a door DROP_MIN_M to DROP_MAX_M from it (the
 * nearest one past DROP_MIN_M when none is in that ring). Null with no place
 * or door loaded.
 */
export function makeOrder(rng: Rng, here: LatLon, places: readonly Place[], homes: readonly Home[]): Order | null {
  const food = places.filter((p) => FOOD.has(p.class));
  const pool = near(food.length ? food : places, here).slice(0, NEAREST_FOOD);
  if (!pool.length || !homes.length) return null;
  const from = rng.pick(pool).p;
  const doors = near(homes, [from.lat, from.lon]);
  const ring = doors.filter((h) => h.d >= DROP_MIN_M && h.d <= DROP_MAX_M);
  const to = ring.length ? rng.pick(ring) : (doors.find((h) => h.d >= DROP_MIN_M) ?? doors.at(-1)!);
  return { from, to: to.p, cents: payOf(to.d), dropM: to.d, picked: false };
}

/** The door as a place he can walk to. */
export const homePlace = (h: Home): Place => ({ name: addressOf(h), class: "home", subclass: "", rank: 99, lat: h.lat, lon: h.lon });

/** True for a saved order of the right shape. */
export function isOrder(o: unknown): o is Order {
  const v = o as Order;
  const at = (p: { lat: unknown; lon: unknown } | undefined) => !!p && typeof p.lat === "number" && typeof p.lon === "number";
  return !!v && typeof v === "object" && at(v.from) && typeof v.from.name === "string" && at(v.to) && typeof v.to.street === "string" && typeof v.to.number === "string" && typeof v.cents === "number" && typeof v.dropM === "number" && typeof v.picked === "boolean";
}

/** His job right now: the order he is on, or the seconds of wandering left before the next one comes. */
export class Job {
  order: Order | null = null;
  waitLeftS = ORDER_WAIT_S;

  toJSON() {
    return { order: this.order, wait_left_s: this.waitLeftS };
  }

  static fromJSON(d: unknown): Job {
    const j = new Job();
    const v = (d ?? {}) as { order?: unknown; wait_left_s?: unknown };
    if (isOrder(v.order)) j.order = v.order;
    if (typeof v.wait_left_s === "number" && v.wait_left_s >= 0) j.waitLeftS = v.wait_left_s;
    return j;
  }
}
