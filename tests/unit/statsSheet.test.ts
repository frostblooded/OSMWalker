// @vitest-environment happy-dom
// The Stats sheet's speed and saving goal for fantasy mounts.
import { h, render } from "preact";
import { describe, expect, it } from "vitest";
import * as Items from "../../src/core/items";
import { Rng } from "../../src/core/rng";
import { DRAGON_UPKEEP, KEEP_CENTS, Stats } from "../../src/core/stats";
import { speed } from "../../src/ui/format";
import { StatsSheet } from "../../src/ui/StatsSheet";

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

  it("in a car, saves for the dragon and its first day of gold", () => {
    const stats = new Stats();
    stats.equip(Items.build(Items.KINDS.cars[0]!, Items.MATERIALS[0]!, []));
    expect(shown(stats)).toContain("🐉 Dragon");
    expect(stats.vehicleSaving()).toBe(Items.cheapest("dragons").price + KEEP_CENTS + DRAGON_UPKEEP);
  });
});
