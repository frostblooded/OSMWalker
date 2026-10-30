// How tall a dragged sheet ends up: where the finger let go, as a share of
// the screen, no taller than its tallest, or closed when let go below CLOSE_AT.

/** A sheet's tallest share of the screen; a full sheet's is the whole screen. */
export const TALL = 0.6;
/** Let go below this share of the screen, a sheet closes. */
export const CLOSE_AT = 0.3;

export function settle(heightPx: number, screenPx: number, full: boolean): number | "close" {
  const share = heightPx / screenPx;
  if (share < CLOSE_AT) return "close";
  return Math.min(share, full ? 1 : TALL);
}
