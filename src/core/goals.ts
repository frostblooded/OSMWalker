// How the walker weighs his next goal: places of note by importance, by a
// medium walking distance and by lying ahead along his last leg, times how
// well they meet his needs; random spots are drawn with the same distance
// and heading odds. With an urgent need only places that fix it count, and
// the nearest of them wins. Pure functions, used by the walker.
import { distanceM, moved, offsetM, type BBox } from "./geo";
import type { Rng } from "./rng";
import type { Meter, Place } from "./stats";
import type { LatLon } from "./trips";

/** Goals this far away weigh most; the weight falls off smoothly on a log scale both ways. */
export const GOAL_PEAK_M = 200;
export const GOAL_SPREAD = 0.6;
/** A goal straight ahead (along his last leg) weighs this many times one straight behind. */
export const HEADING_RATIO = 3;
/** Tries at a random spot near and ahead of him before taking any spot in the box. */
export const SPOT_TRIES = 30;
/** With an urgent need, a fix this close or closer weighs most; one twice as far weighs a quarter as much. */
export const URGENT_NEAR_M = 100;

export type Vec = [number, number];
export type NeedKey = Meter | "money" | "bag";
/**
 * How a place meets his needs (see activities.ts needOf): its pull (1 = not at
 * all), whether it fixes an urgent need, or one at rock bottom, and the need it
 * meets most.
 */
export type Need = { pull: number; urgent: boolean; bottom: boolean; why: NeedKey | "" };
export const NO_NEED: Need = { pull: 1, urgent: false, bottom: false, why: "" };
/** With an urgent need that isn't at rock bottom, the odds he does as he likes anyway. */
export const URGENT_SLIP = 0.1;

/**
 * Which of `needs` an urgent need leaves in this pick (null: all of them),
 * given `r` uniform in [0, 1), and `r` stretched back to [0, 1) for the pick
 * itself. With a fix for a need at rock bottom, only such fixes, every time;
 * otherwise only urgent fixes, but for URGENT_SLIP of the time.
 */
export function urgentRules(needs: Pick<Need, "urgent" | "bottom">[], r: number): [((n: Pick<Need, "urgent" | "bottom">) => boolean) | null, number] {
  if (needs.some((n) => n.bottom)) return [(n) => n.bottom, r];
  if (!needs.some((n) => n.urgent)) return [null, r];
  return r < URGENT_SLIP ? [null, r / URGENT_SLIP] : [(n) => n.urgent, (r - URGENT_SLIP) / (1 - URGENT_SLIP)];
}
export type Weights = { rank_w: number; dist_m: number; dist_w: number; heading_w: number; need_w: number; weight: number; urgent?: true };

const rankWeight = (p: Place) => 1 / Math.max(Math.trunc(p.rank ?? 1), 1);

/** 1 at GOAL_PEAK_M, falling off smoothly (log-normal) nearer and further. */
export function distanceWeight(dM: number): number {
  const x = Math.log(Math.max(dM, 1) / GOAL_PEAK_M) / GOAL_SPREAD;
  return Math.exp(-0.5 * x * x);
}

/** With an urgent need: 1 within URGENT_NEAR_M, falling with the square of the distance beyond, so the nearest fix wins. */
export function nearWeight(dM: number): number {
  const x = URGENT_NEAR_M / Math.max(dM, URGENT_NEAR_M);
  return x * x;
}

/** 1 sideways, more ahead along `heading` (a unit vector), less behind, ahead / behind = HEADING_RATIO. */
export function headingWeight(heading: Vec, to: Vec): number {
  const len = Math.hypot(to[0], to[1]);
  if ((heading[0] === 0 && heading[1] === 0) || len === 0) return 1;
  const a = (HEADING_RATIO - 1) / (HEADING_RATIO + 1);
  return 1 + (a * (heading[0] * to[0] + heading[1] * to[1])) / len;
}

/** Index into `weights` picked with those odds; `r` is uniform in [0, 1). -1 when empty. */
export function pickIndex(weights: number[], r: number): number {
  r *= weights.reduce((a, w) => a + w, 0);
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]!;
    if (r < 0) return i;
  }
  return weights.length - 1;
}

/**
 * How much `p` weighs as his next goal from `here` (null: no position yet), and
 * why. `urgent`: he has an urgent need that `p` fixes, so rank and heading drop
 * out and the nearest fix wins.
 */
export function weigh(p: Place, here: LatLon | null, heading: Vec, needW = 1, urgent = false): Weights {
  const rank_w = urgent ? 1 : rankWeight(p);
  const u = urgent ? ({ urgent: true } as const) : {};
  if (!here) return { rank_w, dist_m: 0, dist_w: 1, heading_w: 1, need_w: needW, weight: rank_w * needW, ...u };
  const dist_m = distanceM(here[0], here[1], p.lat, p.lon);
  const dist_w = urgent ? nearWeight(dist_m) : distanceWeight(dist_m);
  const heading_w = urgent ? 1 : headingWeight(heading, offsetM(here[0], here[1], p.lat, p.lon));
  return { rank_w, dist_m, dist_w, heading_w, need_w: needW, weight: rank_w * dist_w * heading_w * needW, ...u };
}

/** A spot in `box`, drawn with the same distance and heading odds as places; anywhere in the box when `here` is null or out of luck. */
export function randomSpot(rng: Rng, box: BBox, here: LatLon | null, heading: Vec): LatLon {
  if (here) {
    const top = headingWeight(heading, heading);
    for (let i = 0; i < SPOT_TRIES; i++) {
      const a = rng.randf() * 2 * Math.PI;
      const dir: Vec = [Math.cos(a), Math.sin(a)];
      if (rng.randf() * top > headingWeight(heading, dir)) continue;
      const d = GOAL_PEAK_M * Math.exp(GOAL_SPREAD * rng.randfn());
      const p = moved(here[0], here[1], [dir[0] * d, dir[1] * d]);
      if (p[0] >= box[0] && p[0] <= box[2] && p[1] >= box[1] && p[1] <= box[3]) return p;
    }
  }
  return [rng.randfRange(box[0], box[2]), rng.randfRange(box[1], box[3])];
}

