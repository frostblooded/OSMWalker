// The economy simulation: plays the base loop for some hours in a made-up
// city, with the game's own dealing, rewards, levels and upgrades, so we know
// when each upgrade lands before anyone plays. Run `npm run sim` for the
// table; tests/unit/economy.test.ts checks the targets.
import { deal, type Offer } from "../../src/core/cards";
import { distanceM, moved, type LatLon } from "../../src/core/geo";
import { Rng } from "../../src/core/rng";
import { Stats, visitKey, xpToNext, type Place } from "../../src/core/stats";
import { LADDER, nextUpgrade, powers, shopFor, upgradeOf, type UpgradeId } from "../../src/core/upgrades";
import { WALK_MPS } from "../../src/core/walker";

/** Places per km² in the made-up city, by class/subclass: a mid-sized European centre. */
export const DENSITY: Record<string, number> = {
  "cafe/cafe": 10, "restaurant/restaurant": 8, "fast_food/fast_food": 4, "bar/bar": 3, "bakery/bakery": 3, "grocery/supermarket": 3,
  "clothing_store/clothes": 4, "pharmacy/pharmacy": 2, "hairdresser/hairdresser": 2, "office/company": 2,
  "shop/books": 0.4, "shop/kiosk": 0.6, "shop/gift": 1, "shop/mobile_phone": 1, "bicycle/bicycle": 0.25, "shop/sports": 0.4, "shop/motorcycle": 0.1, "car/car": 0.3,
  "post/post_office": 0.4, "library/library": 0.2,
  "museum/museum": 0.6, "monument/monument": 0.8, "memorial/memorial": 0.8, "place_of_worship/place_of_worship": 1.5, "attraction/attraction": 0.6, "theatre/theatre": 0.3, "art_gallery/art_gallery": 0.3, "fountain/fountain": 0.3,
  "park/park": 2, "garden/garden": 0.5, "playground/playground": 1,
  "railway/station": 0.15, "railway/subway": 0.3, "bus/bus_station": 0.05,
};
/** The city's half size, and how far around him places are loaded (the game's 3 x 3 street cells). */
export const CITY_HALF_M = 5000;
export const LOADED_HALF_M = 2700;
/** Seconds the player takes to pick, on top of the walk. */
export const PICK_S = 10;
/** What an XP is worth in cents to the greedy player once the next upgrade has all it needs; a metro ride to fresh places, as a share of what the next upgrade needs. */
export const XP_CENTS = 10;
export const METRO_WORTH = 0.2;

/** XP he still needs to reach `level`. */
function xpToReach(s: Stats, level: number): number {
  let need = -s.xp;
  for (let l = s.level; l < level; l++) need += xpToNext(l);
  return need;
}

export type Strategy = "greedy" | "random";
export type Run = {
  /** Minutes of play when each upgrade was bought. */
  bought: Partial<Record<UpgradeId, number>>;
  /** Minutes of play when each level was reached. */
  levels: number[];
  picks: number;
  /** Average minutes from one pick to the next. */
  walkMin: number;
  /** Picks of each slot. */
  slots: Record<string, number>;
};

export function city(seed: number): Place[] {
  const rng = new Rng(seed);
  const km2 = ((2 * CITY_HALF_M) / 1000) ** 2;
  const out: Place[] = [];
  for (const [k, per] of Object.entries(DENSITY)) {
    const [cls, sub] = k.split("/") as [string, string];
    const n = Math.round(per * km2 * rng.randfRange(0.7, 1.3));
    for (let i = 0; i < n; i++) {
      const [lat, lon] = moved(0, 0, [rng.randfRange(-CITY_HALF_M, CITY_HALF_M), rng.randfRange(-CITY_HALF_M, CITY_HALF_M)]);
      out.push({ name: `${sub} ${i}`, class: cls, subclass: sub, rank: Math.min(1 + Math.floor(-Math.log(1 - rng.randf()) * 2), 9), lat, lon });
    }
  }
  return out;
}

/** Plays `hours` with `strategy`; returns when things happened. */
export function play(seed: number, strategy: Strategy, hours: number): Run {
  const rng = new Rng(seed);
  const places = city(seed + 1000);
  const s = new Stats();
  let here: LatLon = [0, 0];
  let recent: string[] = [];
  let sec = 0;
  let picks = 0;
  const run: Run = { bought: {}, levels: [], picks: 0, walkMin: 0, slots: {} };
  // The greedy player goes for what the next upgrade still waits on (XP to its level, money to its price), per second of his time.
  const value = (o: Offer) => {
    if (o.upgrade) return Infinity;
    if (o.slot === "train") return -1;
    const next = nextUpgrade(s.upgrades);
    const share = (got: number, left: number) => (left > 0 ? Math.min(got, left) / left : 0);
    const needs = next ? share(o.reward.xp, xpToReach(s, next.level)) + share(o.reward.cents, next.cents - s.cents) : 0;
    const worth = o.slot === "metro" ? METRO_WORTH : needs + 1e-7 * (o.reward.cents + o.reward.xp * XP_CENTS);
    return worth / (PICK_S + o.walkM / (WALK_MPS * powers(s.upgrades).speedX));
  };
  while (sec < hours * 3600) {
    const near = places.filter((p) => Math.abs(distanceM(here[0], 0, p.lat, 0)) < LOADED_HALF_M && Math.abs(distanceM(0, here[1], 0, p.lon)) < LOADED_HALF_M);
    const offer = deal(near, here, { rng, isNew: (p) => s.isNew(p), recent: new Set(recent), powers: powers(s.upgrades), shop: shopFor(s.upgrades, s.level, s.cents) });
    if (!offer.length) break;
    const card = strategy === "random" ? rng.pick(offer) : offer.reduce((a, b) => (value(b) > value(a) ? b : a));
    picks++;
    run.slots[card.slot] = (run.slots[card.slot] ?? 0) + 1;
    recent = [...recent, visitKey(card.place)].slice(-6);
    sec += PICK_S + card.walkM / (WALK_MPS * powers(s.upgrades).speedX);
    const level = s.level;
    const end = card.to && card.slot === "parcel" ? card.to : card.place;
    s.reach(end, card.reward);
    for (let l = level + 1; l <= s.level; l++) run.levels[l] = sec / 60;
    const u = card.upgrade && upgradeOf(card.upgrade);
    if (u && s.buy(u, card.place)) run.bought[u.id] = sec / 60;
    here = card.slot === "metro" && card.to ? [card.to.lat, card.to.lon] : [end.lat, end.lon];
  }
  run.picks = picks;
  run.walkMin = sec / 60 / Math.max(picks, 1);
  return run;
}

const median = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)]! : NaN;
};

/** Median minutes to each upgrade over `seeds` runs (NaN when most runs never got it). */
export function summary(strategy: Strategy, seeds = 15, hours = 8) {
  const runs = Array.from({ length: seeds }, (_, i) => play(i + 1, strategy, hours));
  const at = Object.fromEntries(LADDER.map((u) => [u.id, median(runs.filter((r) => r.bought[u.id] !== undefined).length > seeds / 2 ? runs.map((r) => r.bought[u.id] ?? Infinity) : [])])) as Record<UpgradeId, number>;
  const level = (l: number) => median(runs.map((r) => r.levels[l] ?? Infinity));
  return { at, level, walkMin: median(runs.map((r) => r.walkMin)), runs };
}
