// Trips: each time he picks a new destination he may travel to another city
// in the same country (10%) or in another country (2.5%) instead, twice as
// often while his city has no places of note. Cities come from a bundled list
// and are picked weighted by population. He gets there by bus from a bus
// station, by plane from an airport, or in his own car after filling up at a
// gas station, and pays for the ride.
import { isBusStation, isGasStation } from "./cityCheck";
import { bboxAround, distanceM, type BBox } from "./geo";
import { euro, toCents } from "./money";
import type { Rng } from "./rng";
import { BUS, CAR_ROAD, PLANE } from "./speeds";
import type { Place } from "./stats";

export const COUNTRY_CHANCE = 0.025;
export const CITY_CHANCE = 0.1;
/** Trip odds are multiplied by this while the city has no places of note. */
export const NO_PLACES_BOOST = 2;
/** Fares from real tickets (see the Help page on travel): buses 0.08 a km, flights 50 plus 0.03 a km, car fuel 0.12 a km. */
export const BUS_PER_KM = 0.08;
export const PLANE_BASE = 50;
export const PLANE_PER_KM = 0.03;
export const FUEL_PER_KM = 0.12;
/** Rides go this many times faster than the real speeds, and never take longer than RIDE_MAX_S. */
export const RIDE_SPEEDUP = 10;
export const RIDE_MAX_S = 15 * 60;
/** Roads are about this much longer than the straight line. */
export const ROAD_FACTOR = 1.3;
/** Planes are never taken below the first distance and always above the second. */
export const PLANE_FROM_M = 200_000;
export const PLANE_ALWAYS_M = 1_000_000;
/** Farther than this he only flies: buses and cars don't cross oceans. */
export const MAX_ROAD_M = 3_000_000;
/** Farthest he walks to an airport, and farthest an airport may be from where he lands. */
export const AIRPORT_REACH_M = 50_000;
/** Cities closer than this to him count as the city he is already in. */
export const SAME_CITY_M = 20_000;
/** Destinations in a new city are picked within this radius, scaled by population. */
export const MIN_CITY_RADIUS_M = 1500;
export const MAX_CITY_RADIUS_M = 25_000;

export type Kind = "stay" | "city" | "country";
export type Mode = "bus" | "plane" | "car";
export type City = { name: string; code: string; country: string; lat: number; lon: number; pop: number; bounds?: BBox };
export type Airport = Place & { iata: string; code: string };
export type LatLon = [number, number];
export type Plan = {
  city: City;
  mode: Mode;
  station: Place;
  fare: number;
  arrive: LatLon;
  distance_m: number;
  /** The road a bus or car takes, once known; a straight line until then. */
  path?: LatLon[];
};
export type NoPlan = { error: string; short_of?: number };

const rows = (text: string, min: number) =>
  text
    .split("\n")
    .filter((l) => l !== "" && !l.startsWith("#"))
    .map((l) => l.split("\t"))
    .filter((f) => f.length >= min);

/** Tab-separated lines: name, country code, country, lat, lon, population. */
export function parseCities(text: string): City[] {
  return rows(text, 6).map((f) => ({ name: f[0]!, code: f[1]!, country: f[2]!, lat: +f[3]!, lon: +f[4]!, pop: parseInt(f[5]!, 10) }));
}

/** Tab-separated lines: name, IATA code, country code, lat, lon. Each airport is a place he can walk to. */
export function parseAirports(text: string): Airport[] {
  return rows(text, 5).map((f) => ({ name: f[0]!, class: "aerodrome", subclass: "airport", iata: f[1]!, code: f[2]!, lat: +f[3]!, lon: +f[4]!, rank: 1 }));
}

/** What a roll means: r is uniform in [0, 1). `boost` multiplies the trip odds. */
export function roll(r: number, boost = 1): Kind {
  if (r < COUNTRY_CHANCE * boost) return "country";
  if (r < (COUNTRY_CHANCE + CITY_CHANCE) * boost) return "city";
  return "stay";
}

const MODE_MPS: Record<Mode, number> = { bus: BUS, plane: PLANE, car: CAR_ROAD };

/** Seconds a ride of `distanceM` takes. */
export function rideS(mode: Mode, distanceM: number): number {
  return Math.min(distanceM / (MODE_MPS[mode] * RIDE_SPEEDUP), RIDE_MAX_S);
}

/** Cents for a ride of `distanceM`, rounded up to a cent and never free. */
export function fare(mode: Mode, distanceM: number): number {
  const km = distanceM / 1000;
  if (mode === "plane") return Math.ceil(toCents(PLANE_BASE) + 100 * PLANE_PER_KM * km);
  return Math.max(Math.ceil(100 * (mode === "car" ? FUEL_PER_KM : BUS_PER_KM) * km), 1);
}

