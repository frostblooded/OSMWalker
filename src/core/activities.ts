// What he can do at each kind of place, from data/actions.json, keyed by
// "class/subclass" or "class" of the tiles' POI layer, with "_generic" for
// places we have no actions for yet and "_spot" for random spots.
// data/flavour.json adds each country's own actions (by its code in
// data/cities.tsv) under the same keys; they join the usual ones there.
// On a public holiday the "_holiday" actions join every place's.
// Picks an action he can do, leaning towards what he needs.
import { KIND_DEED_WEIGHT } from "./bond";
import { urgentRules, type Need, type NeedKey } from "./goals";
import { toCents } from "./money";
import { SKILL_LEAN, SKILL_MAX } from "./skills";
import { ATTRS, visitKey, type Action, type Attr, type Meter, type Place, type Stats } from "./stats";

export type ActionTable = Record<string, Action[]>;

/** Every action takes this many minutes, whatever its listed time, so he is never still for long. */
export const MAX_MINUTES = 1;
/** Below this many cents (€20) he looks for work and avoids spending. */
export const SKINT = 2000;
/** The cut to spending while he saves for a trip or his next vehicle. */
export const SAVING_SPEND_MULT = 0.5;
/** Extra weight for browsing the shop of his next vehicle once he can afford it, and how much more that shop pulls his goal. */
export const GOAL_SHOP_WEIGHT = 4;
export const GOAL_SHOP_PULL = 200;
/** Extra weight for buying ingredients, so he cooks now and then (he only buys what a recipe lacks, see cooking.ts). */
export const GROCERIES_WEIGHT = 2;
/** Extra weight for a country's own actions, so they come up often. */
export const FLAVOUR_WEIGHT = 2;
/** Below this a meter is a need. Its urge is the square of how far below it is, so it is mild at first and steep near empty. */
export const NEED_AT = 40;
/** Below this a meter is urgent: if anything he can do nearby fixes it, he heads for that and does it, but for URGENT_SLIP of the time (see goals.ts). */
export const URGENT_AT = 15;
/** Below this a meter is at rock bottom: fixing it beats everything, every time. */
export const BOTTOM_AT = 5;
/** An empty need makes a place or action that meets it in full weigh 1 + NEED_BOOST times as much. */
export const NEED_BOOST = 49;
/** Raising a meter by this much or more meets its need in full; less meets it in part. */
export const FULL_FIX = 30;
/** Money's urge while he saves up for a trip or his next vehicle, at least. Broke, it grows like a meter's below SKINT. */
export const SAVING_URGE = 0.25;
/** Actions that train or need his best attribute weigh up to this many times as much (his attribute / his average). */
export const STRENGTH_MAX = 2;
/** A need this strong (half way below NEED_AT) or urgent shows in the feed when it picks his goal. */
export const SAY_URGE = 0.25;
/** How the feed names each need. */
export const NEED_WORDS: Record<NeedKey, string> = { fullness: "Hungry", thirst: "Thirsty", energy: "Tired", health: "Hurt", mood: "Glum", hygiene: "Grubby", money: "Short of money", bag: "Bag full" };

/** The feed line for a goal picked for `why`, or "" when the need is too mild to mention (or it is money, and he only saves up). */
export function needLine(why: NeedKey | "", pull: number, urgent: boolean, place: string, cents: number): string {
  if (!why || (!urgent && pull < 1 + NEED_BOOST * SAY_URGE) || (why === "money" && cents >= SKINT)) return "";
  return `${NEED_WORDS[why]}, heading for ${place}`;
}

/** An action that lowers a meter he needs weighs (1 - its urge) as much, but never less than this. */
export const HARM_FLOOR = 0.02;

const ATTR_KEYS = new Set<string>(ATTRS);

/** How badly he needs a meter at `value`: 0 at NEED_AT and above, up to 1 at 0. */
export function urge(value: number): number {
  const p = Math.min(Math.max((NEED_AT - value) / NEED_AT, 0), 1);
  return p * p;
}

