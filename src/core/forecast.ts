// The daily forecast: one small rule of the day, picked from data/forecasts.json
// with an Rng seeded from the local date, so every player on the same date
// gets the same one with no server (Godville's newspaper). It changes a
// little of how things go that day; he never has to do anything about it.
import { dayOf } from "./gifts";
import { Rng } from "./rng";

/** What a forecast changes: mood from places of one class, fares, money on the street, sale prices, walking effort, first-visit XP or wages. */
export type Effect = "mood" | "fare" | "find" | "sell" | "effort" | "visit" | "wage";
/** `text` says `{n}` where the amount goes (see amount), so the words follow `mult`. */
export type Forecast = { id: string; icon: string; text: string; effect: Effect; mult: number; kind?: string };

/** Until the data has loaded (and in tests that don't load it), a day that changes nothing. */
export const QUIET: Forecast = { id: "quiet", icon: "📰", text: "A quiet day", effect: "mood", mult: 1 };

/** How much `f` changes things, in words: "twice" for a multiple of 2, else the percent up or down. */
export function amount(f: Forecast): string {
  if (f.mult === 2) return "twice";
  if (f.mult > 2) return `${f.mult} times`;
  return `${Math.round(Math.abs(f.mult - 1) * 100)}%`;
}

/** What `f` says, with its amount filled in. */
export const words = (f: Forecast) => f.text.replace("{n}", amount(f));

/** The forecast out of `list` for local date `day` ("2026-10-30"). */
export function forecastOn(list: readonly Forecast[], day: string): Forecast {
  if (!list.length) return QUIET;
  let seed = 2166136261;
  for (let i = 0; i < day.length; i++) seed = Math.imul(seed ^ day.charCodeAt(i), 16777619);
  return new Rng(seed).pick(list);
}

let cached = { list: [] as readonly Forecast[], min: NaN, f: QUIET };

/** The forecast out of `list` at unix seconds `t`; worked out once a minute, since it is asked every frame. */
export function forecastAt(list: readonly Forecast[], t: number): Forecast {
  const min = Math.floor(t / 60);
  if (min !== cached.min || list !== cached.list) cached = { list, min, f: forecastOn(list, dayOf(t * 1000)) };
  return cached.f;
}

/** The multiplier `f` gives `effect` (for mood, at a place of `kind`); 1 when it gives none. */
export function mult(f: Forecast, effect: Effect, kind = ""): number {
  if (f.effect !== effect) return 1;
  if (effect === "mood" && f.kind !== kind) return 1;
  return f.mult;
}
