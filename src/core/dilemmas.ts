// One dilemma on reopen: now and then, after a long time away, the away card
// holds one small choice ("A trucker offers a free ride to Varna. Hop on, or
// stay?"). Your tap picks the outcome; if you just carry on he decides by
// himself, leaning on his own attributes and meters. Nothing ever waits for
// you. A few offers send him to another city, free.
import { effect } from "./gifts";
import { euro, signed } from "./money";
import type { Rng } from "./rng";
import type { Action, Attr, Fx, Stats } from "./stats";
import type { City, Kind } from "./trips";

/** Shortest time away that may bring a dilemma. */
export const DILEMMA_AWAY_S = 4 * 3600;
/** Chance of one on such a reopen. */
export const DILEMMA_CHANCE = 0.25;
/** How far his attribute tilts his own pick: each point moves the odds this much from even, up to LEAN_CAP. */
export const LEAN_PER_POINT = 0.05;
export const LEAN_CAP = 0.4;

export type Option = {
  label: string;
  /** What he says he did, for his History. */
  say: string;
  /** Cents gained (or lost, negative). */
  cents?: number;
  fx?: Fx;
  buff?: NonNullable<Action["buff"]>;
  /** A free ride to the dilemma's city. */
  trip?: boolean;
};

export type DilemmaKind = {
  id: string;
  icon: string;
  /** The question; {CITY} is the city of a trip offer. */
  text: string;
  /** A trip offer goes to a city of this kind. */
  trip?: Exclude<Kind, "stay">;
  /** The first option is "go for it", the second "play safe"; this attribute makes him lean to the first. */
  lean: Attr;
  options: [Option, Option];
};

export const DILEMMAS: DilemmaKind[] = [
  {
    id: "trucker", icon: "🚚", text: "A trucker offers a free ride to {CITY}.", trip: "city", lean: "str",
    options: [{ label: "Hop on", say: "Hopped on a trucker's free ride to {CITY}", trip: true }, { label: "Stay", say: "Thanked the trucker and stayed", fx: { mood: 5 } }],
  },
  {
    id: "job", icon: "💼", text: "A stranger offers a week's job in {CITY}, travel paid.", trip: "country", lean: "luck",
    options: [{ label: "Go", say: "Took a stranger's job offer in {CITY}", trip: true, cents: 5000 }, { label: "Stay", say: "Turned down a job abroad", fx: { mood: 5 } }],
  },
  {
    id: "musician", icon: "🎻", text: "A street musician asks him to join in for the evening.", lean: "cha",
    options: [{ label: "Join in", say: "Busked with a street musician", cents: 1200, fx: { mood: 15, energy: -10 } }, { label: "Walk on", say: "Listened to a street musician, then walked on", fx: { mood: 3 } }],
  },
  {
    id: "wallet", icon: "👛", text: "He finds a wallet with €40 in it.", lean: "wit",
    options: [{ label: "Hand it in", say: "Handed a lost wallet in to the police", fx: { mood: 10, xp: 40 } }, { label: "Keep it", say: "Kept a wallet he found", cents: 4000, fx: { mood: -10 } }],
  },
  {
    id: "chess", icon: "♟", text: "A chess hustler bets €10 he can't beat him.", lean: "wit",
    options: [{ label: "Play", say: "Played a chess hustler for €10", fx: { xp: 25 } }, { label: "Pass", say: "Passed on a chess hustler's bet" }],
  },
  {
    id: "helper", icon: "🛍", text: "An old lady needs help carrying her shopping home.", lean: "str",
    options: [{ label: "Help", say: "Carried an old lady's shopping home", fx: { xp: 30, energy: -10, mood: 8 } }, { label: "Hurry on", say: "Hurried past someone who needed help", fx: { mood: -3 } }],
  },
  {
    id: "gym", icon: "🏋", text: "A gym offers him a free trial session.", lean: "str",
    options: [
      { label: "Try it", say: "Tried a free gym session", fx: { energy: -20 }, buff: { name: "Pumped", min: 240, attrs: { str: 1 } } },
      { label: "Skip it", say: "Skipped a free gym session" },
    ],
  },
  {
    id: "bread", icon: "🥖", text: "A bakery is giving away yesterday's bread.", lean: "luck",
    options: [{ label: "Take some", say: "Took free bread from a bakery", fx: { fullness: 25 } }, { label: "Leave it", say: "Left the free bread for others", fx: { mood: 5 } }],
  },
];

