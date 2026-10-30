// The catch-up on its own: a small fake city, the real actions and fixed dice.
import { describe, expect, it } from "vitest";
import { Activities } from "../../src/core/activities";
import { catchUp, MADE_UP_KINDS, MAX_AWAY_S, type AwayCity, type CatchUpDeps } from "../../src/core/catchup";
import { bboxAround } from "../../src/core/geo";
import { Rng } from "../../src/core/rng";
import { skyAt } from "../../src/core/sky";
import { FIRST_VISIT_XP, HOSPITAL_FEE, Stats, type Place } from "../../src/core/stats";
import { parseAirports, parseCities, Trips } from "../../src/core/trips";
import { dataFile } from "../support/data";

const CITIES = "Bigtown\tAAA\tA-land\t0.0\t0.0\t1000000\nNexttown\tAAA\tA-land\t1.0\t0.0\t500000\nFarcity\tBBB\tB-land\t10.0\t10.0\t3000\n";
const AIRPORTS = "Big Intl\tBIG\tAA\t0.01\t0.01\nFar Field\tFAR\tBB\t10.05\t10.0\n";
const place = (name: string, cls: string, sub: string, lat: number, lon: number): Place => ({ name, class: cls, subclass: sub, rank: 1, lat, lon });
const PLACES = [
  place("Cafe One", "cafe", "cafe", 0.003, 0),
  place("Cafe Two", "cafe", "cafe", 0, 0.004),
  place("Big Diner", "restaurant", "restaurant", -0.004, 0.001),
  place("Corner Shop", "shop", "convenience", 0.002, -0.003),
  place("Central Bus", "bus", "bus_station", 0.001, 0.001),
];
const HOME: AwayCity = { name: "Bigtown, A-land", code: "AAA", center: [0, 0], bounds: bboxAround(0, 0, 3000), places: PLACES };
const START_MS = Date.UTC(2026, 9, 29, 8, 0, 0);

function deps(o: Partial<CatchUpDeps> = {}): CatchUpDeps {
  return {
    activities: new Activities(JSON.parse(dataFile("actions.json"))),
    trips: new Trips(parseCities(CITIES), parseAirports(AIRPORTS)),
    rng: new Rng(7),
    skyAt: (ms, c) => skyAt(ms, c.center[0], c.center[1], 0, null),
    roll: () => 0.99,
    ...o,
  };
}

