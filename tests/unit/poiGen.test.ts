// Made-up places: must-haves for what a city lacks, extras and wizard towers
// by city size, seeded per city, and made airports for big cities.
import { describe, expect, it } from "vitest";
import { ICON_OF } from "../../src/core/mapIcons";
import * as G from "../../src/core/poiGen";
import { madeAirport } from "../../src/core/trips";
import { distanceM } from "../../src/core/geo";
import type { Place } from "../../src/core/stats";

const CENTER: [number, number] = [42.7, 23.32];
const all: G.Need[] = ["bus", "gas", "food", "bed", "earn"];
const place = (name: string, cls: string, sub: string, lat: number, lon: number, rank = 1): Place => ({ name, class: cls, subclass: sub, rank, lat, lon });
const LANDMARKS = [
  place("Old Fort", "castle", "castle", 42.705, 23.32),
  place("Hill View", "attraction", "viewpoint", 42.69, 23.33),
  place("Statue", "monument", "monument", 42.7, 23.3),
  place("Big Museum", "museum", "museum", 42.71, 23.34),
  place("Clock Tower", "attraction", "attraction", 42.68, 23.31),
];
const PARK = place("City Garden", "park", "park", 42.698, 23.325);
const city = (pop: number, name = "Sofia") => ({ name, center: CENTER, pop });
const gen = (pop: number, real: Place[] = [...LANDMARKS, PARK], missing: G.Need[] = [], name = "Sofia") => G.generate(city(pop, name), real, missing, (lat, lon) => [lat, lon]);

describe("generated places", () => {
  it("sizes cities by population", () => {
    expect(G.tierOf(20_000)).toBe("town");
    expect(G.tierOf(300_000)).toBe("city");
    expect(G.tierOf(1_200_000)).toBe("capital");
    expect(G.tierOf(0)).toBe("town");
  });

  it("fills each missing must-have once, with a kind the game knows", () => {
    const made = gen(20_000, [], all);
    const kinds = made.filter((p) => p.must).map((p) => `${p.class}/${p.subclass}`);
    expect(kinds).toEqual(["bus/bus_station", "fuel/fuel", "restaurant/restaurant", "lodging/guest_house", "office/employment_agency"]);
  });

  it("adds nothing it doesn't need", () => {
    expect(gen(20_000, [], []).filter((p) => p.must)).toEqual([]);
  });

  it("puts must-haves near the centre, on a street", () => {
    const snapped = G.generate(city(20_000), [], ["bus"], () => [1, 2]);
    expect(snapped[0]!.lat).toBe(1);
    for (const p of gen(20_000, [], all)) expect(distanceM(CENTER[0], CENTER[1], p.lat, p.lon)).toBeLessThan(G.MUST_MAX_M + 1);
  });

  it("scales extras and wizard towers with size", () => {
    const count = (pop: number) => {
      const made = gen(pop);
      return [made.filter((p) => p.extra).length, made.filter((p) => p.class === G.TOWER_KIND).length];
    };
    expect(count(20_000)).toEqual([G.EXTRAS.town, 0]);
    expect(count(300_000)).toEqual([G.EXTRAS.city, 1]);
    expect(count(1_200_000)[1]).toBe(2);
    expect(count(6_000_000)[1]).toBe(3);
  });

  it("raises wizard towers at the grandest landmarks, far apart", () => {
    const towers = gen(6_000_000).filter((p) => p.class === G.TOWER_KIND);
    expect(towers[0]!.name).toBe("Wizard's tower at Old Fort");
    for (const a of towers) for (const b of towers) if (a !== b) expect(distanceM(a.lat, a.lon, b.lat, b.lon)).toBeGreaterThan(G.TOWER_APART_M);
  });

  it("builds no tower without a landmark", () => {
    expect(gen(6_000_000, [PARK]).filter((p) => p.class === G.TOWER_KIND)).toEqual([]);
  });

  it("puts extras at fitting real spots when there are some", () => {
    const well = gen(300_000).find((p) => p.class === "old_well")!;
    expect(well.name).toBe("Old well in City Garden");
    expect(distanceM(well.lat, well.lon, PARK.lat, PARK.lon)).toBeLessThan(60);
  });

  it("is the same for the same city and different for another", () => {
    expect(gen(1_200_000, undefined, all)).toEqual(gen(1_200_000, undefined, all));
    expect(gen(1_200_000, undefined, all).map((p) => p.lat)).not.toEqual(gen(1_200_000, undefined, all, "Plovdiv").map((p) => p.lat));
  });

  it("gives each place a stable id from the city and kind", () => {
    const ids = gen(1_200_000, undefined, all).map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("sofia:bus_station:0");
  });

  it("has an icon for every kind it makes", () => {
    for (const k of G.MADE_KINDS) expect(ICON_OF[k]).toBeTruthy();
  });
});

describe("made airports", () => {
  const cities = [
    { name: "Big", code: "XX", country: "X", lat: 10, lon: 10, pop: 900_000 },
    { name: "Small", code: "XX", country: "X", lat: 20, lon: 20, pop: 50_000 },
  ];
  it("gives a big city with no airport in reach one of its own", () => {
    const a = madeAirport(cities, 10.01, 10.01)!;
    expect(a.name).toBe("Big Airport");
    expect(a.made).toBe(true);
    expect(distanceM(10, 10, a.lat, a.lon)).toBeGreaterThan(5000);
    expect(madeAirport(cities, 10.01, 10.01)).toEqual(a);
  });
  it("gives a small town none", () => {
    expect(madeAirport(cities, 20, 20)).toBeNull();
  });
});