/** How badly he needs money: grows like a meter's below SKINT, and is at least SAVING_URGE while he saves up. */
export function moneyUrge(stats: Stats): number {
  const p = Math.min(Math.max((SKINT - stats.cents) / SKINT, 0), 1);
  return Math.max(p * p, stats.saving() ? SAVING_URGE : 0);
}

/** How much `action` meets his needs (the sum over every need it meets), and which need it meets most. */
export function needScore(action: Action, stats: Stats): { score: number; why: NeedKey | "" } {
  let score = 0;
  let why: NeedKey | "" = "";
  let top = 0;
  const add = (k: NeedKey, s: number) => {
    score += s;
    if (s > top) [top, why] = [s, k];
  };
  for (const [m, v] of Object.entries(action.fx ?? {})) {
    if (v > 0 && m in stats.meters) add(m as Meter, (urge(stats.felt(m as Meter)) * Math.min(v, FULL_FIX)) / FULL_FIX);
  }
  if (action.earn !== undefined) add("money", moneyUrge(stats));
  if (action.resale && stats.bagFull()) add("bag", 1);
  return { score, why };
}

/** True when `action` raises a meter that is under `below` (URGENT_AT by default). */
export function fixesUrgent(action: Action, stats: Stats, below = URGENT_AT): boolean {
  for (const [m, v] of Object.entries(action.fx ?? {})) if (v > 0 && m in stats.meters && stats.felt(m as Meter) < below) return true;
  return false;
}

/** 1, up to STRENGTH_MAX for an action that trains or needs the attribute he is best at (that attribute over his average). */
export function strengthLean(action: Action, stats: Stats): number {
  let best = 0;
  for (const k of Object.keys(action.needs ?? {})) if (ATTR_KEYS.has(k)) best = Math.max(best, stats.attrs[k as Attr]);
  for (const [k, v] of Object.entries(action.fx ?? {})) if (v > 0 && ATTR_KEYS.has(k)) best = Math.max(best, stats.attrs[k as Attr]);
  if (!best) return 1;
  const avg = ATTRS.reduce((s, a) => s + stats.attrs[a], 0) / ATTRS.length;
  return avg > 0 ? Math.min(Math.max(best / avg, 1), STRENGTH_MAX) : 1;
}

