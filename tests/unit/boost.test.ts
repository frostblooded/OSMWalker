import { describe, expect, it } from "vitest";
import { BOOST, boostFor, MIN_AWAY_S, spend } from "../../src/core/boost";

describe("the boost after time away", () => {
  it("makes up exactly the missed time: away ÷ (BOOST - 1) of real time at BOOST x", () => {
    const away = 8 * 3600;
    const b = boostFor(away);
    expect(b).toBeCloseTo(away / 9);
    // While boosted he lives BOOST x the real time, which is the real time plus everything missed.
    expect(spend(b, b).gameS).toBeCloseTo(b + away);
  });

  it("gives nothing for a short absence, and has no cap", () => {
    expect(boostFor(MIN_AWAY_S - 1)).toBe(0);
    expect(boostFor(30 * 86400)).toBeCloseTo((30 * 86400) / (BOOST - 1));
  });

  it("runs BOOST x while it lasts and 1x after, within one step", () => {
    expect(spend(1, 5)).toEqual({ gameS: BOOST, leftS: 4 });
    expect(spend(1, 0.25)).toEqual({ gameS: 0.25 * BOOST + 0.75, leftS: 0 });
    expect(spend(1, 0)).toEqual({ gameS: 1, leftS: 0 });
  });
});
