// The incident deck: things that happen to him, not actions he picks at a
// place (a pickpocket, a stray dog, a wedding invite, a pub quiz win). Cards
// live in data/incidents.json; the storyteller (storyteller.ts) says when one
// happens and whether it is good, bad or odd, and this file picks a card that
// fits where he is (night legends at castles and graveyards first) and plays
// it out. Some cards hold a choice of two, asked as a timed moment while you
// watch (moment()); untapped, or while you are away, he picks by himself,
// leaning on one of his attributes. A bad card never takes more than LOSS_CAP_SHARE of his money, and only
// takes an item from his bag, never his gear or a treasured item.
import type { Item } from "./items";
import { isTreasured } from "./items";
import { signed, toCents } from "./money";
import type { PetKind } from "./pet";
import type { Moment } from "./moments";
import type { Rng } from "./rng";
import type { Vehicle } from "./speeds";
import type { Action, Attr, Fx, Stats, TimeOfDay } from "./stats";
import type { Tone } from "./storyteller";

/** Most of his money one incident may take. */
export const LOSS_CAP_SHARE = 0.25;
/** Each point of the leaning attribute above 1 moves his own pick this much from even, up to LEAN_CAP (dilemmas.ts leans the same). */
export const LEAN_PER_POINT = 0.05;
export const LEAN_CAP = 0.4;
/** A night legend is this many times likelier than any other card that fits. */
export const LEGEND_WEIGHT = 4;
export const ATTR_NAMES: Record<Attr, string> = { str: "Strength", cha: "Charm", wit: "Wits", luck: "Luck" };

/** How far `attr` tilts his own pick of a choice toward the bold option, from 0 to LEAN_CAP. */
export const leanShare = (stats: Stats, attr: Attr) => Math.max(0, Math.min(LEAN_PER_POINT * (stats.attr(attr) - 1), LEAN_CAP));

/** What a card (or one of its options) does. Money in euros, as in data/actions.json. */
export type Outcome = {
  /** What he did, for the feed. */
  say: string;
  /** Euros gained, or lost when negative; a pair is a range. */
  eur?: number | [number, number];
  /** Share of his money lost. */
  share?: number;
  fx?: Fx;
  buff?: NonNullable<Action["buff"]>;
  /** He loses one item from his bag (never gear or a treasured item). */
  lose?: boolean;
};

export type Option = Outcome & { id: string; label: string };

export type Incident = Partial<Outcome> & {
  id: string;
  icon: string;
  tone: Tone;
  /** How it starts; {PLACE} is where he is. */
  text: string;
  /** Only at places of these map classes. */
  at?: string[];
  time?: TimeOfDay;
  /** Only while he gets about like this ("" is on foot). */
  rides?: Vehicle[];
  /** With this much of the attribute he gets away with it, and `say` is what he does instead. */
  guard?: { attr: Attr; at: number; say: string };
  /** A choice of two: the first is the bold one, which he leans to the higher `lean` is. */
  options?: [Option, Option];
  lean?: Attr;
  /** A night legend: told at night at ruins, castles, graveyards and the like, LEGEND_WEIGHT times likelier there. */
  legend?: boolean;
  /** A stray that may stay with him for good as his pet (see pet.ts). */
  stray?: PetKind;
};

/** Where he is when it happens. */
export type Scene = { place: string; kind: string; hour: number; rides: Vehicle };

/** A card of `tone` that fits `scene`, not one of the `recent` ids unless nothing else fits, or null when none does. */
export function pick(deck: readonly Incident[], tone: Tone, scene: Scene, inTime: (t: TimeOfDay, hour: number) => boolean, rng: Rng, recent: readonly string[] = []): Incident | null {
  const fits = deck.filter((c) => c.tone === tone && (!c.at || c.at.includes(scene.kind)) && (!c.time || inTime(c.time, scene.hour)) && (!c.rides || c.rides.includes(scene.rides)));
  const fresh = fits.filter((c) => !recent.includes(c.id));
  const from = fresh.length ? fresh : fits;
  if (!from.length) return null;
  const weights = from.map((c) => (c.legend ? LEGEND_WEIGHT : 1));
  let r = rng.randf() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < from.length; i++) if ((r -= weights[i]!) < 0) return from[i]!;
  return from.at(-1)!;
}

