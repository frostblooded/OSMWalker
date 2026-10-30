// Checks that a city lets him go on: a way out (a bus station, an airport or
// a gas station for a car) and a place where he can earn money. Missing
// either is severe: he could be stuck there.
import type { Activities } from "./activities";
import type { Need } from "./poiGen";
import type { Place } from "./stats";

type P = Partial<Place>;
export type Summary = { bus: number; airport: number; gas: number; dealer: number; earn: number; food: number; bed: number };

export const isBusStation = (p: P) => p.class === "bus" && p.subclass === "bus_station";
/** Places from the aerodrome layer, except military airfields. */
export const isAirport = (p: P) => p.class === "aerodrome" && p.subclass !== "military";
export const isGasStation = (p: P) => p.class === "fuel" && (p.subclass ?? "fuel") === "fuel";
export const isCarDealer = (p: P) => p.subclass === "car" && (p.class === "car" || p.class === "shop");

/** True when one of the actions at `p` pays him. */
export const canEarnAt = (p: P, activities: Activities, country = "") => activities.forPlace(p, country).some((a) => a.earn !== undefined);
/** A meal fills him at least this much; a bed gives at least BED_ENERGY. */
export const MEAL_FULLNESS = 20;
export const BED_ENERGY = 50;
/** True when one of the actions at `p` is a real meal. */
export const canEatAt = (p: P, activities: Activities, country = "") => activities.peek(p, country).some((a) => (a.fx?.fullness ?? 0) >= MEAL_FULLNESS);
/** True when one of the actions at `p` is a night's sleep. */
export const canSleepAt = (p: P, activities: Activities, country = "") => activities.peek(p, country).some((a) => (a.fx?.energy ?? 0) >= BED_ENERGY);

/** How many of each kind of place matter for getting on. */
export function summary(places: P[], activities: Activities | null, country = ""): Summary {
  const s: Summary = { bus: 0, airport: 0, gas: 0, dealer: 0, earn: 0, food: 0, bed: 0 };
  for (const p of places) {
    s.bus += +isBusStation(p);
    s.airport += +isAirport(p);
    s.gas += +isGasStation(p);
    s.dealer += +isCarDealer(p);
    if (!activities) continue;
    s.earn += +canEarnAt(p, activities, country);
    s.food += +canEatAt(p, activities, country);
    s.bed += +canSleepAt(p, activities, country);
  }
  return s;
}

/** The must-haves a city lacks, for core/poiGen.ts to make up. */
export function missing(s: Summary): Need[] {
  const out: Need[] = [];
  if (s.bus === 0) out.push("bus");
  if (s.gas === 0) out.push("gas");
  if (s.food === 0) out.push("food");
  if (s.bed === 0) out.push("bed");
  if (s.earn === 0) out.push("earn");
  return out;
}

/** Severe problems from a summary. */
export function problems(s: Summary, city: string): { title: string; details: string[] }[] {
  const out: { title: string; details: string[] }[] = [];
  if (s.bus === 0 && s.airport === 0 && s.gas === 0) {
    out.push({ title: `Can't leave ${city}`, details: ["No bus station, airport or gas station is loaded in the city box, so he has no way to travel on."] });
  }
  if (s.gas === 0) out.push({ title: `No gas station in ${city}`, details: ["A car can't refuel here."] });
  if (s.earn === 0) {
    out.push({
      title: `No way to earn money in ${city}`,
      details: ["No loaded place in the city box has an action that pays him, so he can't afford to leave once his money runs out."],
    });
  }
  return out;
}
