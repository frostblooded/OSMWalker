// @vitest-environment happy-dom
// The Stats sheet and the Shop: his money, deliveries and places; his upgrades with
// what they add up to; and the Shop's prices, locks and buy buttons.
import { h, render } from "preact";
import { describe, expect, it } from "vitest";
import { euro } from "../../src/core/money";
import { Stats } from "../../src/core/stats";
import { OPENS_AFTER, priceOf, upgradeOf } from "../../src/core/upgrades";
import { canBuy, ShopSheet } from "../../src/ui/ShopSheet";
import { StatsSheet } from "../../src/ui/StatsSheet";

const shown = (node: Parameters<typeof render>[0]) => {
  const root = document.createElement("div");
  render(node, root);
  return root;
};
const speed = upgradeOf("speed")!;

describe("Stats sheet", () => {
  it("shows his money, deliveries, places, upgrades, speed and order wait", () => {
    const s = new Stats();
    s.cents = 900;
    s.deliveries = 4;
    s.reach({ name: "Pizza", lat: 42.69, lon: 23.32 });
    s.upgrades = { speed: 2 };
    const text = shown(h(StatsSheet, { stats: s })).textContent!;
    for (const t of ["💶 Money€9", "📦 Deliveries4", "📍 Places visited1", "🔧 Bike tune-up×2", "📱 Delivery app boost×0", "🚲 Speed54 km/h", "🛎 Order wait~60 s"]) expect(text).toContain(t);
  });
});

describe("Shop", () => {
  it("sells the speed upgrade at its price, says what is missing, and keeps the next one locked until 10", () => {
    const s = new Stats();
    s.cents = speed.cents - 100;
    const text = shown(h(ShopSheet, { stats: s, onBuy: () => {} })).textContent!;
    expect(text).toContain(`Buy · ${euro(speed.cents)}`);
    expect(text).toContain(`💶 Still needs${euro(100)}`);
    expect(text).toContain(`🔒 Opens after${OPENS_AFTER} Bike tune-ups (0 / ${OPENS_AFTER})`);
    expect(canBuy(s)).toBe(false);
    s.cents = speed.cents;
    expect(canBuy(s)).toBe(true);
  });

  it("buys on a tap, and opens the order upgrade after 10 speed upgrades", () => {
    const s = new Stats();
    s.cents = 100_000;
    s.upgrades = { speed: OPENS_AFTER };
    const bought: string[] = [];
    const root = shown(h(ShopSheet, { stats: s, onBuy: (id) => bought.push(id) }));
    expect(root.textContent).toContain(`Buy · ${euro(priceOf(upgradeOf("orders")!, s.upgrades))}`);
    expect(root.textContent).toContain(`×${OPENS_AFTER}`);
    root.querySelectorAll<HTMLButtonElement>(".buy")[1]!.click();
    expect(bought).toEqual(["orders"]);
  });
});
