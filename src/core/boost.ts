// Time away: the game doesn't live through it while closed. On reopen he gets
// a boost instead, BOOST times as fast for a while, long enough that he ends up
// as far along as if the game had stayed open. Time away has no cap, and a
// boost left over from before adds to the new one.

/** How much faster the game runs while boosted. */
export const BOOST = 10;
/** Shorter absences give no boost. */
export const MIN_AWAY_S = 60;

/** Real seconds of boost that `awayS` seconds away earn: the missed time, made up at BOOST x. */
export function boostFor(awayS: number): number {
  return awayS < MIN_AWAY_S ? 0 : awayS / (BOOST - 1);
}

/** `realS` seconds go by with `leftS` of boost: the game seconds they make, and the boost left after. */
export function spend(realS: number, leftS: number): { gameS: number; leftS: number } {
  const fast = Math.min(Math.max(realS, 0), Math.max(leftS, 0));
  return { gameS: fast * BOOST + (realS - fast), leftS: Math.max(leftS - fast, 0) };
}
