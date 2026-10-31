// Packing a travel kit before a trip (src/core/travelKit.ts, Stats.packForTrip), and what a landing does to him (Stats.landFlight, Stats.landRide).
import { describe, expect, it } from "vitest";
import { KEEP_CENTS, ON_THE_TRAIL, Stats } from "../../src/core/stats";
import { choose, KIT, list, PACK_BELOW } from "../../src/core/travelKit";
import { SLEEPER_FROM_M } from "../../src/core/trips";

const full = { health: 100, energy: 100, fullness: 100, mood: 70, hygiene: 100, thirst: 100 };

describe("choose", () => {
  it("packs food and water by need, and a phrasebook only abroad", () => {
    expect(choose(full, 100_000, false, 0)).toEqual([]);
    expect(choose(full, 100_000, true, 0).map((k) => k.name)).toEqual(["a phrasebook"]);
    const hungry = { ...full, fullness: PACK_BELOW - 1, thirst: PACK_BELOW - 1 };
    expect(choose(hungry, 100_000, false, 0).map((k) => k.name)).toEqual(["snacks", "a water bottle"]);
  });

  it("leaves him his reserve", () => {
    const hungry = { ...full, fullness: 0, thirst: 0 };
    const snacks = KIT[0]!.cents;
    expect(choose(hungry, KEEP_CENTS + snacks, true, KEEP_CENTS).map((k) => k.name)).toEqual(["snacks"]);
    expect(choose(hungry, KEEP_CENTS, true, KEEP_CENTS)).toEqual([]);
  });

  it("lists names as a sentence", () => {
    expect(list(["a"])).toBe("a");
    expect(list(["a", "b", "c"])).toBe("a, b and c");
  });
});

describe("Stats.packForTrip", () => {
  it("pays for the kit, starts its buffs and says what he packed", () => {
    const s = new Stats();
    s.arrive("Sofia", "BGR", "Bulgaria");
    s.meters.fullness = 10;
    const before = s.cents;
    const line = s.packForTrip("FRA");
    expect(line).toMatch(/^Packed snacks and a phrasebook for the trip \(-€12\)$/);
    expect(s.cents).toBe(before - 1200);
    expect(s.buffNames()).toEqual(expect.arrayContaining(["Packed snacks", "Phrasebook"]));
  });

  it("says nothing when he needs nothing", () => {
    const s = new Stats();
    s.meters.fullness = 100;
    s.meters.thirst = 100;
    expect(s.packForTrip("FRA")).toBe("");
    s.arrive("Sofia", "BGR", "Bulgaria");
    expect(s.packForTrip("BGR")).toBe("");
  });
});

describe("Stats.landFlight", () => {
  it("leaves him jet-lagged after a long flight, not a short one", () => {
    const s = new Stats();
    expect(s.landFlight(23.4, 2.5)).toBe("Jet-lagged after flying across 1 time zone");
    expect(s.buffNames()).toContain("Jet-lagged");
    expect(s.xpMult()).toBeLessThan(1);
    expect(new Stats().landFlight(23.4, 25)).toBe("");
  });
});

describe("Stats.landRide", () => {
  it("a night train leaves him rested, a short train ride doesn't", () => {
    const s = new Stats();
    s.meters.energy = 20;
    expect(s.landRide("train", SLEEPER_FROM_M - 1, "Plovdiv")).toBe("");
    expect(s.meters.energy).toBe(20);
    expect(s.landRide("train", SLEEPER_FROM_M, "Varna")).toMatch(/night train/);
    expect(s.meters.energy).toBe(100);
  });

  it("cycling tires him by the km", () => {
    const s = new Stats();
    expect(s.landRide("bike", 25_000, "Pernik")).toBe("Tired legs after cycling 25 km");
    expect(s.meters.energy).toBeLessThan(100);
  });

  it("a hitched lift ends badly, well or quietly, the same for the same town and time", () => {
    const seen = new Set<string>();
    for (let t = 0; t < 200; t++) {
      const s = new Stats();
      s.now = () => t;
      const line = s.landRide("hitch", 100_000, "Plovdiv");
      const again = new Stats();
      again.now = () => t;
      expect(again.landRide("hitch", 100_000, "Plovdiv")).toBe(line);
      seen.add(line);
    }
    expect(seen.size).toBe(3);
  });

  it("a long walk keeps him fed on the way, then pays off in XP and mood", () => {
    const s = new Stats();
    expect(s.ride(2000, "walk", "the road out of town", "Pernik")).toBe("Walked out of town towards Pernik (-€20 for hostels)");
    expect(s.buffNames()).toContain(ON_THE_TRAIL);
    const before = { ...s.meters };
    s.passTime(5, 0);
    expect(s.meters.fullness).toBeCloseTo(before.fullness, 5);
    const xp = s.xp + s.level * 1000;
    expect(s.landRide("walk", 30_000, "Pernik")).toBe("Walked 30 km to Pernik, sleeping in 1 hostel on the way");
    expect(s.buffNames()).not.toContain(ON_THE_TRAIL);
    expect(s.xp + s.level * 1000).toBeGreaterThan(xp);
  });

  it("a bus, car, ferry or plane changes nothing here", () => {
    const s = new Stats();
    for (const m of ["bus", "car", "ferry", "plane"] as const) expect(s.landRide(m, SLEEPER_FROM_M * 2, "X")).toBe("");
  });
});
