// Timed moments: a small choice or mini-game that may pop up when he does
// something (an activity, a trip, a story beat). You may tap an option; if
// you don't within the Settings timer, or the app is hidden or catching up,
// he takes the default. Effects stay with the caller: this file only says
// which option was picked.
import type { Rng } from "./rng";
import type { Attr, Stats } from "./stats";

/** Seconds a moment waits for your tap, by default; the Settings button steps through MOMENT_TIMERS (0 is Off: he always picks himself). */
export const MOMENT_S = 5;
export const MOMENT_TIMERS = [3, 5, 10, 20, 0] as const;

/** How far his attribute tilts his own pick to the first option: this much a point above 1, up to LEAN_CAP. */
export const LEAN_PER_POINT = 0.05;
export const LEAN_CAP = 0.4;
/** The odds a risky option works, and how much each point of its attribute above 1 adds, up to RISK_CAP. */
export const RISK_BASE = 0.5;
export const RISK_PER_POINT = 0.05;
export const RISK_CAP = 0.9;

/** The odds a risky option works with `points` of its attribute. */
export const riskOdds = (points: number) => Math.min(RISK_BASE + RISK_PER_POINT * Math.max(points - 1, 0), RISK_CAP);

/** The mini-games a moment can be played as; without one it is a plain choice. */
export type GameId = "timing" | "cards" | "taps" | "odd";

export type MomentOption = { id: string; label: string };
/** How a moment was settled: the option, and whether you tapped it (else he picked it himself). */
export type Pick = { id: string; you: boolean };

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

/** The attribute each mini-game leans on when nobody plays it, unless the moment names its own. */
export const GAME_ATTR: Record<GameId, Attr> = { timing: "cha", cards: "luck", taps: "str", odd: "wit" };

/** The odds his leaning attribute gives: LEAN_PER_POINT a point above 1, up to LEAN_CAP. */
function leanOdds(m: Moment, stats: Stats): number {
  const a = m.lean ?? (m.game && GAME_ATTR[m.game]);
  return a ? Math.max(0, Math.min(LEAN_PER_POINT * (stats.attr(a) - 1), LEAN_CAP)) : 0;
}

/**
 * His own pick when you don't choose. A choice: `default`, or the first
 * option with odds that grow with his `lean` attribute. A mini-game nobody
 * plays scores him a middle result (never the worst), or the best with the
 * same odds.
 */
export function defaultPick(m: Moment, stats: Stats, rng: Rng): string {
  const lean = leanOdds(m, stats);
  if (m.game) return rng.randf() < lean ? m.options.at(-1)!.id : m.options[Math.floor((m.options.length - 1) / 2)]!.id;
  return lean && rng.randf() < lean ? m.options[0]!.id : m.default;
}

/** The option a mini-game score (0 worst, 1 best) earns. */
export function scorePick(m: Moment, score: number): string {
  const n = m.options.length;
  const i = Math.min(n - 1, Math.max(0, Math.floor(score * n)));
  return m.options[i]!.id;
}
