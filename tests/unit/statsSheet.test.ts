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

  it("shows the next upgrade with what it waits on, and the rest of the ladder in closed groups", () => {
    const s = new Stats();
    s.upgrades.add("map");
    s.level = LADDER[1]!.level;
    s.cents = 500;
    const text = shown(s);
    expect(text).toContain(`Next: Bike${euro(LADDER[1]!.cents)}`);
    expect(text).toContain(`💶 Still needs${euro(LADDER[1]!.cents - 500)}`);
    s.cents = LADDER[1]!.cents;
    expect(shown(s)).toContain("✔ ReadyLook for its shop");
    expect(shown(s)).toContain("Sold at a bike shop.");
    expect(text).toContain("Upgrades1 / 7");
    expect(text).toContain("✓ Owned (1) ▸");
    expect(text).toContain("🔒 Later (5) ▸");
    expect(text).not.toContain("Guidebook");
  });

  it("says what level the next upgrade waits for, and nothing once all are bought", () => {
    const s = new Stats();
    expect(shown(s)).toContain(`🔒 Opens atLevel ${LADDER[0]!.level}`);
    for (const u of LADDER) s.upgrades.add(u.id);
    expect(shown(s)).not.toContain("Next:");
    expect(shown(s)).toContain("Upgrades7 / 7");
  });
});
