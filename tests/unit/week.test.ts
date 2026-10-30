// His week in numbers: what the weekly recap sums up, when a week turns over, and how it is saved.
import { describe, expect, it } from "vitest";
import { Stats } from "../../src/core/stats";
import { Week, WEEK_S, weekStart } from "../../src/core/week";

/** Monday 2026-10-26 00:00 UTC. */
const MONDAY = 1792972800;

describe("weekStart", () => {
  it("is the last Monday midnight in the given time zone", () => {
    expect(weekStart(MONDAY, 0)).toBe(MONDAY);
    expect(weekStart(MONDAY + 3 * 86400 + 5000, 0)).toBe(MONDAY);
    expect(weekStart(MONDAY - 1, 0)).toBe(MONDAY - WEEK_S);
    // UTC+2: Monday starts at 22:00 UTC on Sunday.
    expect(weekStart(MONDAY, 120)).toBe(MONDAY - 7200);
  });
});

describe("Week", () => {
  it("starts counting on its first roll, with no recap", () => {
    const w = new Week();
    expect(w.roll(MONDAY + 100, 5000, 2, 0)).toBe(false);
    expect(w.tally.start).toBe(MONDAY);
    expect(w.pending()).toBeNull();
  });

  it("sums the week and turns it into a recap once the next week starts", () => {
    const w = new Week();
    w.roll(MONDAY + 100, 5000, 2, 0);
    w.walked(1500);
    w.walked(500);
    w.stop("cafe");
    w.stop("cafe");
    w.stop("museum");
    w.newPlace();
    w.city("Paris, France");
    w.city("Paris, France");
    expect(w.roll(MONDAY + WEEK_S - 1, 6000, 3, 0)).toBe(false);
    expect(w.roll(MONDAY + WEEK_S, 7000, 4, 0)).toBe(true);
    expect(w.pending()).toEqual({
      start: MONDAY, walkedM: 2000, stops: 3, newPlaces: 1, kinds: { cafe: 2, museum: 1 }, cities: ["Paris, France"],
      cents: 5000, level: 2, endCents: 7000, endLevel: 4,
    });
    expect(w.favourite()).toEqual(["cafe", 2]);
    expect(w.tally).toMatchObject({ start: MONDAY + WEEK_S, stops: 0, cents: 7000, level: 4 });
    w.seen();
    expect(w.pending()).toBeNull();
  });

  it("skips a recap for a week he did nothing in", () => {
    const w = new Week();
    w.roll(MONDAY, 0, 1, 0);
    expect(w.roll(MONDAY + WEEK_S, 0, 1, 0)).toBe(true);
    expect(w.pending()).toBeNull();
  });
});

describe("Stats", () => {
  it("counts walking, stops, new places and keeps the week in the save", () => {
    const s = new Stats();
    s.now = () => MONDAY + 3600;
    s.passTime(10, 800);
    s.stop({ class: "cafe", subclass: "cafe" });
    s.visit({ name: "Cafe", lat: 1, lon: 2 });
    s.week.city("Lyon, France");
    const back = Stats.fromJSON(JSON.parse(JSON.stringify(s)));
    expect(back.week.tally).toMatchObject({ walkedM: 800, stops: 1, newPlaces: 1, kinds: { cafe: 1 }, cities: ["Lyon, France"] });
  });

  it("loads old saves without a week", () => {
    const d = JSON.parse(JSON.stringify(new Stats()));
    delete d.week;
    expect(Stats.fromJSON(d).week.tally.start).toBe(0);
  });
});
