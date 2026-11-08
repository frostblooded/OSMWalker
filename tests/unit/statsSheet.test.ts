// @vitest-environment happy-dom
// The Stats sheet: his level with the XP to the next one, his money, the places he has been to and his upgrades.
import { h, render } from "preact";
import { describe, expect, it } from "vitest";
import { euro } from "../../src/core/money";
import { Stats } from "../../src/core/stats";
import { LADDER } from "../../src/core/upgrades";
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
    s.reach({ name: "Cafe Rila", class: "cafe", subclass: "", rank: 1, lat: 42.69, lon: 23.32 }, { cents: 300, xp: 20 });
    const text = shown(s);
    expect(text).toContain("Level 2");
    expect(text).toContain("XP50 / 200");
    expect(text).toContain("💶 Money€12");
    expect(text).toContain("📍 Places visited1");
  });

  it("lists the upgrades: owned, the next with its price once open, the rest by level", () => {
    const s = new Stats();
    s.upgrades.add("map");
    s.level = LADDER[1]!.level;
    const text = shown(s);
    expect(text).toContain("Upgrades 1 / 7");
    expect(text).toContain("🗺 City map✓ Owned");
    expect(text).toContain(`🚲 Bike${euro(LADDER[1]!.cents)}`);
    expect(text).toContain(`📕 GuidebookLevel ${LADDER[2]!.level}`);
    expect(text).toContain("Sold at a bike shop.");
  });
});
