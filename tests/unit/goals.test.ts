import { describe, expect, it } from "vitest";
import * as G from "../../src/core/goals";
import { Rng } from "../../src/core/rng";

describe("goal dice", () => {
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
