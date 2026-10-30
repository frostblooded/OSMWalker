import { isAirport } from "../../src/core/cityCheck";
import { euro } from "../../src/core/money";
import { describe, expect, it } from "vitest";
import { distanceM } from "../../src/core/geo";
import { Rng } from "../../src/core/rng";
import type { Place } from "../../src/core/stats";
import * as T from "../../src/core/trips";
import { dataFile } from "../support/data";

const LIST = "# comment\nBigtown\tAAA\tA-land\t0.0\t0.0\t1000000\nSmallton\tAAA\tA-land\t1.0\t0.0\t1000\nNexttown\tAAA\tA-land\t0.1\t0.0\t500000\nFarcity\tBBB\tB-land\t10.0\t10.0\t3000\nOther\tCCC\tC-land\t-10.0\t10.0\t1000\n";
const AIRPORTS = "# comment\nBig Intl\tBIG\tAA\t0.1\t0.1\nFar Field\tFAR\tBB\t10.05\t10.0\n";
const BUS_STATION: Place = { name: "Central Bus", class: "bus", subclass: "bus_station", rank: 5, lat: 0.01, lon: 0 };
const FUEL: Place = { name: "Fuel Stop", class: "fuel", subclass: "fuel", rank: 9, lat: 0, lon: 0.01 };
const CAFE: Place = { name: "Cafe", class: "cafe", subclass: "cafe", rank: 1, lat: 0, lon: 0.002 };
const city = (name: string, lat: number, lon: number): T.City => ({ name, code: "", country: "", lat, lon, pop: 1000 });

const trips = (airports = false) => new T.Trips(T.parseCities(LIST), airports ? T.parseAirports(AIRPORTS) : []);
const plan = (p: T.Plan | T.NoPlan): T.Plan => {
  if (!T.isPlan(p)) throw new Error(p.error);
  return p;
};
const smalltonFare = T.fare("bus", distanceM(0, 0, 1, 0) * T.ROAD_FACTOR);

describe("trip odds", () => {
  it("rolls 87.5% stay, 10% city, 2.5% country", () => {
    expect(T.roll(0)).toBe("country");
    expect(T.roll(0.024)).toBe("country");
    expect(T.roll(0.025)).toBe("city");
    expect(T.roll(0.124)).toBe("city");
    expect(T.roll(0.125)).toBe("stay");
    expect(T.roll(0.999)).toBe("stay");
  });

  it("doubles the odds in a city with no places", () => {
    expect(T.roll(0.049, T.NO_PLACES_BOOST)).toBe("country");
    expect(T.roll(0.249, T.NO_PLACES_BOOST)).toBe("city");
    expect(T.roll(0.25, T.NO_PLACES_BOOST)).toBe("stay");
  });

  it("gets planes likelier with distance", () => {
    expect(T.planeChance(100_000)).toBe(0);
    expect(T.planeChance(500_000)).toBeGreaterThan(0.3);
    expect(T.planeChance(500_000)).toBeLessThan(0.5);
    expect(T.planeChance(1_200_000)).toBe(1);
  });
});

describe("rides", () => {
  it("go 10x faster than real speeds", () => {
    expect(T.rideS("bus", 80_000)).toBeCloseTo(360);
    expect(T.rideS("plane", 800_000)).toBeCloseTo(360);
    expect(T.rideS("car", 90_000)).toBeCloseTo(360);
  });

  it("never take longer than 15 minutes", () => {
    expect(T.rideS("bus", 300_000)).toBe(15 * 60);
    expect(T.rideS("plane", 20_000_000)).toBe(15 * 60);
    expect(T.RIDE_MAX_S).toBe(15 * 60);
  });

  it("cost real prices", () => {
    expect(T.fare("bus", 300_000)).toBe(2400);
    expect(T.fare("plane", 1_430_000)).toBe(9290);
    expect(T.fare("car", 100_000)).toBe(1200);
    expect(T.fare("bus", 1000)).toBe(8);
    expect(T.fare("bus", 1)).toBe(1);
  });
});

describe("airports", () => {
  it("parse as places", () => {
    const a = trips(true).airports;
    expect(a).toHaveLength(2);
    expect(a[0]!.name).toBe("Big Intl");
    expect(isAirport(a[0]!)).toBe(true);
  });

  it("are found within reach only", () => {
    expect(trips(true).nearestAirport(0, 0)!.name).toBe("Big Intl");
    expect(trips(true).nearestAirport(5, 5)).toBeNull();
  });

  it("know the nearest listed city, not just any near one", () => {
    const t = new T.Trips([
      { name: "Aville", code: "XX", country: "X", lat: 30.1, lon: 30, pop: 10_000 },
      { name: "Bigtown", code: "XX", country: "X", lat: 30, lon: 30, pop: 2_000_000 },
    ]);
    expect(t.cityNear(30.001, 30)!.name).toBe("Bigtown");
    expect(t.cityNear(35, 35)).toBeNull();
  });

  it("are made up for a big city with none in reach", () => {
    const t = new T.Trips([{ name: "Bigtown", code: "XX", country: "X", lat: 30, lon: 30, pop: 2_000_000 }], []);
    expect(t.nearestAirport(30, 30)!.name).toBe("Bigtown Airport");
  });
});

