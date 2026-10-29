import { describe, expect, it } from "vitest";
import * as G from "../../src/core/goals";
import { Rng } from "../../src/core/rng";
import type { Place } from "../../src/core/stats";

describe("goal weights", () => {
  it("weigh medium distances most", () => {
    expect(G.distanceWeight(G.GOAL_PEAK_M)).toBeCloseTo(1, 6);
    expect(G.distanceWeight(100)).toBeLessThan(0.2);
    expect(G.distanceWeight(2000)).toBeLessThan(0.12);
    expect(G.distanceWeight(2000)).toBeGreaterThan(0.03);
    expect(G.distanceWeight(5000)).toBeLessThan(0.01);
    expect(G.distanceWeight(300)).toBeGreaterThan(0.6);
    expect(G.distanceWeight(900)).toBeGreaterThan(0.6);
    expect(G.distanceWeight(0)).toBe(G.distanceWeight(1));
  });

  it("weigh straight ahead three times straight back", () => {
    expect(G.HEADING_RATIO).toBe(3);
    const north: G.Vec = [0, 1];
    const ahead = G.headingWeight(north, [0, 500]);
    const back = G.headingWeight(north, [0, -500]);
    const side = G.headingWeight(north, [500, 0]);
    expect(ahead / back).toBeCloseTo(G.HEADING_RATIO, 6);
    expect(side).toBeCloseTo(1, 6);
    const diag = G.headingWeight(north, [300, 300]);
    expect(diag).toBeGreaterThan(side);
    expect(diag).toBeLessThan(ahead);
  });

  it("have no pull without a heading", () => {
    expect(G.headingWeight([0, 0], [0, 500])).toBe(1);
    expect(G.headingWeight([0, 1], [0, 0])).toBe(1);
  });

  it("pick with their odds", () => {
    expect(G.pickIndex([1, 0.25], 0)).toBe(0);
    expect(G.pickIndex([1, 0.25], 0.79)).toBe(0);
    expect(G.pickIndex([1, 0.25], 0.81)).toBe(1);
    expect(G.pickIndex([], 0.5)).toBe(-1);
  });

  it("multiply rank, distance, heading and need", () => {
    const p: Place = { name: "Cafe", class: "cafe", subclass: "cafe", rank: 2, lat: 42.0045, lon: 23 };
    const w = G.weigh(p, [42, 23], [0, 1], 0.5);
    expect(w.rank_w).toBe(0.5);
    expect(w.need_w).toBe(0.5);
    expect(w.weight).toBeCloseTo(w.rank_w * w.dist_w * w.heading_w * w.need_w, 9);
    expect(w.heading_w).toBeGreaterThan(1);
  });

  it("weigh only rank and need without a position", () => {
    const p: Place = { name: "Cafe", class: "cafe", subclass: "cafe", rank: 4, lat: 42, lon: 23 };
    expect(G.weigh(p, null, [0, 0], 2)).toEqual({ rank_w: 0.25, dist_m: 0, dist_w: 1, heading_w: 1, need_w: 2, weight: 0.5 });
  });

  it("draw random spots inside the box", () => {
    const box: [number, number, number, number] = [41.99, 22.99, 42.01, 23.01];
    const rng = new Rng(2);
    for (let i = 0; i < 50; i++) {
      const [lat, lon] = G.randomSpot(rng, box, i % 2 ? [42, 23] : null, [0, 1]);
      expect(lat).toBeGreaterThanOrEqual(box[0]);
      expect(lat).toBeLessThanOrEqual(box[2]);
      expect(lon).toBeGreaterThanOrEqual(box[1]);
      expect(lon).toBeLessThanOrEqual(box[3]);
    }
  });
});
