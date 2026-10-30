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
};

export function optionFor(m: Moment, id: string): MomentOption {
  const o = m.options.find((x) => x.id === id);
  if (!o) throw new Error(`moment ${m.id} has no option ${id}`);
  return o;
}

/** His own pick when you don't choose: `default`, or the first option with odds that grow with his `lean` attribute. */
export function defaultPick(m: Moment, stats: Stats, rng: Rng): string {
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
