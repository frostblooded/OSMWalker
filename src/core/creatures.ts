// Place creatures: a little folklore on the real map. A troll under a
// bridge, a water sprite in a fountain or well, a dryad in a park's old
// tree. At most once a day, when he reaches such a place, its creature may
// show up with a small choice (a timed moment, see moments.ts); each option
// is a small buff or a small loss. He takes his own pick when nobody taps.
import { Rng, seedOf } from "./rng";
import type { Moment } from "./moments";
import type { Action, Attr, Fx } from "./stats";

/** The odds a creature shows up when he reaches a place it lives at, until he has met one today. */
export const CREATURE_CHANCE = 0.15;
/** What the troll asks to let him cross, in cents; a wrong riddle answer costs twice that. */
export const TROLL_TOLL = 300;
/** The odds he answers the troll's riddle, and how much each point of Wits above 1 adds, up to RIDDLE_CAP. */
export const RIDDLE_BASE = 0.5;
export const RIDDLE_PER_WIT = 0.05;
export const RIDDLE_CAP = 0.9;
/** What a coin for the sprite costs, in cents. */
export const SPRITE_COIN = 100;

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
  /** An option that may fail: the odds it works, from his attributes, and what happens when it doesn't. */
  risky?: { option: string; odds: (attr: (a: Attr) => number) => number; miss: Outcome };
};

const buff = (name: string, min: number, attrs: Partial<Record<Attr, number>>) => ({ name, min, attrs });

export const riddleOdds = (wit: number) => Math.min(RIDDLE_BASE + RIDDLE_PER_WIT * Math.max(wit - 1, 0), RIDDLE_CAP);

export const CREATURES: readonly Creature[] = [
  {
    id: "troll",
    icon: "🧌",
    name: "Bridge troll",
    at: ["bridge"],
    hint: "Lives under a bridge",
    where: "under bridges",
    moment: {
      id: "troll",
      icon: "🧌",
      ask: "A troll climbs up from under {PLACE}: “A toll, or a riddle!”",
      lean: "wit",
      options: [
        { id: "riddle", label: "Answer its riddle" },
        { id: "pay", label: "Pay the toll" },
        { id: "run", label: "Run for it" },
      ],
      default: "pay",
    },
    outcomes: {
      riddle: { say: "Answered the troll's riddle at {PLACE}", fx: { xp: 20 }, buff: buff("Troll's respect", 120, { wit: 1 }) },
      pay: { say: "Paid the troll's toll at {PLACE}", pay: TROLL_TOLL, buff: buff("Safe passage", 120, { luck: 1 }) },
      run: { say: "Ran from the troll at {PLACE}", fx: { energy: -10, mood: -3, xp: 5 } },
    },
    risky: { option: "riddle", odds: (attr) => riddleOdds(attr("wit")), miss: { say: "Got the troll's riddle wrong at {PLACE} and paid double", pay: 2 * TROLL_TOLL, fx: { mood: -5 } } },
  },
  {
    id: "sprite",
    icon: "🧚",
    name: "Water sprite",
    at: ["fountain", "old_well", "drinking_water"],
    hint: "Lives in a fountain or a well",
    where: "in fountains, wells and drinking fountains",
    moment: {
      id: "sprite",
      icon: "🧚",
      ask: "A water sprite peeks out of {PLACE}",
      options: [
        { id: "coin", label: "Toss her a coin" },
        { id: "drink", label: "Drink from her hands" },
        { id: "splash", label: "Splash her back" },
      ],
      default: "drink",
    },
    outcomes: {
      coin: { say: "Tossed the water sprite a coin at {PLACE}", pay: SPRITE_COIN, buff: buff("Sprite's luck", 180, { luck: 2 }) },
      drink: { say: "Drank from the water sprite's hands at {PLACE}", fx: { thirst: 40, health: 5 } },
      splash: { say: "Had a splash fight with the water sprite at {PLACE}", fx: { mood: 10, hygiene: -10, xp: 5 } },
    },
  },
  {
    id: "dryad",
    icon: "🌳",
    name: "Dryad",
    at: ["park", "garden"],
    hint: "Lives in an old tree in a park",
    where: "in the old trees of parks and gardens",
    moment: {
      id: "dryad",
      icon: "🌳",
      ask: "A dryad steps out of an old tree in {PLACE}",
      options: [
        { id: "listen", label: "Listen to her stories" },
        { id: "nap", label: "Nap in her shade" },
        { id: "acorn", label: "Ask for an acorn" },
      ],
      default: "listen",
    },
    outcomes: {
      listen: { say: "Listened to a dryad's stories in {PLACE}", fx: { xp: 15, mood: 5 } },
      nap: { say: "Napped in a dryad's shade in {PLACE}", fx: { energy: 25, mood: 3 } },
      acorn: { say: "Got an acorn from a dryad in {PLACE}", buff: buff("Dryad's acorn", 240, { cha: 1 }) },
    },
  },
];

const AT = new Map(CREATURES.flatMap((c) => c.at.map((cls) => [cls, c] as const)));

/** The creature that lives at places of this class, if any. */
export const creatureOf = (cls: string): Creature | undefined => AT.get(cls);

/** The creatures he has met: how often each, and the day (gifts.ts dayOf) of the last meeting. */
export class Creatures {
  met: Record<string, number> = {};
  day = "";

  /** At a place of class `cls` on `day`: the creature that shows up, or null. Marks the day once one does. */
  roll(cls: string, day: string, r: number): Creature | null {
    const c = creatureOf(cls);
    if (!c || this.day === day || r >= CREATURE_CHANCE) return null;
    this.day = day;
    return c;
  }

  /** What happens when `pick` is chosen at a meeting: the outcome, after a risky option's own roll. */
  outcome(c: Creature, pick: string, attr: (a: Attr) => number, r: number): Outcome {
    this.met[c.id] = (this.met[c.id] ?? 0) + 1;
    const risky = c.risky?.option === pick ? c.risky : undefined;
    if (risky && r >= risky.odds(attr)) return risky.miss;
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