/** How likely he flies rather than goes by road: 0 below 200 km, 1 above 1000 km. */
export function planeChance(distanceM: number): number {
  return Math.min(Math.max((distanceM - PLANE_FROM_M) / (PLANE_ALWAYS_M - PLANE_FROM_M), 0), 1);
}

/** How far from the center destinations are picked: bigger cities spread wider. */
export function cityRadiusM(pop: number): number {
  return Math.min(Math.max(8 * Math.sqrt(pop), MIN_CITY_RADIUS_M), MAX_CITY_RADIUS_M);
}

/** Where he picks destinations in `city`. */
export function cityBounds(city: City): BBox {
  return bboxAround(city.lat, city.lon, cityRadiusM(city.pop));
}

function nearest<T extends { lat: number; lon: number }>(list: T[], lat: number, lon: number, reach = Infinity, test: (p: T) => boolean = () => true): T | null {
  let best: T | null = null;
  let bestD = reach;
  for (const p of list) {
    if (!test(p)) continue;
    const d = distanceM(lat, lon, p.lat, p.lon);
    if (d <= bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

export class Trips {
  constructor(
    readonly cities: City[] = [],
    readonly airports: Airport[] = [],
  ) {}

  /** The airport nearest to the point within reach, or null. */
  nearestAirport(lat: number, lon: number, reach = AIRPORT_REACH_M): Airport | null {
    return nearest(this.airports, lat, lon, reach);
  }

  /**
   * How he gets from `here` to `city`, or why he can't. `places` are the
   * places loaded around him, `r` in [0, 1) decides plane or road, and
   * `fareMult` scales the fare (his souvenirs make it cheaper).
   */
  planTrip(city: City, here: LatLon, places: Place[], cents: number, hasCar: boolean, r: number, fareMult = 1): Plan | NoPlan {
    const straight = distanceM(here[0], here[1], city.lat, city.lon);
    const road: Mode = hasCar ? "car" : "bus";
    const order: Mode[] = r < planeChance(straight) ? ["plane", road] : [road, "plane"];
    for (const mode of order) {
      let station: Place | null;
      let arrive: LatLon = [city.lat, city.lon];
      let dist = straight * ROAD_FACTOR;
      if (mode === "plane") {
        station = this.nearestAirport(here[0], here[1]);
        const there = this.nearestAirport(city.lat, city.lon);
        if (!station || !there || there.name === station.name) continue;
        arrive = [there.lat, there.lon];
        dist = distanceM(station.lat, station.lon, there.lat, there.lon);
      } else {
        if (straight > MAX_ROAD_M) continue;
        station = nearest(places, here[0], here[1], Infinity, mode === "car" ? isGasStation : isBusStation);
        if (!station) continue;
      }
      const cost = Math.max(Math.ceil(fare(mode, dist) * fareMult), 1);
      if (cost > cents) return { error: `can't afford the ${mode} to ${city.name}: needs ${euro(cost)}, has ${euro(cents)}`, short_of: cost };
      return { city, mode, station, fare: cost, arrive, distance_m: dist };
    }
    if (straight > MAX_ROAD_M) return { error: "too far to go by road, and no airport within reach" };
    return { error: `no ${hasCar ? "gas station" : "bus station"} or airport within reach` };
  }

  /** Country code of the listed city nearest to the point. */
  countryAt(lat: number, lon: number): string {
    return nearest(this.cities, lat, lon)?.code ?? "";
  }

  /** Cities a trip of `kind` from the point in `country` can go to. */
  options(kind: Kind, country: string, lat: number, lon: number): City[] {
    if (kind === "stay") return [];
    return this.cities.filter((c) => (c.code === country) === (kind === "city") && distanceM(lat, lon, c.lat, c.lon) >= SAME_CITY_M);
  }

  /** A city for a trip of `kind`, weighted by population, or null when there is nowhere to go. */
  pick(kind: Kind, country: string, lat: number, lon: number, rng: Rng): City | null {
    const opts = this.options(kind, country, lat, lon);
    if (opts.length === 0) return null;
    let r = rng.randf() * opts.reduce((acc, c) => acc + c.pop, 0);
    for (const c of opts) {
      r -= c.pop;
      if (r < 0) return c;
    }
    return opts[opts.length - 1]!;
  }
}

export const isPlan = (p: Plan | NoPlan): p is Plan => !("error" in p);
