// The boost after time away (src/core/boost.ts): how long it lasts. How the game spends it is in tests/integration/game-away.test.ts.
import { describe, expect, it } from "vitest";
import { BOOST, boostFor } from "../../src/core/boost";

describe("the boost after time away", () => {
  it("makes up exactly the missed time: away ÷ (BOOST - 1) of real time at BOOST x", () => {
    const away = 8 * 3600;
    const b = boostFor(away);
    // While boosted he lives BOOST x the real time, which is the real time plus everything missed.
    expect(b * BOOST).toBeCloseTo(b + away);
  });

  it("has no cap", () => {
    expect(boostFor(30 * 86400)).toBeCloseTo((30 * 86400) / (BOOST - 1));
  });
});
