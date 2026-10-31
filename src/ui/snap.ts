// How tall a dragged sheet ends up: where the finger let go, as a share of
// the screen, no taller than its tallest, or closed when let go below CLOSE_AT.
// A full sheet let go near the top fills the screen again, so its buttons
// don't end up under the phone's status bar.

/** A sheet's tallest share of the screen; a full sheet's is the whole screen. */
export const TALL = 0.6;
/** Let go below this share of the screen, a sheet closes. */
export const CLOSE_AT = 0.3;
/** A full sheet let go above this share fills the screen. */
export const FULL_AT = 0.9;

export function settle(heightPx: number, screenPx: number, full: boolean): number | "close" {
  const share = heightPx / screenPx;
  if (share < CLOSE_AT) return "close";
  if (full) return share > FULL_AT ? 1 : share;
  return Math.min(share, TALL);
}
