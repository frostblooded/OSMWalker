// Place creatures: a little folklore on the real map. A troll under a
// bridge, a water sprite in a fountain or well, a dryad in a park's old
// tree. At most once a day, when he reaches such a place, its creature may
// show up with a small choice (a timed moment, see moments.ts); each option
// is a small buff or a small loss. He takes his own pick when nobody taps.
// Who they are and what each pick does is data (data/creatures.json).
import { Rng, seedOf } from "./rng";
import { riskOdds, type Moment } from "./moments";
import type { Action, Attr, Fx } from "./stats";

/** The odds a creature shows up when he reaches a place it lives at, until he has met one today. */
export const CREATURE_CHANCE = 0.15;

export type Outcome = {
  /** What he says happened; {PLACE} is the place's name. */
  say: string;
  /** Cents paid (only what he has). */
  pay?: number;
  fx?: Fx;
  buff?: NonNullable<Action["buff"]>;
};
export type Creature = {
  id: string;
  icon: string;
  name: string;
  /** Place classes it lives at. */
  at: readonly string[];
  /** A Collection hint while he hasn't met it. */
  hint: string;
  /** Where it lives, for Help. */
  where: string;
  /** {PLACE} in `ask` is the place's name. */
  moment: Moment;
  outcomes: Record<string, Outcome>;
  /** An option that may fail: it works more often the higher `attr` (see riskOdds), and `miss` happens when it doesn't. */
  risky?: { option: string; attr: Attr; miss: Outcome };
};

/** The creature of `kinds` that lives at places of this class, if any. */
export const creatureOf = (kinds: readonly Creature[], cls: string): Creature | undefined => kinds.find((c) => c.at.includes(cls));

/** The creatures he has met: how often each, and the day (gifts.ts dayOf) of the last meeting. */
export class Creatures {
  met: Record<string, number> = {};
  day = "";

  /** At a place of class `cls` on `day`: the creature of `kinds` that shows up, or null once he has met one that day. */
  roll(kinds: readonly Creature[], cls: string, day: string, r: number): Creature | null {
    const c = creatureOf(kinds, cls);
    if (!c || this.day === day || r >= CREATURE_CHANCE) return null;
    return c;
  }

  /** What happens when `pick` is chosen at a meeting on `day`: the outcome, after a risky option's own roll. Marks the day, so a meeting left open over a save isn't lost. */
  outcome(c: Creature, pick: string, attr: (a: Attr) => number, r: number, day: string): Outcome {
    this.day = day;
    this.met[c.id] = (this.met[c.id] ?? 0) + 1;
    const risky = c.risky?.option === pick ? c.risky : undefined;
    if (risky && r >= riskOdds(attr(risky.attr))) return risky.miss;
    const o = c.outcomes[pick];
    if (!o) throw new Error(`creature ${c.id} has no outcome ${pick}`);
    return o;
  }

  toJSON() {
    return { met: this.met, day: this.day };
  }

  static fromJSON(d?: { met?: Record<string, number>; day?: string }): Creatures {
    const c = new Creatures();
    c.met = { ...(d?.met ?? {}) };
    c.day = d?.day ?? "";
    return c;
  }
}

/** Its own dice for a meeting, from the time and place, so a meeting leaves his walk the same. */
export const meetingDice = (t: number, place: string) => new Rng(seedOf(`creature${t}${place}`));
