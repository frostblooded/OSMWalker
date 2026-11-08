// The player's choice: where he goes next. Each time he stands at a place,
// CARDS places nearby are dealt as cards, each with its reward and how far it
// is: one close and small, one far and big, and one of another kind (or one
// he has never been to). Upgrades add cards (see upgrades.ts): a 4th card, a
// shop that sells the next upgrade, a never-seen sight, a parcel to deliver,
// a metro or a train ride. Places from his last few picks are left out. The
// reward is fixed when the card is dealt and lands when he gets there.
// Pure logic, so it is easy to test.
import { distanceM, type LatLon } from "./geo";
import { pickIndex } from "./goals";
import { kindOf, NEW_PLACE_XP, rewardOf, type Kind, type Reward } from "./places";
import type { Rng } from "./rng";
import { visitKey, type Place } from "./stats";
import { GUIDE_XP_X, isMetroStation, isTrainStation, METRO_MIN_M, PARCEL_PAY_X, powers, type Powers, type Upgrade, type UpgradeId } from "./upgrades";
import { ARRIVE_M, WALK_MPS } from "./walker";

/** Cards dealt at each stop, before the City map. */
export const CARDS = 3;
/** The close card is at most this far, the far card at least this far (straight line, on foot; a bike or scooter stretches both). */
export const CLOSE_MAX_M = 200;
export const FAR_MIN_M = 500;
/** Cards come from places at most this far (on foot); when too few are, from the nearest ones. */
export const REACH_M = 1200;
/** The nearest places dealt from when too few are in reach. */
export const NEAREST = 12;
/** A shop for the next upgrade is looked for this far at least, so the ladder goes on where shops are few. */
export const SHOP_REACH_M = 3000;
/** Streets wind: a walk is about this many times the straight line. */
export const ROUTE_FACTOR = 1.3;
/** His last picks, left out of new cards. */
export const RECENT = 6;

export type Slot = "close" | "far" | "other" | "shop" | "guide" | "parcel" | "metro" | "train";

export type Offer = {
  place: Place;
  /** What the place gives; null for a shop or station that gives nothing itself. */
  kind: Kind | null;
  slot: Slot;
  /** Straight line from where the card was dealt (for a parcel, by way of its pick-up). */
  distM: number;
  /** About how far he goes along the streets. */
  walkM: number;
  reward: Reward;
  isNew: boolean;
  /** A shop card: the upgrade it sells. */
  upgrade?: UpgradeId;
  /** A parcel's drop-off, or where the metro takes him. */
  to?: Place;
};

export type DealCtx = {
  rng: Rng;
  isNew: (p: Place) => boolean;
  recent: ReadonlySet<string>;
  /** What his upgrades let him do; none when left out. */
  powers?: Powers;
  /** The upgrade a shop card may sell (open by level and affordable). */
  shop?: Upgrade | null;
};

/** Walk minutes on foot for `walkM` metres, which is what a reward is worth. */
export const footMin = (walkM: number) => walkM / WALK_MPS / 60;

/** One card for `place` seen from `here`. */
export function offerFor(place: Place, here: LatLon, slot: Slot, isNew: boolean): Offer {
  const distM = distanceM(here[0], here[1], place.lat, place.lon);
  const walkM = distM * ROUTE_FACTOR;
  return { place, kind: kindOf(place), slot, distM, walkM, reward: rewardOf(place, footMin(walkM), isNew), isNew };
}

type Option = { p: Place; d: number };

const between = (a: Place, b: Place) => distanceM(a.lat, a.lon, b.lat, b.lon);

