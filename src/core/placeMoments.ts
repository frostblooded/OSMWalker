// A timed moment at each kind of place (see moments.ts): when he starts an
// activity there, a small choice or mini-game may change how it goes ("tip
// the barista", "skip paying"). Each option's outcome is data
// (data/moments.json), keyed like actions.json; Stats.settleMoment applies it.
import type { Kind } from "./items";
import { riskOdds, type Moment } from "./moments";
import { Rng, seedOf } from "./rng";
import type { Action, Attr, Fx, Place } from "./stats";

export type PlaceOutcome = {
  /** What he did; {PLACE} is the place's name. */
  say: string;
  /** Cents paid (only what he has). */
  pay?: number;
  /** Cents gained. */
  gain?: number;
  fx?: Fx & { karma?: number };
  buff?: NonNullable<Action["buff"]>;
  /** A free item of this kind: worn if better, else bagged. */
  item?: Kind;
};

export type PlaceMoment = Moment & {
  outcomes: Record<string, PlaceOutcome>;
  /** An option that may fail: it works more often the higher `attr`, and `miss` happens when it doesn't. */
  risky?: { option: string; attr: Attr; miss: PlaceOutcome };
};

/** Keyed "class/subclass", "class" or "_generic", like actions.json. */
export type PlaceMoments = Record<string, PlaceMoment>;

/** The moments a trip may bring as he boards, keyed "_trip:..." in the same table. */
export const tripMoments = (table: PlaceMoments) => Object.keys(table).filter((k) => k.startsWith("_trip:")).map((k) => table[k]!);

/** A trip's moment, on `dice`; null with none loaded. */
export function tripMoment(table: PlaceMoments, dice: Rng): PlaceMoment | null {
  const all = tripMoments(table);
  return all.length ? all[dice.randiRange(0, all.length - 1)]! : null;
}

/** A moment's own dice from the time and where it happens, the same while you watch and in the catch-up, so his walk stays the same. */
export const momentDice = (t: number, where: string) => new Rng(seedOf(`moment${t}${where}`));

/** The moment for `place`: its class/subclass, its class, or the generic one; null with none loaded. */
export function momentFor(table: PlaceMoments, place: Partial<Pick<Place, "class" | "subclass">>): PlaceMoment | null {
  return table[`${place.class ?? ""}/${place.subclass ?? ""}`] ?? table[place.class ?? ""] ?? table._generic ?? null;
}

/** The outcome of `pick`, after a risky option's own roll `r` against his `attr`. */
export function outcomeOf(m: PlaceMoment, pick: string, attr: (a: Attr) => number, r: number): PlaceOutcome {
  if (m.risky?.option === pick && r >= riskOdds(attr(m.risky.attr))) return m.risky.miss;
  const o = m.outcomes[pick];
  if (!o) throw new Error(`moment ${m.id} has no outcome ${pick}`);
  return o;
}
