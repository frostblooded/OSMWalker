// His day so far: the stops the day ribbon shows, and how they are saved.
import { describe, expect, it } from "vitest";
import { addStop, dayStart, MAX_STOPS, RIBBON, ribbon, type Stop } from "../../src/core/day";
import { Stats } from "../../src/core/stats";

const cafe = { class: "cafe", subclass: "cafe" };
const museum = { class: "museum", subclass: "museum" };
/** 2026-10-30 00:00 UTC. */
const MIDNIGHT = 1793318400;

describe("dayStart", () => {
  it("is the last midnight in the given time zone", () => {
    expect(dayStart(MIDNIGHT + 3600, 0)).toBe(MIDNIGHT);
    expect(dayStart(MIDNIGHT - 1, 0)).toBe(MIDNIGHT - 86400);
    // UTC+2: local midnight is 22:00 UTC the day before.
    expect(dayStart(MIDNIGHT + 3600, 120)).toBe(MIDNIGHT - 7200);
  });
});

describe("stops", () => {
  it("keeps the newest MAX_STOPS", () => {
    const stops: Stop[] = [];
    for (let i = 0; i < MAX_STOPS + 5; i++) addStop(stops, cafe, i);
    expect(stops.length).toBe(MAX_STOPS);
    expect(stops[0]!.t).toBe(5);
  });

  it("the ribbon shows today's stops as icons, newest last", () => {
    const stops: Stop[] = [];
    addStop(stops, museum, MIDNIGHT - 60);
    addStop(stops, cafe, MIDNIGHT + 60);
    addStop(stops, museum, MIDNIGHT + 120);
    expect(ribbon(stops, MIDNIGHT + 3600, 0)).toEqual({ kinds: ["cafe/cafe", "museum/museum"], more: 0 });
  });

  it("shows the last RIBBON icons and counts the rest", () => {
    const stops: Stop[] = [];
    for (let i = 0; i < RIBBON + 3; i++) addStop(stops, i === RIBBON + 2 ? museum : cafe, MIDNIGHT + i);
    const r = ribbon(stops, MIDNIGHT + 3600, 0);
    expect(r.kinds.length).toBe(RIBBON);
    expect(r.kinds.at(-1)).toBe("museum/museum");
    expect(r.more).toBe(3);
  });

  it("is empty after midnight", () => {
    const stops: Stop[] = [];
    addStop(stops, cafe, MIDNIGHT - 60);
    expect(ribbon(stops, MIDNIGHT + 60, 0)).toEqual({ kinds: [], more: 0 });
  });
});

describe("Stats", () => {
  it("notes each stop with when it was, and keeps them in the save", () => {
    const s = new Stats();
    s.now = () => MIDNIGHT + 10;
    s.stop(cafe);
    const back = Stats.fromJSON(JSON.parse(JSON.stringify(s)));
    expect(back.stops).toEqual([{ k: "cafe/cafe", t: MIDNIGHT + 10 }]);
  });

  it("loads old saves without stops", () => {
    const d = JSON.parse(JSON.stringify(new Stats()));
    delete d.stops;
    expect(Stats.fromJSON(d).stops).toEqual([]);
  });
});
