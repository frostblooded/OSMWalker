// Guess the next trip: while he walks to the station, where he is going stays
// a surprise and you may guess it from three choices (cities for a trip in
// the same country, countries for one abroad). He reveals it when he boards;
// a right guess earns clovers. Ignoring it changes nothing.
import type { Rng } from "./rng";
import type { City } from "./trips";

/** Clovers a right guess earns. */
export const GUESS_CLOVERS = 1;
export const GUESS_CHOICES = 3;

export type Guess = { abroad: boolean; choices: string[]; answer: string; pick: string };

/** What a trip to `dest` is guessed by: its country abroad, else its city name. */
export const label = (dest: City, abroad: boolean) => (abroad ? dest.country : dest.name);

/**
 * A guess for a trip to `dest` from `country`: the answer and decoys of the
 * same kind (other cities of the country but not `here`, or other countries), in random
 * order. Fewer choices when there aren't enough decoys; null with none.
 */
export function makeGuess(dest: City, country: string, here: string, cities: City[], rng: Rng): Guess | null {
  const abroad = dest.code !== country;
  const answer = label(dest, abroad);
  const pool = [...new Set(cities.filter((c) => (abroad ? c.code !== country : c.code === country)).map((c) => label(c, abroad)))].filter((l) => l !== answer && l !== here);
  const choices = [answer];
  while (choices.length < GUESS_CHOICES && pool.length) choices.push(pool.splice(rng.randiRange(0, pool.length - 1), 1)[0]!);
  if (choices.length < 2) return null;
  for (let i = choices.length - 1; i > 0; i--) {
    const j = rng.randiRange(0, i);
    [choices[i], choices[j]] = [choices[j]!, choices[i]!];
  }
  return { abroad, choices, answer, pick: "" };
}
