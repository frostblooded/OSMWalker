// The catch-up on its own: a small fake city, the real actions and fixed dice.
import { describe, expect, it } from "vitest";
import { Activities } from "../../src/core/activities";
import { catchUp, legM, MADE_UP_KINDS, MAX_AWAY_S, type AwayCity, type CatchUpDeps } from "../../src/core/catchup";
import { bboxAround, distanceM } from "../../src/core/geo";
import { BRICKS_PER_DAY } from "../../src/core/bricks";
import { Rng } from "../../src/core/rng";
import { FARE_CUT_MAX, SOUVENIRS_PER_CUT } from "../../src/core/keepsakes";
import { FIRST_VISIT_XP, HOSPITAL_FEE, Stats, visitKey, type Place } from "../../src/core/stats";
import { skyAt } from "../../src/core/sky";
import { HITCH_BELOW, HOSTEL_CENTS, LONG_WALK_MAX_S, parseAirports, parseCities, ROAD_FACTOR, Trips } from "../../src/core/trips";
import * as Items from "../../src/core/items";
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
  it("does holiday things on a public holiday there", () => {
    const holidayLines = (holiday: boolean) => {
      const asked: string[] = [];
      const sky = (ms: number, c: { code: string; center: [number, number] }) => (asked.push(c.code), skyAt(ms, c.center[0], c.center[1], 0, null, holiday));
      const s = catchUp(new Stats(), HOME, [0, 0], 6 * 3600, START_MS, deps({ skyAt: sky }));
      return { lines: s.lines.filter((l) => /holiday/.test(l.text)), asked };
    };
    const on = holidayLines(true);
    expect(on.lines.length).toBeGreaterThan(0);
    expect(on.asked).toContain("AAA");
    expect(holidayLines(false).lines).toEqual([]);
  });

  it("covers the time away, at most a day", () => {
    const stats = new Stats();
    expect(catchUp(stats, HOME, [0, 0], 2 * 3600, START_MS, deps()).coveredS).toBe(2 * 3600);
    const long = catchUp(new Stats(), HOME, [0, 0], 30 * 3600, START_MS, deps());
    expect(long.awayS).toBe(30 * 3600);
    expect(long.coveredS).toBe(MAX_AWAY_S);
    expect(MAX_AWAY_S).toBe(24 * 3600);
  });

  it("on a flying mount he flies to a park near a far goal, like the watched walk; else the streets", () => {
    const stats = new Stats();
    const goal: [number, number] = [0, 0.02];
    const park = place("Park", "park", "park", 0, 0.018);
    const streets = { airM: 0, groundM: distanceM(0, 0, 0, 0.02) * ROAD_FACTOR, afoot: false };
    const flown = { airM: distanceM(0, 0, 0, 0.018), groundM: distanceM(0, 0.018, 0, 0.02) * ROAD_FACTOR, afoot: true };
    expect(legM(stats, [0, 0], goal, [park])).toEqual(streets);
    stats.equip(Items.build(Items.KINDS.dragons[0]!, Items.MATERIALS[0]!, []));
    expect(legM(stats, [0, 0], goal, [park])).toEqual(streets);
    stats.feedDragon(new Rng(1));
    const leg = legM(stats, [0, 0], goal, [park]);
    expect(leg.airM).toBeCloseTo(flown.airM, 6);
    expect(leg.groundM).toBeCloseTo(flown.groundM, 6);
    expect(leg.afoot).toBe(true);
    expect(legM(stats, [0, 0], goal, [])).toEqual(streets);
    expect(legM(stats, [0, 0], goal, null)).toEqual(streets);
    expect(legM(stats, [0, 0], [0, 0.002], [place("Park", "park", "park", 0, 0.0019)]).airM).toBe(0);
  });

  it("while he is away his dragon eats each day, or sulks when he is broke", () => {
    const dragon = () => {
      const s = new Stats();
      s.equip(Items.build(Items.KINDS.dragons[0]!, Items.MATERIALS[0]!, []));
      return s;
    };
    const fed = catchUp(dragon(), HOME, [0, 0], 3600, START_MS, deps());
    expect(fed.lines.filter((l) => l.text.startsWith("Fed his dragon"))).toHaveLength(1);
    const broke = dragon();
    broke.cents = 0;
    const s = catchUp(broke, HOME, [0, 0], 3600, START_MS, deps());
    expect(s.lines.some((l) => l.text.startsWith("His dragon sulks"))).toBe(true);
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
    // Each stop goes in his week, for the weekly recap.
    expect(stats.week.tally.stops).toBe(s.stops);
    expect(stats.week.tally.walkedM).toBeCloseTo(s.walkedM, 0);
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

  it("jokes fit the kind of place he is at", () => {
    const stats = new Stats();
    stats.jokes = { cafe: ["Cafe joke."], restaurant: ["Diner joke."], _generic: ["Other joke."] };
    const s = catchUp(stats, HOME, [0, 0], 12 * 3600, START_MS, deps());
    const texts = s.lines.map((l) => l.text);
    expect(texts.some((t) => / at Cafe (One|Two).* Cafe joke\.$/.test(t))).toBe(true);
    expect(texts.some((t) => / at Cafe (One|Two).* (Diner|Other) joke\.$/.test(t))).toBe(false);
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

  it("lands jet-lagged after a flight, as in a watched trip", () => {
    const stats = new Stats();
    stats.cents = 500_000;
    let rolls = 0;
    const s = catchUp(stats, HOME, [0, 0], 3600, START_MS, deps({ roll: () => (rolls++ ? 0.99 : 0) }));
    expect(s.lines.some((l) => l.text.startsWith("Took the plane to Farcity"))).toBe(true);
    expect(s.lines.some((l) => l.text === "Jet-lagged after flying across 1 time zone")).toBe(true);
  });

  it("packs a travel kit as he boards, as in a watched trip", () => {
    const stats = new Stats();
    stats.cents = 500_000;
    stats.meters.fullness = 10;
    let rolls = 0;
    const s = catchUp(stats, HOME, [0, 0], 3600, START_MS, deps({ roll: () => (rolls++ ? 0.99 : 0.1) }));
    const bus = s.lines.findIndex((l) => l.text.startsWith("Took the bus to Nexttown"));
    expect(s.lines[bus + 1]?.text).toMatch(/^Packed snacks/);
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
      // Long enough to ride there, too short to earn a new cap.
      const s = catchUp(stats, HOME, [0, 0], 3 * 3600, START_MS, deps({ roll: () => (rolls++ ? 0.99 : 0.1) }));
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

  it("a rascal's bus ride says when he skipped the ticket", () => {
    const lines: string[] = [];
    for (let i = 0; i < 40; i++) {
      const stats = new Stats();
      stats.cents = 500_000;
      stats.bond.lean = -100;
      const s = catchUp(stats, HOME, [0, 0], 3600, START_MS + i * 60_000, deps({ roll: () => 0.1 }));
      lines.push(...s.lines.filter((l) => l.text.startsWith("Took the bus")).map((l) => l.text));
    }
    expect(lines.some((l) => l.includes(" without a ticket"))).toBe(true);
  });

  it("while he follows an Explore whisper, places he has never been to pull him", () => {
    // Every place but Cafe Two is old to him; count how often it is his first stop.
    const firstAtNew = (explore: boolean) => {
      let n = 0;
      for (let i = 0; i < 30; i++) {
        const stats = new Stats();
        for (const p of PLACES) if (p.name !== "Cafe Two") stats.visited.add(visitKey(p));
        if (explore) [stats.bond.nudge, stats.bond.nudgeLeft] = ["explore", 600];
        const s = catchUp(stats, HOME, [0, 0], 1800, START_MS, deps({ rng: new Rng(i) }));
        if (s.lines.find((l) => l.text.startsWith("Reached"))?.text.startsWith("Reached Cafe Two")) n++;
      }
      return n;
    };
    expect(firstAtNew(true)).toBeGreaterThan(firstAtNew(false));
  });

  it("stays put while a need is urgent", () => {
    const stats = new Stats();
    stats.cents = 500_000;
    stats.meters.energy = 0;
    // Nothing in town gives energy back, so it stays urgent the whole time.
    const city: AwayCity = { ...HOME, places: [place("Grand Museum", "museum", "museum", 0.0045, 0)] };
    const s = catchUp(stats, city, [0, 0], 600, START_MS, deps({ roll: () => 0.1, activities: new Activities({ museum: [{ name: "Look", min: 1 }] }) }));
    expect(s.cities).toEqual([]);
  });

  it("finds golden bricks while away, at most a few a day", () => {
    const stats = new Stats();
    catchUp(stats, HOME, [0, 0], 24 * 3600, START_MS, deps());
    expect(stats.bricks.count).toBeGreaterThan(0);
    expect(stats.bricks.count).toBeLessThanOrEqual(2 * BRICKS_PER_DAY);
  });

  it("meets place creatures while away, at most one a day, taking his own pick", () => {
    const stats = Object.assign(new Stats(), { creatureKinds: JSON.parse(dataFile("creatures.json")) });
    const parks = [place("Town Park", "park", "park", 0.003, 0), place("Rose Garden", "garden", "garden", 0, 0.004), place("Old Fountain", "fountain", "fountain", -0.003, 0)];
    catchUp(stats, { ...HOME, places: [...PLACES, ...parks] }, [0, 0], 24 * 3600, START_MS, deps());
    const met = Object.values(stats.creatures.met).reduce((a, b) => a + b, 0);
    expect(met).toBeGreaterThan(0);
    expect(met).toBeLessThanOrEqual(2);
    expect(stats.history.entries.some((e) => /^(🌳|🧚) /.test(e.text))).toBe(true);
  });

  it("draws Magic from the places on ley lines and learns spells from library books while away", () => {
    const stats = Object.assign(new Stats(), { spellKinds: JSON.parse(dataFile("spells.json")) });
    const sights = [place("St Mary", "place_of_worship", "christian", 0.003, 0), place("City Library", "library", "library", 0, 0.004), place("Old Monument", "monument", "monument", -0.003, 0)];
    catchUp(stats, { ...HOME, places: [...PLACES, ...sights] }, [0, 0], 24 * 3600, START_MS, deps());
    // His feed keeps only the last lines, so the places he drew from today tell.
    expect(stats.lore.tapped).toEqual(expect.arrayContaining([visitKey(sights[0]!), visitKey(sights[2]!)]));
    expect(stats.magic).toBeGreaterThan(0);
    expect(stats.lore.known.length).toBeGreaterThan(0);
  });

  it("draws no Magic and learns no spells at made-up churches and libraries", () => {
    const stats = Object.assign(new Stats(), { spellKinds: JSON.parse(dataFile("spells.json")) });
    catchUp(stats, { ...HOME, places: null }, [0, 0], 24 * 3600, START_MS, deps());
    expect(stats.history.entries.some((e) => /^Reached a (church|library) in /.test(e.text))).toBe(true);
    expect(stats.magic).toBe(0);
    expect(stats.lore.known).toEqual([]);
  });

  it("builds no monument at made-up places, which are no real parks", () => {
    const stats = new Stats();
    stats.bricks.count = 10_000;
    catchUp(stats, { ...HOME, places: null }, [0, 0], 24 * 3600, START_MS, deps());
    expect(stats.bricks.built).toEqual([]);
  });

  it("saves up when he can't afford a trip", () => {
    const stats = new Stats();
    stats.cents = HITCH_BELOW;
    const s = catchUp(stats, HOME, [0, 0], 600, START_MS, deps({ roll: () => 0 }));
    expect(s.cities).toEqual([]);
    expect(stats.savingFor).toBeGreaterThan(HITCH_BELOW);
  });

  it("cycles to a near town on his bike, as in a watched trip", () => {
    const stats = new Stats();
    stats.equip(Items.build(Items.KINDS.bicycles[0]!, Items.MATERIALS[0]!, []));
    let rolls = 0;
    const near = new Trips(parseCities("Bigtown\tAAA\tA-land\t0.0\t0.0\t1000000\nNeartown\tAAA\tA-land\t0.2\t0.0\t500000\n"), parseAirports(AIRPORTS));
    const s = catchUp(stats, HOME, [0, 0], 3600, START_MS, deps({ trips: near, roll: () => (rolls++ ? 0.99 : 0.1) }));
    const lines = s.lines.map((l) => l.text);
    expect(lines).toContain("Setting off on his bike for Neartown");
    expect(lines).toContain("Cycled off to Neartown, A-land");
    expect(lines.some((l) => /^Tired legs after cycling \d+ km$/.test(l))).toBe(true);
  });

  it("goes on a long walk to a near town now and then, as in a watched trip", () => {
    const near = new Trips(parseCities("Bigtown\tAAA\tA-land\t0.0\t0.0\t1000000\nNeartown\tAAA\tA-land\t0.2\t0.0\t500000\n"), parseAirports(AIRPORTS));
    const away = (seed: number, s: number) => {
      const stats = new Stats();
      stats.cents = 100_000;
      let rolls = 0;
      return { stats, lines: catchUp(stats, HOME, [0, 0], s, START_MS, deps({ trips: near, rng: new Rng(seed), roll: () => (rolls++ ? 0.99 : 0.1) })).lines.map((l) => l.text) };
    };
    let seed = 1;
    while (seed < 60 && !away(seed, 6 * 3600).lines.some((l) => l.startsWith("Setting off on foot"))) seed++;
    const { stats, lines } = away(seed, 6 * 3600);
    expect(lines.some((l) => l.startsWith("Setting off on foot for Neartown"))).toBe(true);
    expect(lines.some((l) => /^Walked out of town towards Neartown, A-land \(-€20 for hostels\)$/.test(l))).toBe(true);
    expect(lines.some((l) => /^Walked \d+ km to Neartown, A-land, sleeping in 1 hostel on the way$/.test(l))).toBe(true);
    expect(stats.cents).toBeLessThanOrEqual(100_000 - HOSTEL_CENTS);
    // The same dice with too little time left: he doesn't set off.
    expect(away(seed, LONG_WALK_MAX_S - 60).lines.some((l) => l.startsWith("Walked out of town"))).toBe(false);
  });

  it("hitchhikes when broke, as in a watched trip", () => {
    const stats = new Stats();
    stats.cents = 0;
    let rolls = 0;
    const s = catchUp(stats, HOME, [0, 0], 3600, START_MS, deps({ roll: () => (rolls++ ? 0.99 : 0.1) }));
    expect(s.cities).toEqual(["Nexttown, A-land"]);
    expect(s.lines.some((l) => l.text === "Hitchhiked to Nexttown, A-land")).toBe(true);
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

  it("lives by the sky: closed shops at night, hour by hour", () => {
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

  it("finds a shop closed when it shuts while he walks there, and it isn't a stop", () => {
    const shop: AwayCity = { ...HOME, places: [place("Shoe Shop", "shop", "shoes", 0.003, 0)] };
    // Picked open at 19:59, reached after 20:00.
    const s = catchUp(new Stats(), shop, [0, 0], 30 * 60, Date.UTC(2026, 9, 29, 19, 59), deps({ skyAt: (ms, c) => skyAt(ms, c.center[0], c.center[1], 0, null) }));
    expect(s.lines.map((l) => l.text)).toContain("Found Shoe Shop closed");
    expect(s.lines.some((l) => l.text.startsWith("Reached Shoe Shop"))).toBe(false);
    // Stops count only the places he reached.
    expect(s.stops).toBe(s.lines.filter((l) => /^Reached (?!level )/.test(l.text)).length);
  });

  it("rolls the listed city's own quests on its key, not on the searched name", () => {
    const stats = new Stats();
    const q = (id: string, city?: string) => ({ id, city, icon: "🧪", title: `Quest ${id}`, items: ["a box"], lean: "wit" as const, twists: [], good: ["Good."], worse: ["Worse."], reward: {}, steps: [{ at: ["cafe"], say: ["At {PLACE}."] }, { at: ["shop"], say: ["At {PLACE}."] }] });
    stats.quests.bank = { names: ["Ana"], quests: [q("a"), q("big", "Bigtown, A-land")], events: [] };
    const cafes = Array.from({ length: 20 }, (_, i) => place(`Cafe ${i}`, "cafe", "cafe", 0.0005 * (i % 5), 0.0005 * Math.floor(i / 5)));
    const town: AwayCity = { ...HOME, name: "Bigtown, Some Province, A-land", key: "Bigtown, A-land", places: [...PLACES, ...cafes] };
    catchUp(stats, town, [0, 0], 600, START_MS, deps());
    expect([...stats.quests.board.map((o) => o.key), stats.quests.active?.key, ...stats.quests.done]).toContain("big");
  });

  it("lets a quest step at a closed place wait for it to open, instead of going back all night", () => {
    const stats = new Stats();
    const shop = place("Shoe Shop", "shop", "shoes", 0.003, 0);
    const town: AwayCity = { ...HOME, places: [shop, place("Duck Park", "park", "park", 0, 0.003)] };
    stats.quests.city = town.name;
    stats.quests.rolled = true;
    const at = { name: shop.name, class: shop.class, subclass: shop.subclass, lat: shop.lat, lon: shop.lon };
    stats.quests.active = { key: "k", kind: "none", giver: "Ana", item: 0, twist: 0, at, step: 0, target: at };
    const s = catchUp(stats, town, [0, 0], 3 * 3600, Date.UTC(2026, 9, 29, 22), deps({ skyAt: (ms, c) => skyAt(ms, c.center[0], c.center[1], 0, null) }));
    expect(s.lines.some((l) => l.text.includes("Shoe Shop"))).toBe(false);
    expect(s.lines.some((l) => l.text.startsWith("Reached Duck Park"))).toBe(true);
    expect(stats.quests.active?.key).toBe("k");
  });

  it("doesn't let a closed fix for an urgent need hold him: he goes where it's open", () => {
    const stats = new Stats();
    stats.meters.fullness = 0;
    // Hungry at 23:00, and the only food is a bakery shut for the night.
    const town: AwayCity = { ...HOME, places: [place("Night Bakery", "bakery", "bakery", 0.003, 0), place("Duck Park", "park", "park", 0, 0.003)] };
    const s = catchUp(stats, town, [0, 0], 2 * 3600, Date.UTC(2026, 9, 29, 23), deps());
    expect(s.lines.some((l) => l.text.startsWith("Reached Duck Park"))).toBe(true);
    expect(s.lines.some((l) => l.text.startsWith("Reached Night Bakery"))).toBe(false);
  });

  it("leaves the weather out while away, on foot and on rides alike", () => {
    const seen: boolean[] = [];
    class Watched extends Stats {
      override passTime(minutes: number, walkedM: number, afoot?: boolean): void {
        seen.push(!!this.sky?.weather);
        super.passTime(minutes, walkedM, afoot);
      }
    }
    const hot = { kind: "clear" as const, tempC: 35 };
    const s = catchUp(new Watched(), HOME, [0, 0], 24 * 3600, START_MS, deps({ roll: () => 0.1, skyAt: (ms, c) => skyAt(ms, c.center[0], c.center[1], 0, hot) }));
    expect(s.lines.some((l) => l.text.startsWith("Took the"))).toBe(true);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.filter(Boolean)).toEqual([]);
  });
});
