// @vitest-environment happy-dom
// The away card: its Side income card shows what his businesses and the lottery brought in, and only then.
import { h, render } from "preact";
import { describe, expect, it } from "vitest";
import type { Summary } from "../../src/core/catchup";
import { Week } from "../../src/core/week";
import { AwaySheet } from "../../src/ui/AwaySheet";

const summary = (o: Partial<Summary> = {}): Summary => ({
  awayS: 3600, coveredS: 3600, walkedM: 0, stops: 0, firstVisits: 0, cities: [], faints: 0, startCents: 0, endCents: 0, startLevel: 1, endLevel: 1,
  takings: 0, lotteryWon: 0, bought: [], lines: [], end: { city: { name: "X", code: "", center: [0, 0], bounds: [0, 0, 0, 0], places: null } as unknown as Summary["end"]["city"], at: [0, 0], place: null, skipRoll: false }, ...o,
});
const shown = (s: Summary) => {
  const root = document.createElement("div");
  render(h(AwaySheet, { summary: s, clover: false, week: new Week(), dilemma: null, onChoose: () => {}, onDone: () => {} }), root);
  return root.textContent ?? "";
};

describe("away card", () => {
  it("shows side income only when there was some", () => {
    expect(shown(summary())).not.toContain("Side income");
    const text = shown(summary({ takings: 1234, lotteryWon: 500 }));
    expect(text).toContain("💹 His businesses took in+€12.34");
    expect(text).toContain("🎟 Lottery prizes+€5");
  });
});
