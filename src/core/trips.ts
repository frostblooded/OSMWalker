// Trips: each time he picks a new destination he may travel to another city
// in the same country (10%) or in another country (2.5%) instead, twice as
// often while his city has no places of note. Cities come from a bundled list
// and are picked weighted by population. He gets there by bus from a bus
// station, by plane from an airport, or in his own car after filling up at a
// gas station, and pays for the ride. Where the places allow it he takes the
// train from a railway station instead of the bus, now and then a ferry from
// a ferry terminal, and cycles to a near town on his bike. Broke, he
// hitchhikes for free. A long flight leaves him jet-lagged.
import { isBusStation, isGasStation } from "./cityCheck";
import { bboxAround, distanceM, moved, type BBox } from "./geo";
import { euro, toCents } from "./money";
import { Rng, seedOf, slug } from "./rng";
import { BIKE_ROAD, BUS, CAR_ROAD, FERRY, HITCH, PLANE, TRAIN } from "./speeds";
import type { Action, Place } from "./stats";

export const COUNTRY_CHANCE = 0.025;
export const CITY_CHANCE = 0.1;
/** Trip odds are multiplied by this while the city has no places of note. */
export const NO_PLACES_BOOST = 2;
/** Fares from real tickets (see the Help page on travel): buses 0.08 a km, flights 50 plus 0.03 a km, car fuel 0.12 a km. */
export const BUS_PER_KM = 0.08;
export const PLANE_BASE = 50;
export const PLANE_PER_KM = 0.03;
export const FUEL_PER_KM = 0.12;
/** Trains 0.07 a km, ferries 0.10 a km; cycling and hitchhiking are free. */
export const TRAIN_PER_KM = 0.07;
export const FERRY_PER_KM = 0.1;
/** He takes the train instead of the bus from this far, when a railway station is loaded. */
export const TRAIN_FROM_M = 100_000;
/** A train ride this long is a night train: he sleeps in a berth and arrives rested. */
export const SLEEPER_FROM_M = 400_000;
/** With a ferry terminal loaded, a road trip up to FERRY_MAX_M goes by ferry this share of the time, in a straight line over the water. */
export const FERRY_CHANCE = 0.3;
export const FERRY_MAX_M = 600_000;
/** On his bike he cycles to towns closer than this. */
export const CYCLE_MAX_M = 30_000;
/** With less than this many cents and no fare he can pay, he hitchhikes instead of saving up. */
export const HITCH_BELOW = 2000;
/** A hitched ride goes badly this share of the time, and is a great story HITCH_GOOD of the time. */
export const HITCH_BAD = 0.15;
export const HITCH_GOOD = 0.25;
export const HITCH_BAD_FX = { mood: -10, energy: -15 };
export const HITCH_GOOD_FX = { mood: 15, xp: 20 };
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

/** Cities this big with no airport in reach get one of their own. */
export const AIRPORT_POP = 500_000;
/** A made airport is this far from the centre, like most real ones. */
const AIRPORT_OUT_M: [number, number] = [8_000, 15_000];

/** One time zone per this many degrees of longitude. */
export const DEG_PER_ZONE = 15;
/** After a flight he is jet-lagged JET_LAG_H_PER_ZONE hours per time zone crossed, at most JET_LAG_MAX_H: energy drains faster and XP is cut. */
export const JET_LAG_H_PER_ZONE = 1;
export const JET_LAG_MAX_H = 12;
export const JET_LAG_ENERGY_PER_H = 4;
export const JET_LAG_XP = 0.9;

export type Kind = "stay" | "city" | "country";
export type Mode = "bus" | "plane" | "car" | "train" | "ferry" | "bike" | "hitch";
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

