// The player's choice: where he goes next. Each time he stands at a place,
// CARDS places nearby are dealt as cards, each with its reward and how far it
// is: one close and small, one far and big, and one of another kind (or one
// he has never been to). Places from his last few picks are left out. The
// reward is fixed when the card is dealt and lands when he gets there.
// Pure logic, so it is easy to test.
import { distanceM, type LatLon } from "./geo";
import { pickIndex } from "./goals";
import { kindOf, rewardOf, type Kind, type Reward } from "./places";
import type { Rng } from "./rng";
import { visitKey, type Place } from "./stats";
import { ARRIVE_M, WALK_MPS } from "./walker";

/** Cards dealt at each stop. */
export const CARDS = 3;
/** The close card is at most this far, the far card at least this far (straight line). */
export const CLOSE_MAX_M = 400;
export const FAR_MIN_M = 800;
/** Cards come from places at most this far; when too few are, from the nearest ones. */
export const REACH_M = 1600;
/** The nearest places dealt from when too few are in reach. */
export const NEAREST = 12;
/** Streets wind: a walk is about this many times the straight line. */
export const ROUTE_FACTOR = 1.3;
/** His last picks, left out of new cards. */
export const RECENT = 6;

export type Slot = "close" | "far" | "other";

export type Offer = {
  place: Place;
  kind: Kind;
  slot: Slot;
  /** Straight line from where the card was dealt. */
  distM: number;
  /** About how far he walks there along the streets. */
  walkM: number;
  reward: Reward;
  isNew: boolean;
};

export type DealCtx = { rng: Rng; isNew: (p: Place) => boolean; recent: ReadonlySet<string> };

/** Walk minutes on foot for `walkM` metres, which is what a reward is worth. */
export const footMin = (walkM: number) => walkM / WALK_MPS / 60;

/** One card for `place` seen from `here`. */
export function offerFor(place: Place, here: LatLon, slot: Slot, isNew: boolean): Offer {
  const distM = distanceM(here[0], here[1], place.lat, place.lon);
  const walkM = distM * ROUTE_FACTOR;
  return { place, kind: kindOf(place)!, slot, distM, walkM, reward: rewardOf(place, footMin(walkM), isNew), isNew };
}

type Option = { p: Place; d: number };

/** Deals up to CARDS cards from `places` around `here`, nearest first; none when no place gives anything. */
export function deal(places: readonly Place[], here: LatLon, ctx: DealCtx): Offer[] {
  const pool: Option[] = [];
  for (const p of places) {
    if (!kindOf(p) || ctx.recent.has(visitKey(p))) continue;
    const d = distanceM(here[0], here[1], p.lat, p.lon);
    if (d > ARRIVE_M) pool.push({ p, d });
  }
  pool.sort((a, b) => a.d - b.d);
  let left = pool.filter((o) => o.d <= REACH_M);
  if (left.length < CARDS) left = pool.slice(0, NEAREST);
  const chosen: { o: Option; slot: Slot }[] = [];
  const take = (o: Option | undefined, slot: Slot) => {
    if (!o) return;
    chosen.push({ o, slot });
    left = left.filter((x) => x !== o);
  };
  // Notable places (rank 1 is the top of its tile) turn up more often.
  const pick = (list: Option[]) => (list.length ? list[pickIndex(list.map((o) => 1 / Math.max(Math.trunc(o.p.rank ?? 1), 1)), ctx.rng.randf())] : undefined);
  take(pick(left.filter((o) => o.d <= CLOSE_MAX_M)) ?? left[0], "close");
  take(pick(left.filter((o) => o.d >= FAR_MIN_M)) ?? left.at(-1), "far");
  const kinds = new Set(chosen.map((c) => kindOf(c.o.p)));
  const other = left.filter((o) => !kinds.has(kindOf(o.p)));
  const fresh = (list: Option[]) => list.filter((o) => ctx.isNew(o.p));
  take(pick(fresh(other)) ?? pick(other) ?? pick(fresh(left)) ?? pick(left), "other");
  return chosen
    .slice(0, CARDS)
    .sort((a, b) => a.o.d - b.o.d)
    .map(({ o, slot }) => offerFor(o.p, here, slot, ctx.isNew(o.p)));
}

/** The cards on offer, the one he is walking to and his last picks; saved with the game. */
export class Choice {
  offer: Offer[] = [];
  /** The card he is walking to, whose reward lands when he gets there. */
  going: Offer | null = null;
  /** visitKeys of his last RECENT picks. */
  recent: string[] = [];

  /** The player picks card `i`; returns it, or null when there is no such card. */
  take(i: number): Offer | null {
    const card = this.offer[i];
    if (!card) return null;
    this.going = card;
    this.offer = [];
    this.recent = [...this.recent.filter((k) => k !== visitKey(card.place)), visitKey(card.place)].slice(-RECENT);
    return card;
  }

  toJSON() {
    return { offer: this.offer, going: this.going, recent: this.recent };
  }

  static fromJSON(d: unknown): Choice {
    const c = new Choice();
    if (!d || typeof d !== "object") return c;
    const o = d as Partial<ReturnType<Choice["toJSON"]>>;
    if (Array.isArray(o.offer)) c.offer = o.offer;
    if (o.going && typeof o.going === "object") c.going = o.going;
    if (Array.isArray(o.recent)) c.recent = o.recent.filter((k) => typeof k === "string");
    return c;
  }
}
