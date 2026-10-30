// Packing a travel kit before a trip (src/core/travelKit.ts, Stats.packForTrip), and jet lag after a flight (Stats.landFlight).
import { describe, expect, it } from "vitest";
import { Stats, KEEP_CENTS } from "../../src/core/stats";
import { choose, KIT, list, PACK_BELOW } from "../../src/core/travelKit";

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