/** The chess game: his chance to win, from Wits. */
export const chessWin = (wit: number) => Math.min(0.3 + 0.04 * wit, 0.8);
export const CHESS_STAKE = 1000;

const ATTR_NAMES: Record<Attr, string> = { str: "Strength", cha: "Charm", wit: "Wits", luck: "Luck" };

/** What an option does, in a few words: "free ride", "+€12, +15 mood". */
export function optionText(k: DilemmaKind, o: Option): string {
  const parts = [o.trip ? "a free ride there" : "", o.cents ? signed(o.cents) : "", effect(o)];
  if (k.id === "chess" && o === k.options[0]) parts.push(`win or lose ${euro(CHESS_STAKE)}, better odds with more Wits`);
  return parts.filter(Boolean).join(", ") || "nothing";
}

/** One Help line per dilemma: the question, the attribute he leans on, and what each option does. */
export const helpList = () =>
  DILEMMAS.map((k) => {
    const q = k.text.replace("{CITY}", k.trip === "country" ? "another country" : "another city");
    return `- ${k.icon} ${q} ${k.options.map((o) => `${o.label} (${optionText(k, o)})`).join(" or ")}. He leans on ${ATTR_NAMES[k.lean]}.`;
  }).join("\n");

/** A dilemma that came up, with the city a trip offer goes to. */
export type Dilemma = { id: string; city: City | null; picked: number | null; by: "you" | "him" | null; said: string };

export const kindOf = (d: Dilemma) => DILEMMAS.find((k) => k.id === d.id)!;
const fillCity = (text: string, d: Dilemma) => text.replace("{CITY}", d.city?.name ?? "");
export const question = (d: Dilemma) => fillCity(kindOf(d).text, d);
export const labels = (d: Dilemma) => kindOf(d).options.map((o) => o.label);

/**
 * Maybe a dilemma for a reopen after `awayS`: DILEMMA_CHANCE of one after
 * DILEMMA_AWAY_S (`chance` 1 in Debug). A trip offer needs a city from
 * `cityFor`; without one it isn't offered.
 */
export function rollDilemma(awayS: number, rng: Rng, cityFor: (kind: Exclude<Kind, "stay">) => City | null, chance = DILEMMA_CHANCE): Dilemma | null {
  if (awayS < DILEMMA_AWAY_S || rng.randf() >= chance) return null;
  const pool = [...DILEMMAS];
  while (pool.length) {
    const k = pool.splice(rng.randiRange(0, pool.length - 1), 1)[0]!;
    const city = k.trip ? cityFor(k.trip) : null;
    if (k.trip && !city) continue;
    return { id: k.id, city, picked: null, by: null, said: "" };
  }
  return null;
}

/** His own pick when you don't choose: 0 ("go for it") more likely the higher his leaning attribute. */
export function hisPick(d: Dilemma, stats: Stats, rng: Rng): number {
  const lean = Math.min(LEAN_PER_POINT * (stats.attr(kindOf(d).lean) - 1), LEAN_CAP);
  return rng.randf() < 0.5 + lean ? 0 : 1;
}

/**
 * Settles `d` with option `pick`, by you or by him, and returns the option
 * (the game makes the trip). Its line goes in his History.
 */
export function settle(d: Dilemma, pick: number, by: "you" | "him", stats: Stats, rng: Rng): Option {
  const k = kindOf(d);
  const o = k.options[pick]!;
  d.picked = pick;
  d.by = by;
  let cents = o.cents ?? 0;
  let say = fillCity(o.say, d);
  if (k.id === "chess" && pick === 0) {
    const won = rng.randf() < chessWin(stats.attr("wit"));
    cents = won ? CHESS_STAKE : -Math.min(CHESS_STAKE, stats.cents);
    say += won ? " and won" : " and lost";
  }
  stats.cents += cents;
  stats.applyFx(o.fx ?? {});
  if (o.buff) stats.addBuff(o.buff);
  const money = cents ? ` (${signed(cents)})` : "";
  d.said = stats.say(`${by === "him" ? "Decided by himself: " : ""}${say}${money}`);
  return o;
}