describe("planTrip", () => {
  it("takes the bus from the nearest station on a short trip", () => {
    const far = city("Smallton", 1, 0);
    const p = plan(trips(true).planTrip(far, [0, 0], [CAFE, BUS_STATION], 10_000, false, 0.99));
    expect(p.mode).toBe("bus");
    expect(p.station.name).toBe("Central Bus");
    expect(p.fare).toBe(smalltonFare);
    expect(p.arrive).toEqual([1, 0]);
    expect(p.city).toBe(far);
  });

  it("flies between airports on a long trip", () => {
    const p = plan(trips(true).planTrip(city("Farcity", 10, 10), [0, 0], [BUS_STATION], 100_000, false, 0));
    expect(p.mode).toBe("plane");
    expect(p.station.name).toBe("Big Intl");
    expect(p.arrive).toEqual([10.05, 10]);
  });

  it("takes the bus far away when there is no airport", () => {
    expect(plan(trips().planTrip(city("Farcity", 10, 10), [0, 0], [BUS_STATION], 100_000, false, 0)).mode).toBe("bus");
  });

  it("sends no bus across an ocean", () => {
    expect(trips().planTrip(city("Overseas", 0, 60), [0, 0], [BUS_STATION], 10_000_000, false, 0)).toEqual({ error: "too far to go by road, and no airport within reach" });
  });

  it("fills up and drives with a car", () => {
    const p = plan(trips().planTrip(city("Smallton", 1, 0), [0, 0], [BUS_STATION, FUEL], 10_000, true, 0.99));
    expect(p.mode).toBe("car");
    expect(p.station.name).toBe("Fuel Stop");
  });

  it("never fills up at an EV charger, which the map files under fuel too", () => {
    const charger: Place = { ...FUEL, name: "Charger", subclass: "charging_station", lon: 0.001 };
    const p = plan(trips().planTrip(city("Smallton", 1, 0), [0, 0], [charger, FUEL], 10_000, true, 0.99));
    expect(p.station.name).toBe("Fuel Stop");
  });

  it("says why there is no way out", () => {
    expect(trips().planTrip(city("Smallton", 1, 0), [0, 0], [CAFE], 100, false, 0.5)).toEqual({ error: "no bus station or airport within reach" });
  });

  it("says how much is needed", () => {
    const far = city("Farton", 2, 0);
    const fare = T.fare("bus", distanceM(0, 0, 2, 0) * T.ROAD_FACTOR);
    expect(fare).toBeGreaterThan(T.HITCH_BELOW);
    expect(trips().planTrip(far, [0, 0], [BUS_STATION], T.HITCH_BELOW, false, 0.99)).toEqual({
      error: `can't afford the bus to Farton: needs ${euro(fare)}, has ${euro(T.HITCH_BELOW)}`,
      short_of: fare,
    });
  });

  it("hitchhikes for free when broke instead of saving up", () => {
    const plan = trips().planTrip(city("Smallton", 1, 0), [0, 0], [BUS_STATION], 3, false, 0.99);
    expect(plan).toMatchObject({ mode: "hitch", fare: 0, station: { name: "the road out of town" } });
  });

  it("takes the train from a railway station for a long road trip, and the bus for a short one", () => {
    const rail: Place = { ...BUS_STATION, name: "Central Station", class: "railway", subclass: "station" };
    expect(trips().planTrip(city("Smallton", 1, 0), [0, 0], [BUS_STATION, rail], 100_000, false, 0.99)).toMatchObject({ mode: "train", station: { name: "Central Station" } });
    expect(trips().planTrip(city("Neartown", 0.5, 0), [0, 0], [BUS_STATION, rail], 100_000, false, 0.99)).toMatchObject({ mode: "bus" });
  });

  it("sometimes takes the ferry from a ferry terminal, straight over the water", () => {
    const ferry: Place = { ...BUS_STATION, name: "Harbour", class: "ferry_terminal", subclass: "ferry_terminal" };
    const c = city("Smallton", 1, 0);
    const plan = trips().planTrip(c, [0, 0], [BUS_STATION, ferry], 100_000, false, T.FERRY_CHANCE - 0.01);
    expect(plan).toMatchObject({ mode: "ferry", distance_m: distanceM(0, 0, 1, 0) });
    expect(trips().planTrip(c, [0, 0], [BUS_STATION, ferry], 100_000, false, T.FERRY_CHANCE)).toMatchObject({ mode: "bus" });
  });

  it("cycles to a near town on his bike, for free", () => {
    const near = city("Neartown", 0.2, 0);
    expect(trips().planTrip(near, [0, 0], [BUS_STATION], 100_000, false, 0.99, 1, true)).toMatchObject({ mode: "bike", fare: 0 });
    expect(trips().planTrip(city("Smallton", 1, 0), [0, 0], [BUS_STATION], 100_000, false, 0.99, 1, true)).toMatchObject({ mode: "bus" });
  });

  it("has a ride time and an icon for every way of travelling", () => {
    for (const m of Object.keys(T.MODES) as T.Mode[]) expect(T.rideS(m, 100_000)).toBeGreaterThan(0);
    expect(T.fare("bike", 50_000)).toBe(0);
    expect(T.fare("hitch", 50_000)).toBe(0);
    expect(T.fare("train", 100_000)).toBe(Math.ceil(100 * T.TRAIN_PER_KM * 100));
  });
});