const MODE_MPS: Record<Mode, number> = { bus: BUS, plane: PLANE, car: CAR_ROAD, train: TRAIN, ferry: FERRY, bike: BIKE_ROAD, hitch: HITCH };
const PER_KM: Record<Mode, number> = { bus: BUS_PER_KM, plane: PLANE_PER_KM, car: FUEL_PER_KM, train: TRAIN_PER_KM, ferry: FERRY_PER_KM, bike: 0, hitch: 0 };
/** How each way of travelling looks on screen and in the feed. */
export const MODES: Record<Mode, { icon: string; by: string }> = {
  bus: { icon: "🚌", by: "bus" },
  plane: { icon: "✈", by: "plane" },
  car: { icon: "🚗", by: "car" },
  train: { icon: "🚆", by: "train" },
  ferry: { icon: "⛴", by: "ferry" },
  bike: { icon: "🚲", by: "bike" },
  hitch: { icon: "👍", by: "a hitched lift" },
};
/** Ways that cost nothing and need no station: he sets off from where he stands. */
export const FREE: ReadonlySet<Mode> = new Set(["bike", "hitch"]);
export const isRailwayStation = (p: Place) => p.class === "railway" && p.subclass === "station";
export const isFerryTerminal = (p: Place) => p.class === "ferry_terminal";

/** Seconds a ride of `distanceM` takes. */
export function rideS(mode: Mode, distanceM: number): number {
  return Math.min(distanceM / (MODE_MPS[mode] * RIDE_SPEEDUP), RIDE_MAX_S);
}

