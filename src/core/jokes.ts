// Deadpan jokes: now and then a feed line about what he did at a place gets a
// dry second sentence, Godville style. The lines live in data/jokes.json by
// place class, with "_generic" for every other kind; picked with the
// action's own Rng.

/** Share of action lines that get a joke. */
export const JOKE_CHANCE = 1 / 8;

/** Place class -> joke lines, from data/jokes.json. */
export type Jokes = Record<string, string[]>;

/** The joke lines for places of `kind`; none until the data has loaded. */
export const jokesFor = (jokes: Jokes, kind: string): string[] => jokes[kind] ?? jokes._generic ?? [];
