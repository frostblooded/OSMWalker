// One dilemma on reopen: now and then, after a long time away, the away card
// holds one small choice ("A trucker offers a free ride to Varna. Hop on, or
// stay?"). Your tap picks the outcome; if you just carry on he decides by
// himself, leaning on one of his attributes. Nothing ever waits for
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

/** What the chess hustler bets. */
export const CHESS_STAKE = 1000;
/** What the found wallet holds. */
export const WALLET_CENTS = 4000;

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
  /** The question; {CITY} is the city of a trip offer, {STAKE} and {WALLET} the sums below. */
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
    id: "wallet", icon: "👛", text: "He finds a wallet with {WALLET} in it.", lean: "wit",
    options: [{ label: "Hand it in", say: "Handed a lost wallet in to the police", fx: { mood: 10, xp: 40 } }, { label: "Keep it", say: "Kept a wallet he found", cents: WALLET_CENTS, fx: { mood: -10 } }],
  },
  {
    id: "chess", icon: "♟", text: "A chess hustler bets {STAKE} he can't beat him.", lean: "wit",
    options: [{ label: "Play", say: "Played a chess hustler for {STAKE}", fx: { xp: 25 } }, { label: "Pass", say: "Passed on a chess hustler's bet" }],
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

/** The chess game: his chance to win is CHESS_BASE plus CHESS_PER_WIT a point of Wits, up to CHESS_MAX. */
export const CHESS_BASE = 0.3;
export const CHESS_PER_WIT = 0.04;
export const CHESS_MAX = 0.8;
export const chessWin = (wit: number) => Math.min(CHESS_BASE + CHESS_PER_WIT * wit, CHESS_MAX);

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
    const q = fill(k.text, k.trip === "country" ? "another country" : "another city");
    return `- ${k.icon} ${q} ${k.options.map((o) => `${o.label} (${optionText(k, o)})`).join(" or ")}. He leans on ${ATTR_NAMES[k.lean]}.`;
  }).join("\n");

/**
 * A dilemma that came up, with the city a trip offer goes to and what the
 * away card shows (so the card needs nothing from this file, which loads
 * only on a reopen).
 */
export type Dilemma = { id: string; city: City | null; icon: string; ask: string; labels: string[]; picked: number | null; by: "you" | "him" | null; said: string };

const kindOf = (d: Dilemma) => DILEMMAS.find((k) => k.id === d.id)!;
const fill = (text: string, city: string) => text.replace("{CITY}", city).replace("{STAKE}", euro(CHESS_STAKE)).replace("{WALLET}", euro(WALLET_CENTS));

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
    return { id: k.id, city, icon: k.icon, ask: fill(k.text, city?.name ?? ""), labels: k.options.map((o) => o.label), picked: null, by: null, said: "" };
  }
  return null;
}

/** His own pick when you don't choose: 0 ("go for it") more likely the higher his leaning attribute, never less likely than even. */
export function hisPick(d: Dilemma, stats: Stats, rng: Rng): number {
  const lean = Math.max(0, Math.min(LEAN_PER_POINT * (stats.attr(kindOf(d).lean) - 1), LEAN_CAP));
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
  let say = fill(o.say, d.city?.name ?? "");
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
