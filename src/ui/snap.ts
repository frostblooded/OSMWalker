// Where a dragged sheet settles: tall, half or just its title bar, as shares
// of the screen, or closed when dragged below half its title bar.
export type Snap = "tall" | "half" | "peek";

/** Heights as shares of the screen; a full sheet's tall is the whole screen. */
export const TALL = 0.6;
export const HALF = 0.35;

export function snapTo(heightPx: number, screenPx: number, headPx: number, full: boolean): Snap | "close" {
  if (heightPx < headPx / 2) return "close";
  const stops: [Snap, number][] = [
    ["tall", (full ? 1 : TALL) * screenPx],
    ["half", HALF * screenPx],
    ["peek", headPx],
  ];
  let best = stops[0]!;
  for (const s of stops) if (Math.abs(s[1] - heightPx) < Math.abs(best[1] - heightPx)) best = s;
  return best[0];
}