describe("catch-up", () => {
  it("covers the time away, at most a day", () => {
    const stats = new Stats();
    expect(catchUp(stats, HOME, [0, 0], 2 * 3600, START_MS, deps()).coveredS).toBe(2 * 3600);
    const long = catchUp(new Stats(), HOME, [0, 0], 30 * 3600, START_MS, deps());
    expect(long.awayS).toBe(30 * 3600);
    expect(long.coveredS).toBe(MAX_AWAY_S);
    expect(MAX_AWAY_S).toBe(24 * 3600);
  });

  it("lets the time pass for his body", () => {
    const stats = new Stats();
    const before = stats.meters.hygiene;
    catchUp(stats, HOME, [0, 0], 3 * 3600, START_MS, deps());
    expect(stats.meters.hygiene).toBeLessThan(before);
  });

  it("visits the city's real places and ends at the last one", () => {
    const stats = new Stats();
    const s = catchUp(stats, HOME, [0, 0], 3600, START_MS, deps());
    expect(s.stops).toBeGreaterThan(3);
    expect(s.walkedM).toBeGreaterThan(1000);
    expect(PLACES).toContainEqual(s.end.place);
    expect(s.end.at).toEqual([s.end.place!.lat, s.end.place!.lon]);
    expect(s.end.city).toBe(HOME);
    expect(s.lines.some((l) => l.text.startsWith("Reached Cafe") || l.text.startsWith("Reached Big Diner") || l.text.startsWith("Reached Corner Shop"))).toBe(true);
    expect(s.firstVisits).toBeGreaterThan(0);
  });

  it("puts his events in History at the times they happened", () => {
    const stats = new Stats();
    const s = catchUp(stats, HOME, [0, 0], 3600, START_MS, deps());
    const t0 = START_MS / 1000;
    for (const l of s.lines) {
      expect(l.t).toBeGreaterThanOrEqual(t0);
      expect(l.t).toBeLessThanOrEqual(t0 + 3600);
    }
    expect(stats.history.entries.at(-1)!.text).toBe(s.lines.at(-1)!.text);
    expect(stats.history.entries.at(-1)!.at).toEqual(s.end.at);
    // The time stamp goes back to the clock afterwards.
    expect(Math.abs(stats.now() - Date.now() / 1000)).toBeLessThan(5);
  });

  it("keeps the books: money, levels and what he bought", () => {
    const stats = new Stats();
    const s = catchUp(stats, HOME, [0, 0], 6 * 3600, START_MS, deps());
    expect(s.startCents).toBe(20000);
    expect(s.endCents).toBe(stats.cents);
    expect(s.startLevel).toBe(1);
    expect(s.endLevel).toBe(stats.level);
    expect(s.endLevel).toBeGreaterThan(1);
    expect(s.bought.every((l) => l.startsWith("Bought"))).toBe(true);
  });

  it("is the same every time for the same dice", () => {
    const a = catchUp(new Stats(), HOME, [0, 0], 4 * 3600, START_MS, deps());
    const b = catchUp(new Stats(), HOME, [0, 0], 4 * 3600, START_MS, deps());
    expect(a.lines.map((l) => l.text)).toEqual(b.lines.map((l) => l.text));
  });

  it("uses made-up places of the usual kinds where none are loaded", () => {
    const stats = new Stats();
    const s = catchUp(stats, { ...HOME, places: null }, [0, 0], 2 * 3600, START_MS, deps());
    expect(s.stops).toBeGreaterThan(3);
    expect(s.lines.some((l) => / at an? [a-z ]+ in Bigtown/.test(l.text))).toBe(true);
    // Made-up places give no first-visit bonus.
    expect(s.firstVisits).toBe(0);
    expect(s.end.place).toBeNull();
  });

  it("goes on trips as usual, and lands in a city with made-up places", () => {
    const stats = new Stats();
    stats.cents = 500_000;
    const s = catchUp(stats, HOME, [0, 0], 24 * 3600, START_MS, deps({ roll: () => 0.1 }));
    expect(s.cities.length).toBeGreaterThan(0);
    expect(s.cities[0]).toBe("Nexttown, A-land");
    expect(s.end.city.name).not.toBe(HOME.name);
    expect(s.end.city.places).toBeNull();
    expect(s.lines.some((l) => l.text.startsWith("Took the bus to Nexttown"))).toBe(true);
    expect(s.lines.some((l) => l.text === "Arrived in Nexttown, A-land")).toBe(true);
    expect(stats.cents).toBeLessThan(500_000);
  });

  it("saves up when he can't afford a trip", () => {
    const stats = new Stats();
    stats.cents = 0;
    const s = catchUp(stats, HOME, [0, 0], 600, START_MS, deps({ roll: () => 0.1 }));
    expect(s.cities).toEqual([]);
    expect(stats.savingFor).toBeGreaterThan(0);
  });

  it("faints when he starves, and pays the hospital", () => {
    const stats = new Stats();
    stats.cents = 100_000;
    Object.assign(stats.meters, { health: 0.01, fullness: 0, thirst: 0 });
    const s = catchUp(stats, { ...HOME, places: [place("City Hospital", "hospital", "hospital", 0.002, 0.002)] }, [0, 0], 3600, START_MS, deps());
    expect(s.faints).toBeGreaterThan(0);
    expect(s.lines.some((l) => l.text.startsWith("Fainted"))).toBe(true);
    expect(s.endCents).toBeLessThanOrEqual(100_000 - HOSPITAL_FEE + 20_000);
  });

  it("has its own actions for every kind of made-up place", () => {
    const actions = JSON.parse(dataFile("actions.json"));
    for (const k of MADE_UP_KINDS) expect(actions[`${k.class}/${k.subclass}`] ?? actions[k.class], `${k.class}/${k.subclass}`).toBeDefined();
  });

  it("counts first visits once each", () => {
    const stats = new Stats();
    const s = catchUp(stats, HOME, [0, 0], 6 * 3600, START_MS, deps());
    expect(s.firstVisits).toBeLessThanOrEqual(PLACES.length);
    expect(s.lines.filter((l) => l.text.includes(`(+${FIRST_VISIT_XP} XP)`)).length).toBe(s.firstVisits);
  });

  it("lives by the sky: closed shops at night, and the weather of each hour", () => {
    const shops: AwayCity = { ...HOME, places: [place("Shoe Shop", "shop", "shoes", 0.003, 0), place("Shoe Shop Two", "shop", "shoes", 0, 0.004)] };
    const night = Date.UTC(2026, 9, 29, 22);
    const seen: number[] = [];
    const s = catchUp(new Stats(), shops, [0, 0], 4 * 3600, night, deps({ skyAt: (ms, c) => (seen.push(ms), skyAt(ms, c.center[0], c.center[1], 0, { kind: "snow", tempC: -3 })) }));
    expect(s.walkedM).toBeGreaterThan(0);
    // Every place is closed, so he walks to random spots: no stops, no made-up places.
    expect(s.stops).toBe(0);
    expect(s.lines.filter((l) => l.text.startsWith("Reached"))).toEqual([]);
    expect(Math.max(...seen)).toBeGreaterThan(night + 3 * 3600_000);
  });
});