/** Deals up to CARDS cards (more with the City map) from `places` around `here`, nearest first; none when no place gives anything. */
export function deal(places: readonly Place[], here: LatLon, ctx: DealCtx): Offer[] {
  const pw = ctx.powers ?? powers(new Set());
  const reach = REACH_M * pw.reachX;
  // Every place he could go to, nearest first; `pool` those that give something.
  const all: Option[] = [];
  for (const p of places) {
    if (ctx.recent.has(visitKey(p))) continue;
    const d = distanceM(here[0], here[1], p.lat, p.lon);
    if (d > ARRIVE_M) all.push({ p, d });
  }
  all.sort((a, b) => a.d - b.d);
  const pool = all.filter((o) => kindOf(o.p));
  let left = pool.filter((o) => o.d <= reach);
  if (left.length < CARDS) left = pool.slice(0, NEAREST);
  const cards: Offer[] = [];
  const used = new Set<string>();
  const take = (c: Offer | null | undefined) => {
    if (!c || cards.length >= pw.cards || used.has(visitKey(c.place))) return;
    cards.push(c);
    used.add(visitKey(c.place));
    left = left.filter((x) => !used.has(visitKey(x.p)));
  };
  const card = (o: Option | undefined, slot: Slot) => (o ? offerFor(o.p, here, slot, ctx.isNew(o.p)) : null);
  // Notable places (rank 1 is the top of its tile) turn up more often.
  const pick = (list: Option[]) => (list.length ? list[pickIndex(list.map((o) => 1 / Math.max(Math.trunc(o.p.rank ?? 1), 1)), ctx.rng.randf())] : undefined);
  const fresh = (list: Option[]) => list.filter((o) => ctx.isNew(o.p));
  /** A shop or station card: it pays nothing itself, only the first-visit bonus. */
  const stop = (p: Place, slot: Slot): Offer => {
    const isNew = ctx.isNew(p);
    return { ...offerFor(p, here, slot, isNew), reward: { cents: 0, xp: isNew ? NEW_PLACE_XP : 0 } };
  };
  const nearest = (match: (p: Place) => boolean, within: number) => all.find((o) => o.d <= within && match(o.p) && !used.has(visitKey(o.p)));

  take(card(pick(left.filter((o) => o.d <= CLOSE_MAX_M * pw.reachX)) ?? left[0], "close"));
  take(card(pick(left.filter((o) => o.d >= FAR_MIN_M * pw.reachX)) ?? left.at(-1), "far"));
  if (!cards.length) return [];

  // The shop for the next upgrade comes first, then the upgrades' own cards in a random order.
  const shop = ctx.shop;
  if (shop) {
    // Its own kind of shop when one is fairly near, else the nearest that sells it.
    const nearM = FAR_MIN_M * pw.reachX;
    const o = [nearM, Math.max(reach, SHOP_REACH_M)].flatMap((r) => shop.sellers.map((m) => nearest(m, r))).find(Boolean);
    if (o) take({ ...stop(o.p, "shop"), upgrade: shop.id });
  }
  const extras: (() => Offer | null)[] = [];
  if (pw.guide)
    extras.push(() => {
      const c = card(pick(fresh(left.filter((o) => kindOf(o.p) === "sight"))), "guide");
      return c && { ...c, reward: { cents: 0, xp: (c.reward.xp - NEW_PLACE_XP) * GUIDE_XP_X + NEW_PLACE_XP } };
    });
  if (pw.parcels) extras.push(() => parcel(left, pw, ctx, pick));
  if (pw.metro)
    extras.push(() => {
      const st = nearest(isMetroStation, reach);
      const far = pool.filter((o) => o.d >= METRO_MIN_M);
      const to = pick(fresh(far)) ?? pick(far);
      return st && to ? { ...stop(st.p, "metro"), to: to.p } : null;
    });
  if (pw.train)
    extras.push(() => {
      const st = nearest(isTrainStation, reach);
      return st ? stop(st.p, "train") : null;
    });
  while (extras.length && cards.length < pw.cards) take(extras.splice(Math.floor(ctx.rng.randf() * extras.length), 1)[0]!());

  // The rest are of another kind than those dealt, a new place if there is one.
  while (cards.length < pw.cards && left.length) {
    const kinds = new Set(cards.map((c) => c.kind));
    const other = left.filter((o) => !kinds.has(kindOf(o.p)));
    take(card(pick(fresh(other)) ?? pick(other) ?? pick(fresh(left)) ?? pick(left), "other"));
  }
  return cards.sort((a, b) => a.distM - b.distM);
}

/** A parcel: picked up at a work place close by, paid PARCEL_PAY_X times the walk on to a work place farther off. */
function parcel(left: Option[], pw: Powers, ctx: DealCtx, pick: (l: Option[]) => Option | undefined): Offer | null {
  const work = left.filter((o) => kindOf(o.p) === "work");
  const from = pick(work.filter((o) => o.d <= CLOSE_MAX_M * pw.reachX)) ?? work[0];
  if (!from) return null;
  const to = pick(work.filter((o) => o !== from && between(from.p, o.p) >= FAR_MIN_M * pw.reachX));
  if (!to) return null;
  const legM = between(from.p, to.p);
  const distM = from.d + legM;
  // First visits to either place give their bonus, paid with the rest at the drop-off.
  const bonus = (ctx.isNew(from.p) ? NEW_PLACE_XP : 0) + (ctx.isNew(to.p) ? NEW_PLACE_XP : 0);
  const pay = rewardOf(to.p, footMin(legM * ROUTE_FACTOR), false).cents * PARCEL_PAY_X;
  return { place: from.p, kind: "work", slot: "parcel", distM, walkM: distM * ROUTE_FACTOR, reward: { cents: pay, xp: bonus }, isNew: bonus > 0, to: to.p };
}

/** True for a whole card, as a save should hold it. */
function isOffer(o: unknown): o is Offer {
  const c = o as Offer | null;
  return !!c && (c.to === undefined || (typeof c.to?.lat === "number" && typeof c.to.lon === "number")) && typeof c.place?.lat === "number" && typeof c.place.lon === "number" && typeof c.reward?.cents === "number" && typeof c.reward.xp === "number" && typeof c.distM === "number" && typeof c.walkM === "number";
}

/** The cards on offer, the one he is walking to and his last picks; saved with the game. */
export class Choice {
  offer: Offer[] = [];
  /** The card he is walking to, whose reward lands when he gets there. */
  going: Offer | null = null;
  /** visitKeys of his last RECENT picks. */
  recent: string[] = [];
  /** He stands at a station with a train card: he waits for the player to pick a city. */
  train = false;

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
    return { offer: this.offer, going: this.going, recent: this.recent, train: this.train };
  }

  static fromJSON(d: unknown): Choice {
    const c = new Choice();
    if (!d || typeof d !== "object") return c;
    const o = d as Partial<ReturnType<Choice["toJSON"]>>;
    if (Array.isArray(o.offer)) c.offer = o.offer.filter(isOffer);
    if (isOffer(o.going)) c.going = o.going;
    if (Array.isArray(o.recent)) c.recent = o.recent.filter((k) => typeof k === "string");
    c.train = o.train === true;
    return c;
  }
}
