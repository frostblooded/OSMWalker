// His day so far: each place he stopped at, with when, for the day ribbon
// under the top card. Only the newest MAX_STOPS are kept, so the save stays
// small however long he was away.
/** A stop: the place's "class/subclass" and unix seconds. */
export type Stop = { k: string; t: number };

export const MAX_STOPS = 60;
/** Most icons the ribbon shows; older ones today are counted as "+N". */
export const RIBBON = 12;

export function addStop(stops: Stop[], p: { class: string; subclass: string }, t: number): void {
  stops.push({ k: `${p.class}/${p.subclass}`, t });
  if (stops.length > MAX_STOPS) stops.splice(0, stops.length - MAX_STOPS);
}

/** Unix seconds of the last midnight before `t`, in a time zone `biasMin` minutes from UTC. */
export function dayStart(t: number, biasMin: number): number {
  const local = t + biasMin * 60;
  return local - (((local % 86400) + 86400) % 86400) - biasMin * 60;
}

/** Today's newest stops ("class/subclass"), oldest first, and how many earlier ones today don't fit. */
export function ribbon(stops: Stop[], now: number, biasMin: number): { kinds: string[]; more: number } {
  const from = dayStart(now, biasMin);
  const today = stops.filter((s) => s.t >= from);
  const shown = today.slice(-RIBBON);
  return {
    kinds: shown.map((s) => s.k),
    more: today.length - shown.length,
  };
}
