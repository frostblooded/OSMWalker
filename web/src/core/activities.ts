// What he can do at each kind of place, from data/actions.json, keyed by
// "class/subclass" or "class" of the tiles' POI layer, with "_generic" for
// places we have no actions for yet and "_spot" for random spots.
// data/flavour.json adds each country's own actions (by its code in
// data/cities.tsv) under the same keys; they join the usual ones there.
// Picks an action he can do, leaning towards what he needs.
import type { Action, Place, Stats } from "./stats";

export type ActionTable = Record<string, Action[]>;

/** Every action takes this many minutes, whatever its listed time, so he is never still for long. */
export const MAX_MINUTES = 1;
/** Below this many coins he looks for work and avoids spending. */
export const SKINT = 20;
/** Extra weight for paid work, and the cut to spending, while he saves for a trip. */
export const SAVING_EARN_WEIGHT = 4;
export const SAVING_SPEND_MULT = 0.5;
/** Extra weight for a country's own actions, so they come up often. */
export const FLAVOUR_WEIGHT = 2;
/** Below this a meter is a need: places that refill it pull his next goal towards them. */
export const NEED_AT = 40;
/** A place that meets an empty need weighs 1 + NEED_BOOST times as much as his goal. */
export const NEED_BOOST = 4;

export class Activities {
  data: ActionTable;
  flavour: Record<string, ActionTable> = {};
  /** "class/subclass" -> places with no actions yet. */
  unknown: Record<string, { count: number; example: string }> = {};

  constructor(data: ActionTable = {}, flavour: Record<string, ActionTable> = {}) {
    this.data = data;
    for (const [code, table] of Object.entries(flavour)) {
      this.flavour[code] = {};
      for (const [key, list] of Object.entries(table)) this.flavour[code][key] = list.map((a) => ({ ...a, flavour: true }));
    }
  }

  /** Actions for `place` (null for a random spot) in `country`. */
  forPlace(place: Partial<Place> | null, country = ""): Action[] {
    return [...this.usual(place), ...local(place, this.flavour[country] ?? {})];
  }

  /** Like forPlace, without noting places that have no actions of their own yet. */
  peek(place: Partial<Place> | null, country = ""): Action[] {
    return [...this.usual(place, false), ...local(place, this.flavour[country] ?? {})];
  }

  private usual(place: Partial<Place> | null, note = true): Action[] {
    const keys = keysOf(place);
    for (const k of keys) if (this.data[k]) return this.data[k];
    if (!place) return [];
    if (!note) return this.data._generic ?? [];
    const u = (this.unknown[keys[0]!] ??= { count: 0, example: place.name ?? "" });
    u.count++;
    return this.data._generic ?? [];
  }
}

function keysOf(place: Partial<Place> | null): string[] {
  if (!place) return ["_spot"];
  return [`${place.class ?? ""}/${place.subclass ?? ""}`, place.class ?? ""];
}

function local(place: Partial<Place> | null, table: ActionTable): Action[] {
  for (const k of keysOf(place)) if (table[k]) return table[k];
  return [];
}

/** How much he wants to do `action` now. */
export function weight(action: Action, stats: Stats): number {
  let w = 1 + (action.flavour ? FLAVOUR_WEIGHT : 0);
  for (const [m, v] of Object.entries(action.fx ?? {})) {
    if (m in stats.meters && v > 0) w += ((Math.max(60 - stats.meters[m as keyof Stats["meters"]], 0) / 20) * Math.min(v, 50)) / 20;
  }
  if (action.item) w += stats.coins > 3 * SKINT ? 1 : 0;
  if (action.sell) w += 2;
  if (action.earn !== undefined) w += stats.coins < SKINT ? 3 : 0.5;
  if (action.cost !== undefined && stats.coins - action.cost < SKINT) w *= 0.5;
  if (stats.coins < stats.savingFor) {
    if (action.earn !== undefined) w += SAVING_EARN_WEIGHT;
    if (action.cost !== undefined || action.item) w *= SAVING_SPEND_MULT;
  }
  return w;
}

/**
 * How much a place with `actions` pulls his next goal: 1, up to 1 + NEED_BOOST
 * when one of them refills a meter that is empty, or pays while he is broke
 * or saving up. The strongest need counts.
 */
export function needWeight(actions: Action[], stats: Stats): number {
  const broke = stats.coins < SKINT || stats.coins < stats.savingFor;
  let need = 0;
  for (const a of actions) {
    if (broke && a.earn !== undefined) need = 1;
    for (const [m, v] of Object.entries(a.fx ?? {})) {
      if (v > 0 && m in stats.meters) need = Math.max(need, Math.max(NEED_AT - stats.meters[m as keyof Stats["meters"]], 0) / NEED_AT);
    }
  }
  return 1 + NEED_BOOST * need;
}

/** One of `actions` he can do at `hour`, picked by weight with r in [0, 1), or null. */
export function choose(actions: Action[], stats: Stats, hour: number, r: number): Action | null {
  const options = actions.filter((a) => stats.canDo(a, hour));
  const weights = options.map((a) => weight(a, stats));
  r *= weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < options.length; i++) {
    r -= weights[i]!;
    if (r < 0) return options[i]!;
  }
  return options.at(-1) ?? null;
}

export function restMinutes(_action: Action): number {
  return MAX_MINUTES;
}
