// Timed moments: a small choice or mini-game that may pop up when he does
// something (an activity, a trip, a story beat). You may tap an option; if
// you don't within the Settings timer, or the app is hidden or catching up,
// he takes the default. Effects stay with the caller: this file only says
// which option was picked.
import type { Rng } from "./rng";
import type { Attr, Stats } from "./stats";

/** How far his attribute tilts his own pick to the first option: this much a point above 1, up to LEAN_CAP. */
export const LEAN_PER_POINT = 0.05;
export const LEAN_CAP = 0.4;
/** Odds he takes a moment's `rascal` option by himself: RASCAL_BASE at even karma, RASCAL_PER_KARMA more a point of bad karma (less a point of good), within RASCAL_MIN to RASCAL_MAX, so a saint stays kind and a crook keeps at it, with a small chance to change. */
export const RASCAL_BASE = 0.1;
export const RASCAL_PER_KARMA = 0.008;
export const RASCAL_MIN = 0.02;
export const RASCAL_MAX = 0.9;

/** The mini-games a moment can be played as; without one it is a plain choice. */
export type GameId = "timing" | "cards" | "taps" | "odd";

export type MomentOption = { id: string; label: string };

export type Moment = {
  id: string;
  icon: string;
  ask: string;
  /** Played as this mini-game: its 0..1 score picks an option, so list options worst to best. */
  game?: GameId;
  /** He leans to the first option the higher this attribute; otherwise he takes `default`. */
  lean?: Attr;
  options: MomentOption[];
  /** The option he takes when you don't pick. */
  default: string;
  /** The rascal's option (rob, run): he takes it by himself with odds from his karma (see rascalOdds). */
  rascal?: string;
};

export function optionFor(m: Moment, id: string): MomentOption {
  const o = m.options.find((x) => x.id === id);
  if (!o) throw new Error(`moment ${m.id} has no option ${id}`);
  return o;
}

/** The odds he takes a `rascal` option by himself at karma `karma` (-100 to +100). */
export const rascalOdds = (karma: number) => Math.min(Math.max(RASCAL_BASE - RASCAL_PER_KARMA * karma, RASCAL_MIN), RASCAL_MAX);

/** His own pick when you don't choose: the `rascal` option by his karma, else `default`, or the first option with odds that grow with his `lean` attribute. */
export function defaultPick(m: Moment, stats: Stats, rng: Rng): string {
  if (m.rascal && rng.randf() < rascalOdds(stats.bond.lean)) return m.rascal;
  if (!m.lean) return m.default;
  const lean = Math.max(0, Math.min(LEAN_PER_POINT * (stats.attr(m.lean) - 1), LEAN_CAP));
  return rng.randf() < lean ? m.options[0]!.id : m.default;
}

/** The option a mini-game score (0 worst, 1 best) earns. */
export function scorePick(m: Moment, score: number): string {
  const n = m.options.length;
  const i = Math.min(n - 1, Math.max(0, Math.floor(score * n)));
  return m.options[i]!.id;
}
