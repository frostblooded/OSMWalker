// The daily forecast: one small rule of the day, picked from FORECASTS by a
// hash of the local date, so every player on the same date gets the same one
// with no server (Godville's newspaper). It changes a little of what he does
// that day; he never has to do anything about it.
import { dayOf } from "./gifts";

/** What a forecast changes: mood from places of one class, fares, money on the street, sale prices, walking effort, first-visit XP or wages. */
export type Effect = "mood" | "fare" | "find" | "sell" | "effort" | "visit" | "wage";
export type Forecast = { id: string; icon: string; text: string; effect: Effect; mult: number; kind?: string };

export const FORECASTS: readonly Forecast[] = [
  { id: "bakery", icon: "🥐", text: "Bakeries feel twice as good today", effect: "mood", kind: "bakery", mult: 2 },
  { id: "cafe", icon: "☕", text: "Cafés feel twice as good today", effect: "mood", kind: "cafe", mult: 2 },
  { id: "park", icon: "🌳", text: "Parks feel twice as good today", effect: "mood", kind: "park", mult: 2 },
  { id: "museum", icon: "🏛", text: "Museums feel twice as good today", effect: "mood", kind: "museum", mult: 2 },
  { id: "ice_cream", icon: "🍦", text: "Ice cream tastes twice as good today", effect: "mood", kind: "ice_cream", mult: 2 },
  { id: "fares", icon: "🎫", text: "Fares are 20% off today", effect: "fare", mult: 0.8 },
  { id: "find", icon: "🪙", text: "Pockets are leaky today: twice the money on the street", effect: "find", mult: 2 },
  { id: "sell", icon: "💶", text: "Dealers are generous today: things sell for 25% more", effect: "sell", mult: 1.25 },
  { id: "effort", icon: "🍃", text: "A tailwind everywhere: walking tires him 25% less", effect: "effort", mult: 0.75 },
  { id: "visit", icon: "🧭", text: "New places give 50% more XP today", effect: "visit", mult: 1.5 },
  { id: "wage", icon: "💼", text: "Bosses are in a good mood: work pays 10% more", effect: "wage", mult: 1.1 },
  { id: "dragon", icon: "🐉", text: "A dragon was seen over the river; parks feel twice as good", effect: "mood", kind: "park", mult: 2 },
];

/** The forecast for local date `day` ("2026-10-30"). */
export function forecastOn(day: string): Forecast {
  let h = 2166136261;
  for (let i = 0; i < day.length; i++) h = Math.imul(h ^ day.charCodeAt(i), 16777619);
  return FORECASTS[(h >>> 0) % FORECASTS.length]!;
}

let cached = { min: NaN, f: FORECASTS[0]! };

/** The forecast at unix seconds `t`; worked out once a minute, since it is asked every frame. */
export function forecastAt(t: number): Forecast {
  const min = Math.floor(t / 60);
  if (min !== cached.min) cached = { min, f: forecastOn(dayOf(t * 1000)) };
  return cached.f;
}

/** The multiplier `f` gives `effect` (for mood, at a place of `kind`); 1 when it gives none. */
export function mult(f: Forecast, effect: Effect, kind = ""): number {
  if (f.effect !== effect) return 1;
  if (effect === "mood" && f.kind !== kind) return 1;
  return f.mult;
}