/** (1 - urge) for each meter `action` lowers while he needs it, so he doesn't go jogging when he is worn out. */
function harm(action: Action, stats: Stats): number {
  let w = 1;
  for (const [m, v] of Object.entries(action.fx ?? {})) if (v < 0 && m in stats.meters) w *= 1 - urge(stats.felt(m as Meter));
  return Math.max(w, HARM_FLOOR);
}

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

  /** Actions for `place` (null for a random spot) in `country`, with the holiday ones on a public holiday. */
  forPlace(place: Partial<Place> | null, country = "", holiday = false): Action[] {
    return [...this.usual(place), ...local(place, this.flavour[country] ?? {}), ...this.festive(holiday)];
  }

  /** Like forPlace, without noting places that have no actions of their own yet. */
  peek(place: Partial<Place> | null, country = "", holiday = false): Action[] {
    return [...this.usual(place, false), ...local(place, this.flavour[country] ?? {}), ...this.festive(holiday)];
  }

  private festive(holiday: boolean): Action[] {
    return holiday ? (this.data._holiday ?? []) : [];
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

/** 1, up to 1 + SKILL_LEAN at SKILL_MAX, for an action that trains a skill he has. */
export function skillLean(action: Action, stats: Stats): number {
  return action.skill ? 1 + (SKILL_LEAN * stats.skills.level(action.skill)) / SKILL_MAX : 1;
}

/** How much he wants to do `action` now: a base weight times how much it meets his needs, how well it suits him (attributes and skills), and how little it hurts what he needs. */
export function weight(action: Action, stats: Stats): number {
  let w = 1 + (action.flavour ? FLAVOUR_WEIGHT : 0);
  if (action.item) w += stats.cents > 3 * SKINT ? 1 : 0;
  if (action.sell) w += 2;
  if (action.groceries) w += GROCERIES_WEIGHT;
  if (action.deed! > 0 && stats.bond.leaning() === "kind") w += KIND_DEED_WEIGHT;
  if (action.cost !== undefined && stats.cents - toCents(action.cost) < SKINT) w *= 0.5;
  if (stats.saving()) {
    if (action.cost !== undefined || action.item) w *= SAVING_SPEND_MULT;
  } else if (action.item && action.item === stats.vehicleGoal()?.kind) w += GOAL_SHOP_WEIGHT;
  return w * (1 + NEED_BOOST * needScore(action, stats).score) * strengthLean(action, stats) * skillLean(action, stats) * harm(action, stats);
}

/**
 * How much a place with `actions` pulls his next goal, counting only what he
 * can do at `hour`: the best of its actions' 1 + NEED_BOOST x need score,
 * times how well that action suits him. A shop that sells the vehicle he has
 * saved up for pulls GOAL_SHOP_PULL, which only an urgent need beats. With a
 * full bag, a resale shop meets a need in full, for a selling run.
 */
export function needOf(actions: Action[], stats: Stats, hour: number): Need {
  const saving = stats.saving();
  const shop = saving ? undefined : stats.vehicleGoal()?.kind;
  let pull = 1;
  let top = 0;
  let why: NeedKey | "" = "";
  let urgent = false;
  let bottom = false;
  let goalShop = false;
  for (const a of actions) {
    if (!stats.canDo(a, hour)) continue;
    if (shop && a.item === shop) goalShop = true;
    const s = needScore(a, stats);
    pull = Math.max(pull, (1 + NEED_BOOST * s.score) * strengthLean(a, stats));
    if (s.score > top) [top, why] = [s.score, s.why];
    urgent ||= fixesUrgent(a, stats);
    bottom ||= fixesUrgent(a, stats, BOTTOM_AT);
  }
  return { pull: goalShop ? GOAL_SHOP_PULL : pull, urgent, bottom, why };
}

/** `need` with its pull times how his wants and fears pull him to a place of `p`'s kind (see mind.ts). */
export function minded(need: Need, p: Pick<Place, "class">, stats: Stats): Need {
  const m = stats.mind.pull(p.class);
  return m === 1 ? need : { ...need, pull: need.pull * m };
}

/** True while any meter he feels (see Stats.felt) is under URGENT_AT, so he stays to fix it rather than set off on a trip. */
export function anyUrgent(stats: Stats): boolean {
  return (Object.keys(stats.meters) as Meter[]).some((m) => stats.felt(m) < URGENT_AT);
}

/** One of `actions` he can do at `hour`, picked by weight with `roll` in [0, 1), or null. With an urgent need, mostly only what fixes one (see urgentRules). */
export function choose(actions: Action[], stats: Stats, hour: number, roll: number): Action | null {
  let options = actions.filter((a) => stats.canDo(a, hour));
  const needs = options.map((a) => ({ urgent: fixesUrgent(a, stats), bottom: fixesUrgent(a, stats, BOTTOM_AT) }));
  const [keep, u] = urgentRules(needs, roll);
  let r = u;
  if (keep) options = options.filter((_, i) => keep(needs[i]!));
  const weights = options.map((a) => weight(a, stats));
  r *= weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < options.length; i++) {
    r -= weights[i]!;
    if (r < 0) return options[i]!;
  }
  return options.at(-1) ?? null;
}

/** While he follows a whisper to explore, a real place he has never been to pulls EXPLORE_PULL times as hard. */
export const EXPLORE_PULL = 3;
export function exploreWeight(p: Place, stats: Stats): number {
  return stats.bond.nudge === "explore" && !stats.visited.has(visitKey(p)) ? EXPLORE_PULL : 1;
}

export function restMinutes(_action: Action): number {
  return MAX_MINUTES;
}