describe("cities", () => {
  it("parse the list", () => {
    const t = trips();
    expect(t.cities).toHaveLength(5);
    expect(t.cities[0]).toEqual({ name: "Bigtown", code: "AAA", country: "A-land", lat: 0, lon: 0, pop: 1_000_000 });
  });

  it("give the country of the nearest city", () => {
    expect(trips().countryAt(9, 9)).toBe("BBB");
    expect(trips().countryAt(0.01, 0.02)).toBe("AAA");
  });

  it("keep a city trip in the country and out of town", () => {
    const rng = new Rng(7);
    for (let i = 0; i < 50; i++) {
      const c = trips().pick("city", "AAA", 0, 0, rng)!;
      expect(c.code).toBe("AAA");
      expect(c.name).not.toBe("Bigtown");
    }
  });

  it("send a country trip abroad", () => {
    const rng = new Rng(7);
    for (let i = 0; i < 50; i++) expect(trips().pick("country", "AAA", 0, 0, rng)!.code).not.toBe("AAA");
  });

  it("pick bigger cities more often", () => {
    const rng = new Rng(7);
    const t = trips();
    const counts: Record<string, number> = {};
    for (let i = 0; i < 2000; i++) {
      const n = t.pick("country", "AAA", 0, 0, rng)!.name;
      counts[n] = (counts[n] ?? 0) + 1;
    }
    const ratio = counts.Farcity! / counts.Other!;
    expect(ratio).toBeGreaterThan(2.4);
    expect(ratio).toBeLessThan(3.8);
  });

  it("mean no trip when there is nowhere to go", () => {
    const rng = new Rng(7);
    expect(trips().pick("city", "BBB", 10, 10, rng)).toBeNull();
    expect(trips().pick("stay", "AAA", 0, 0, rng)).toBeNull();
  });

  it("give bigger cities wider destination areas", () => {
    expect(T.cityRadiusM(100)).toBe(T.MIN_CITY_RADIUS_M);
    expect(T.cityRadiusM(1_000_000)).toBeCloseTo(8000);
    expect(T.cityRadiusM(30_000_000)).toBe(T.MAX_CITY_RADIUS_M);
    const b = T.cityBounds(trips().cities[0]!);
    expect(b[0]).toBeLessThan(0);
    expect(b[2]).toBeGreaterThan(0);
  });

  it("list the options for a trip", () => {
    expect(trips().options("city", "AAA", 0, 0).map((c) => c.name)).toEqual(["Smallton"]);
    expect(trips().options("stay", "AAA", 0, 0)).toEqual([]);
  });

  it("cover the world in the bundled lists", () => {
    const all = new T.Trips(T.parseCities(dataFile("cities.tsv")), T.parseAirports(dataFile("airports.tsv")));
    expect(all.cities.length).toBeGreaterThan(5000);
    expect(all.countryAt(42.69, 23.32)).toBe("BGR");
    expect(all.airports.length).toBeGreaterThan(3000);
    expect(all.nearestAirport(42.69, 23.32)!.name).toBe("Sofia Airport");
  });
});

describe("jet lag", () => {
  it("counts time zones one per 15 degrees, the short way round", () => {
    expect(T.timeZones(0, 7)).toBe(0);
    expect(T.timeZones(0, 8)).toBe(1);
    expect(T.timeZones(23.4, 139.7)).toBe(8);
    expect(T.timeZones(170, -170)).toBe(1);
  });

  it("lasts an hour per zone up to JET_LAG_MAX_H, draining energy and cutting XP", () => {
    expect(T.jetLag(0)).toBeNull();
    expect(T.jetLag(3)).toMatchObject({ name: "Jet-lagged", min: 180, per_h: { energy: -T.JET_LAG_ENERGY_PER_H }, xp_mult: T.JET_LAG_XP });
    expect(T.jetLag(20)!.min).toBe(60 * T.JET_LAG_MAX_H);
  });
});
