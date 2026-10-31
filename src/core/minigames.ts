// The four mini-games a timed moment can be played as (moments.ts GameId),
// as pure rules; src/ui/MomentSheet.tsx draws them. Each scores 0 (worst)
// to 1 (best), and moments.ts scorePick turns the score into an option.
import type { Rng } from "./rng";

/** Timing: the marker sweeps across and back every SWEEP_S; stop it in the middle. */
export const SWEEP_S = 1.6;
/** Distance from the middle (0 to 0.5 of the bar) for a best and a middle score. */
export const BULL = 0.08;
export const NEAR = 0.25;

/** Where the timing marker is (0 to 1 across the bar) `t` seconds after the start. */
export function sweepAt(t: number): number {
  const x = (t / SWEEP_S) % 1;
  return x < 0.5 ? x * 2 : 2 - x * 2;
}

/** The timing score for stopping at bar position `at`. */
export function timingScore(at: number): number {
  const off = Math.abs(at - 0.5);
  return off <= BULL ? 1 : off <= NEAR ? 0.5 : 0;
}

/** Tap fast: TAPS taps scores best; fewer score their share. */
export const TAPS = 12;
export const tapScore = (taps: number) => Math.min(taps / TAPS, 1);

/** Pick a card: three face down, one each of worst, middle and best, in random order. */
export function deal(rng: Rng): number[] {
  const cards = [0, 0.5, 1];
  for (let i = cards.length - 1; i > 0; i--) {
    const j = rng.randiRange(0, i);
    [cards[i], cards[j]] = [cards[j]!, cards[i]!];
  }
  return cards;
}

/** Odd one out: icon pairs that look alike; ODD_CELLS icons, one of them the odd one. */
export const ODD_PAIRS: readonly [string, string][] = [["🍎", "🍏"], ["🐶", "🐱"], ["🌕", "🌖"], ["🔵", "🟣"], ["⭐", "🌟"], ["🍋", "🍌"], ["🐟", "🐠"], ["☕", "🍵"]];
export const ODD_CELLS = 6;
/** A wrong tap first leaves a middle score; a second wrong tap, the worst. */
export const oddScore = (misses: number) => (misses === 0 ? 1 : misses === 1 ? 0.5 : 0);

export function oddGrid(rng: Rng): { icons: string[]; odd: number } {
  const [same, other] = ODD_PAIRS[rng.randiRange(0, ODD_PAIRS.length - 1)]!;
  const odd = rng.randiRange(0, ODD_CELLS - 1);
  return { icons: Array.from({ length: ODD_CELLS }, (_, i) => (i === odd ? other : same)), odd };
}
