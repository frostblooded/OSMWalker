// Time away: the game doesn't live through it while closed. On reopen he gets
// a boost instead, BOOST times as fast for a while, long enough that he ends up
// as far along as if the game had stayed open. Time away has no cap, and a
// boost left over from before adds to the new one.

/** How much faster the game runs while boosted. */
export const BOOST = 10;
/** Shorter absences give no boost. */
export const MIN_AWAY_S = 60;

/** Real seconds of boost that `awayS` seconds away earn (at least MIN_AWAY_S, see Game.wake): the missed time, made up at BOOST x. */
export function boostFor(awayS: number): number {
  return awayS / (BOOST - 1);
}
