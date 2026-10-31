// The four mini-games' rules (src/core/minigames.ts).
import { describe, expect, it } from "vitest";
import { BULL, deal, NEAR, ODD_CELLS, oddGrid, oddScore, SWEEP_S, sweepAt, TAPS, tapScore, timingScore } from "../../src/core/minigames";
import { Rng } from "../../src/core/rng";

describe("timing", () => {
  it("sweeps across the bar and back", () => {
    expect(sweepAt(0)).toBe(0);
    expect(sweepAt(SWEEP_S / 2)).toBe(1);
    expect(sweepAt(SWEEP_S)).toBeCloseTo(0);
    expect(sweepAt(SWEEP_S / 4)).toBeCloseTo(0.5);
  });

  it("scores best in the middle, middling near it, worst far off", () => {
    expect(timingScore(0.5)).toBe(1);
    expect(timingScore(0.5 + BULL)).toBe(1);
    expect(timingScore(0.5 + NEAR)).toBe(0.5);
    expect(timingScore(0.5 - NEAR - 0.01)).toBe(0);
  });
});

describe("tap fast", () => {
  it("scores the share of TAPS, up to best", () => {
    expect(tapScore(0)).toBe(0);
    expect(tapScore(TAPS / 2)).toBe(0.5);
    expect(tapScore(TAPS * 2)).toBe(1);
  });
});

describe("pick a card", () => {
  it("deals one each of worst, middle and best, in any order", () => {
    const firsts = new Set<number>();
    for (let seed = 1; seed < 30; seed++) {
      const d = deal(new Rng(seed));
      expect([...d].sort()).toEqual([0, 0.5, 1]);
      firsts.add(d[0]!);
    }
    expect(firsts.size).toBe(3);
  });
});

describe("odd one out", () => {
  it("has exactly one odd icon, where it says", () => {
    for (let seed = 1; seed < 20; seed++) {
      const g = oddGrid(new Rng(seed));
      expect(g.icons).toHaveLength(ODD_CELLS);
      expect(g.icons.filter((i) => i === g.icons[g.odd]!)).toHaveLength(1);
      expect(new Set(g.icons).size).toBe(2);
    }
  });

  it("scores by wrong taps", () => {
    expect([oddScore(0), oddScore(1), oddScore(2)]).toEqual([1, 0.5, 0]);
  });
});
