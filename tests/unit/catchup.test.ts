// The catch-up on its own: a small fake city, the real actions and fixed dice.
import { describe, expect, it } from "vitest";
import { Activities } from "../../src/core/activities";
import { catchUp, MADE_UP_KINDS, MAX_AWAY_S, type AwayCity, type CatchUpDeps } from "../../src/core/catchup";
import { bboxAround } from "../../src/core/geo";
import { Rng } from "../../src/core/rng";
import { FARE_CUT_MAX, SOUVENIRS_PER_CUT } from "../../src/core/keepsakes";
import { FIRST_VISIT_XP, HOSPITAL_FEE, Stats, visitKey, type Place } from "../../src/core/stats";
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
    hourAt: (ms) => new Date(ms).getUTCHours(),
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
    // Each stop goes on his day ribbon too, with when he got there.
    expect(stats.stops.length).toBe(s.stops);
    // And in his week, for the weekly recap.
    expect(stats.week.tally.stops).toBe(s.stops);
    expect(stats.week.tally.walkedM).toBeCloseTo(s.walkedM, 0);
    expect(stats.stops[0]!.t).toBeGreaterThanOrEqual(START_MS / 1000);
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

  it("at rock bottom he heads for the nearest fix, even past nearer, finer places", () => {
    // A rank 1 museum 500 m ahead (his favourite odds) against a diner 900 m away.
    const city: AwayCity = { ...HOME, places: [place("Grand Museum", "museum", "museum", 0.0045, 0), place("Big Diner", "restaurant", "restaurant", -0.008, 0)] };
    const first = (fullness: number, seed: number) => {
      const stats = new Stats();
      stats.meters.fullness = fullness;
      const s = catchUp(stats, city, [0, 0], 3600, START_MS, deps({ rng: new Rng(seed) }));
      return s.lines.find((l) => l.text.startsWith("Reached"))!.text;
    };
    for (let seed = 0; seed < 20; seed++) expect(first(2, seed)).toMatch(/^Reached Big Diner/);
    expect(Array.from({ length: 20 }, (_, i) => first(80, i)).some((t) => t.startsWith("Reached Grand Museum"))).toBe(true);
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
    // One trip, then he stays put.
    let rolls = 0;
    const s = catchUp(stats, HOME, [0, 0], 24 * 3600, START_MS, deps({ roll: () => (rolls++ ? 0.99 : 0.1) }));
    expect(s.cities).toHaveLength(1);
    expect(s.cities[0]).toBe("Nexttown, A-land");
    expect(s.end.city.name).not.toBe(HOME.name);
    expect(s.end.city.places).toBeNull();
    expect(s.lines.some((l) => l.text.startsWith("Took the bus to Nexttown"))).toBe(true);
    expect(s.lines.some((l) => l.text === "Arrived in Nexttown, A-land")).toBe(true);
    expect(stats.cents).toBeLessThan(500_000);
  });

  it("collects landmark cards and Placedex kinds at real places, none at made-up ones", () => {
    const stats = new Stats();
    stats.arrive("Bigtown", "AAA", "A-land");
    const museum = place("Town Museum", "museum", "museum", -0.002, -0.002);
    catchUp(stats, { ...HOME, places: [...PLACES, museum] }, [0, 0], 6 * 3600, START_MS, deps({ cardRng: new Rng(1) }));
    expect(stats.keepsakes.cards.get(visitKey(museum))).toMatchObject({ name: "Town Museum", rarity: "Rare", city: "Bigtown" });
    expect(stats.keepsakes.dex.has("cafe/cafe")).toBe(true);
    const away = new Stats();
    catchUp(away, { ...HOME, places: null }, [0, 0], 2 * 3600, START_MS, deps());
    expect(away.keepsakes.cards.size + away.keepsakes.dex.size).toBe(0);
  });

  it("tells his stats and worn gear where he lands, and cuts fares for souvenirs", () => {
    const run = (souvenirs: number) => {
      const stats = new Stats();
      stats.cents = 3000; // enough for the bus, not for new gear
      stats.gear.head = { name: "Cap", slot: "head", stats: {}, rarity: "Common", price: 100, story: { from: "Old", t: 0, countries: ["ZZZ"], km: 0 } };
      for (let i = 0; i < souvenirs; i++) stats.keepsakes.souvenirs.set(`C${i}`, { name: "magnet", country: "", city: "", t: 0 });
      let rolls = 0;
      const s = catchUp(stats, HOME, [0, 0], 24 * 3600, START_MS, deps({ roll: () => (rolls++ ? 0.99 : 0.1) }));
      return { stats, bus: s.lines.find((l) => l.text.startsWith("Took the bus to Nexttown"))!.text };
    };
    const { stats, bus } = run(0);
    expect(stats.where.code).toBe("AAA");
    expect(stats.where.city).toBe("Nexttown, A-land");
    expect(stats.gear.head!.story!.countries).toEqual(["ZZZ", "AAA"]);
    const cheaper = run(SOUVENIRS_PER_CUT * 5).bus;
    const fare = (line: string) => Math.round(Number(line.match(/-€([\d.]+)/)![1]) * 100);
    expect(fare(cheaper)).toBe(Math.ceil(fare(bus) * (1 - FARE_CUT_MAX)));
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
});
