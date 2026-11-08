// Dice for goals: random spots near him (at a medium walking distance, more
// often ahead along his last leg than behind) for when no place can be
// offered, and a weighted pick for the cards. Pure functions.
import { moved, type BBox, type LatLon } from "./geo";
import type { Rng } from "./rng";

/** Random spots are most often this far away, falling off smoothly on a log scale both ways. */
export const GOAL_PEAK_M = 200;
export const GOAL_SPREAD = 0.6;
/** A spot straight ahead (along his last leg) is this many times as likely as one straight behind. */
export const HEADING_RATIO = 3;
/** Tries at a random spot near and ahead of him before taking any spot in the box. */
export const SPOT_TRIES = 30;

export type Vec = [number, number];

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

/** A spot in `box` at a medium distance, more likely ahead; anywhere in the box when `here` is null or out of luck. */
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