/** His own pick of `card`'s options: 0 (the bold one) the likelier the higher his leaning attribute, never less likely than even. */
export function hisPick(card: Incident, stats: Stats, rng: Rng): number {
  return rng.randf() < 0.5 + (card.lean ? leanShare(stats, card.lean) : 0) ? 0 : 1;
}

/** A choice card as a timed moment at `place`: option ids "0" (the bold one) and "1". */
export function moment(card: Incident, place: string): Moment {
  return { id: `incident:${card.id}`, icon: card.icon, ask: card.text.replaceAll("{PLACE}", place), lean: card.lean, options: card.options!.map((o, i) => ({ id: String(i), label: o.label })), default: "1" };
}

/** Plays `card` out at `place` (option `picked`, or his own pick) and returns its feed line; `you` false marks a choice he made himself. */
export function play(card: Incident, stats: Stats, place: string, rng: Rng, picked?: number, you?: boolean): string {
  const o = card.options ? card.options[picked ?? hisPick(card, stats, rng)]! : card;
  const guarded = card.guard && stats.attr(card.guard.attr) >= card.guard.at;
  const opening = `${card.icon} ${card.text.replaceAll("{PLACE}", place)}`;
  if (guarded) return stats.say(`${opening} ${card.guard!.say}`);
  const parts: string[] = [];
  let cents = 0;
  if (o.eur !== undefined) cents += Array.isArray(o.eur) ? rng.randiRange(toCents(o.eur[0]), toCents(o.eur[1])) : toCents(o.eur);
  if (o.share) cents -= Math.floor(stats.cents * o.share);
  cents = Math.max(cents, -Math.floor(stats.cents * LOSS_CAP_SHARE));
  stats.cents = Math.max(stats.cents + cents, 0);
  if (cents) parts.push(signed(cents));
  if (o.fx) stats.applyFx(o.fx);
  if (o.buff) stats.addBuff(o.buff);
  if (o.lose) {
    const item = loseable(stats.bag, rng);
    if (item) {
      stats.bag.splice(stats.bag.indexOf(item), 1);
      parts.push(`lost ${item.name}`);
    }
  }
  const choice = card.options ? `${you === false ? "Decided by himself: " : ""}${(o as Option).label}: ` : "";
  return stats.say(`${opening} ${choice}${o.say}${parts.length ? ` (${parts.join(", ")})` : ""}`);
}

/** A card's opening with its place left out, for Help: "A pickpocket brushes past him near {PLACE}." becomes "A pickpocket brushes past him". */
export const bare = (card: Incident) => card.text.replace(/ (near|by|at|outside|over|from) \{PLACE\}| \{PLACE\}/, "").replace(/\.$/, "");

/** A bag item he may lose: anything but a treasured one. */
function loseable(bag: Item[], rng: Rng): Item | null {
  const can = bag.filter((i) => !isTreasured(i));
  return can.length ? rng.pick(can) : null;
}

/** Problems with the deck, for the data test: unknown keys, broken choices. */
export function check(deck: readonly Incident[], classes: Set<string>, attrs: readonly string[]): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  for (const c of deck) {
    if (ids.has(c.id)) out.push(`${c.id}: id used twice`);
    ids.add(c.id);
    if (!c.icon || !c.text) out.push(`${c.id}: needs an icon and a text`);
    if (!["good", "bad", "odd"].includes(c.tone)) out.push(`${c.id}: tone ${c.tone}`);
    for (const k of c.at ?? []) if (!classes.has(k)) out.push(`${c.id}: no place class ${k}`);
    if (c.guard && !attrs.includes(c.guard.attr)) out.push(`${c.id}: guard attribute ${c.guard.attr}`);
    if (c.legend && (c.time !== "night" || !c.at)) out.push(`${c.id}: a legend needs night and places`);
    if (c.guard && /\{PLACE\}| (in|on|near|by|at|outside|over|from)$/.test(bare(c))) out.push(`${c.id}: Help can't leave out its place`);
    if (c.stray && !["dog", "cat"].includes(c.stray)) out.push(`${c.id}: no pet kind ${c.stray}`);
    if (c.options ? c.options.length !== 2 || !c.lean || !attrs.includes(c.lean) : !c.say) out.push(`${c.id}: needs a say, or two options and a lean`);
  }
  return out;
}