/** Cents for a ride of `distanceM`, rounded up to a cent and never free, but for cycling and hitchhiking. */
export function fare(mode: Mode, distanceM: number): number {
  const km = distanceM / 1000;
  if (mode === "plane") return Math.ceil(toCents(PLANE_BASE) + 100 * PLANE_PER_KM * km);
  if (FREE.has(mode)) return 0;
  return Math.max(Math.ceil(100 * PER_KM[mode] * km), 1);
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

/** Time zones between two longitudes, one per DEG_PER_ZONE degrees, the short way round. */
export function timeZones(lonA: number, lonB: number): number {
  const d = Math.abs(lonA - lonB) % 360;
  return Math.round(Math.min(d, 360 - d) / DEG_PER_ZONE);
}

/** The jet lag a flight across `zones` time zones gives, or null for none. */
export function jetLag(zones: number): NonNullable<Action["buff"]> | null {
  if (zones < 1) return null;
  return { name: "Jet-lagged", min: 60 * Math.min(JET_LAG_H_PER_ZONE * zones, JET_LAG_MAX_H), per_h: { energy: -JET_LAG_ENERGY_PER_H }, xp_mult: JET_LAG_XP };
}

export class Trips {
  constructor(
    readonly cities: City[] = [],
    readonly airports: Airport[] = [],
  ) {}

  /** The airport nearest to the point within reach, else a big city's made-up one, or null. */
  nearestAirport(lat: number, lon: number, reach = AIRPORT_REACH_M): Airport | null {
    return nearest(this.airports, lat, lon, reach) ?? madeAirport(this.cities, lat, lon, reach);
  }

  /**
   * How he gets from `here` to `city`, or why he can't. `places` are the
   * places loaded around him, `r` in [0, 1) decides plane or road (and a
   * ferry), `fareMult` scales the fare (his souvenirs make it cheaper), and
   * `hasBike` lets him cycle to a near town.
   */
  planTrip(city: City, here: LatLon, places: Place[], cents: number, hasCar: boolean, r: number, fareMult = 1, hasBike = false): Plan | NoPlan {
    const straight = distanceM(here[0], here[1], city.lat, city.lon);
    const at = (test: (p: Place) => boolean) => nearest(places, here[0], here[1], Infinity, test);
    const roadM = straight * ROAD_FACTOR;
    const setOff = (mode: Mode, distance_m: number): Plan => ({ city, mode, station: roadOut(here), fare: 0, arrive: [city.lat, city.lon], distance_m });
    if (hasBike && straight <= CYCLE_MAX_M) return setOff("bike", roadM);
    /** The road way out: his car, else a ferry now and then, a train for long trips, or the bus. */
    const road = (): [Mode, Place] | null => {
      if (hasCar) {
        const g = at(isGasStation);
        return g && ["car", g];
      }
      const ferry = straight <= FERRY_MAX_M && r < FERRY_CHANCE ? at(isFerryTerminal) : null;
      if (ferry) return ["ferry", ferry];
      const rail = roadM >= TRAIN_FROM_M ? at(isRailwayStation) : null;
      if (rail) return ["train", rail];
      const bus = at(isBusStation);
      return bus && ["bus", bus];
    };
    const order: ("plane" | "road")[] = r < planeChance(straight) ? ["plane", "road"] : ["road", "plane"];
    for (const way of order) {
      let mode: Mode = "plane";
      let station: Place | null;
      let arrive: LatLon = [city.lat, city.lon];
      let dist = roadM;
      if (way === "plane") {
        station = this.nearestAirport(here[0], here[1]);
        const there = this.nearestAirport(city.lat, city.lon);
        if (!station || !there || there.name === station.name) continue;
        arrive = [there.lat, there.lon];
        dist = distanceM(station.lat, station.lon, there.lat, there.lon);
      } else {
        if (straight > MAX_ROAD_M) continue;
        const found = road();
        if (!found) continue;
        [mode, station] = found;
        if (mode === "ferry") dist = straight;
      }
      const cost = Math.max(Math.ceil(fare(mode, dist) * fareMult), 1);
      if (cost > cents) {
        if (cents < HITCH_BELOW && straight <= MAX_ROAD_M) return setOff("hitch", roadM);
        return { error: `can't afford the ${mode} to ${city.name}: needs ${euro(cost)}, has ${euro(cents)}`, short_of: cost };
      }
      return { city, mode, station, fare: cost, arrive, distance_m: dist };
    }
    if (straight > MAX_ROAD_M) return { error: "too far to go by road, and no airport within reach" };
    return { error: `no ${hasCar ? "gas station" : "bus station"} or airport within reach` };
  }

  /** The listed city nearest to the point within `reach`, or null. */
  cityNear(lat: number, lon: number, reach = SAME_CITY_M): City | null {
    return nearest(this.cities, lat, lon, reach);
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

/** Where he sets off from on his bike or with his thumb out: right where he stands. */
export const roadOut = (here: LatLon): Place => ({ name: "the road out of town", class: "road", subclass: "", rank: 0, lat: here[0], lon: here[1] });

/** "Heading to X for the bus to Y (€5)", or how he sets off on his bike or hitchhiking. */
export function heading(plan: Plan, to: string): string {
  if (plan.mode === "bike") return `Setting off on his bike for ${to}`;
  if (plan.mode === "hitch") return `Broke, so he's heading to the road out of town to hitchhike to ${to}`;
  return `Heading to ${plan.station.name} for the ${plan.mode} to ${to} (${euro(plan.fare)})`;
}

export const isPlan = (p: Plan | NoPlan): p is Plan => !("error" in p);

/** An airport for a big city near [lat, lon] that has none of its own in reach, or null; the same city always gets the same one. */
export function madeAirport(cities: City[], lat: number, lon: number, reach = AIRPORT_REACH_M): Airport | null {
  const best = nearest(cities.filter((c) => c.pop >= AIRPORT_POP), lat, lon, reach);
  if (!best) return null;
  const rng = new Rng(seedOf(`${slug(best.name)}:airport`));
  const [alat, alon] = moved(best.lat, best.lon, rng.polar(AIRPORT_OUT_M));
  return { name: `${best.name} Airport`, class: "aerodrome", subclass: "airport", iata: "", code: best.code, rank: 1, lat: alat, lon: alon, id: `${slug(best.name)}:airport:0`, made: true };
}
