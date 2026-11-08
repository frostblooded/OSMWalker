// @vitest-environment happy-dom
// The Stats sheet: his level with the XP to the next one, his money and the places he has been to.
import { h, render } from "preact";
import { describe, expect, it } from "vitest";
import { Stats } from "../../src/core/stats";
import { StatsSheet } from "../../src/ui/StatsSheet";

const shown = (stats: Stats) => {
  const root = document.createElement("div");
  render(h(StatsSheet, { stats }), root);
  return root.textContent ?? "";
};

describe("Stats sheet", () => {
  it("shows his level, XP to the next one, money and places visited", () => {
    const s = new Stats();
    s.cents = 900;
    s.addXp(130);
    s.reach({ name: "Cafe Rila", class: "cafe", subclass: "", rank: 1, lat: 42.69, lon: 23.32 });
    const text = shown(s);
    expect(text).toContain("Level 2");
    expect(text).toContain("XP50 / 200");
    expect(text).toContain("💶 Money€12");
    expect(text).toContain("📍 Places visited1");
  });
});
