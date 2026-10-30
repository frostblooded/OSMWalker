// @vitest-environment happy-dom
// The Stats sheet's speed and saving goal for fantasy mounts, and his Magic and spells.
import { h, render } from "preact";
import { describe, expect, it } from "vitest";
import * as Items from "../../src/core/items";
import { euro } from "../../src/core/money";
import { Rng } from "../../src/core/rng";
import { DRAGON_UPKEEP, KEEP_CENTS, Stats } from "../../src/core/stats";
import { speed } from "../../src/ui/format";
import { StatsSheet } from "../../src/ui/StatsSheet";
import type { Spell } from "../../src/core/magic";
import SPELLS from "../../public/data/spells.json";

const shown = (stats: Stats, afoot = false) => {
  const root = document.createElement("div");
  render(h(StatsSheet, { stats, afoot }), root);
  return root.textContent ?? "";
};

describe("Stats sheet", () => {
  it("after a flyer lands, shows his walking speed", () => {
    const stats = new Stats();
    stats.equip(Items.build(Items.KINDS.dragons[0]!, Items.MATERIALS[0]!, []));
    stats.feedDragon(new Rng(1));
    expect(shown(stats)).toContain(speed(stats.speedMps()));
    expect(shown(stats, true)).toContain(speed(stats.speedMps(true)));
    expect(speed(stats.speedMps(true))).not.toBe(speed(stats.speedMps()));
  });

  it("on a day his dragon hasn't eaten, shows its gold under Saving for", () => {
    const stats = new Stats();
    stats.equip(Items.build(Items.KINDS.dragons[0]!, Items.MATERIALS[0]!, []));
    stats.cents = 0;
    expect(shown(stats)).toContain("🐉 Dragon's gold");
    stats.cents = DRAGON_UPKEEP;
    stats.feedDragon(new Rng(1));
    expect(shown(stats)).not.toContain("Saving for");
  });

  it("in a car, saves for the dragon and its first day of gold", () => {
    const stats = new Stats();
    stats.equip(Items.build(Items.KINDS.cars[0]!, Items.MATERIALS[0]!, []));
    expect(shown(stats)).toContain("🐉 Dragon");
    // A goal of his next vehicle leaves no stray "0" for a dragon's gold.
    const root = document.createElement("div");
    render(h(StatsSheet, { stats }), root);
    const card = [...root.querySelectorAll(".card")].find((c) => c.textContent?.includes("Saving for"))!;
    expect(card.textContent!.endsWith(euro(stats.vehicleSaving()))).toBe(true);
    expect(stats.vehicleSaving()).toBe(Items.cheapest("dragons").price + KEEP_CENTS + DRAGON_UPKEEP);
  });

  it("shows his Magic in Vitals and the spells he knows, with their cost and casts", () => {
    // Imported, as dataFile can't find files under happy-dom.
    const spells = SPELLS as Spell[];
    const stats = Object.assign(new Stats(), { spellKinds: spells });
    stats.magic = 42;
    let text = shown(stats);
    expect(text).toContain("🔮 Magic42");
    expect(text).toContain(`Spells0 / ${spells.length}`);
    expect(text).toContain("Knownnone yet");
    stats.lore.known = ["soup"];
    stats.lore.casts = { soup: 3 };
    text = shown(stats);
    expect(text).toContain(`Spells1 / ${spells.length}`);
    expect(text).toContain("🍲 Warm soup20 Magic · cast 3×");
    expect(text).not.toContain("none yet");
  });
});
