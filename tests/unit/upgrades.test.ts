import { describe, expect, it } from "vitest";
import { Stats } from "../../src/core/stats";
import * as U from "../../src/core/upgrades";

const speed = U.upgradeOf("speed")!;
const orders = U.upgradeOf("orders")!;

describe("upgrades", () => {
  it("are a speed upgrade, open from the start, then faster orders", () => {
    expect(U.UPGRADES.map((u) => u.id)).toEqual(["speed", "orders"]);
    expect(U.isOpen(speed, {})).toBe(true);
    expect(U.isOpen(orders, { speed: U.OPENS_AFTER - 1 })).toBe(false);
    expect(U.isOpen(orders, { speed: U.OPENS_AFTER })).toBe(true);
  });

  it("cost 7% more each time, rounded to 10 cents", () => {
    expect(U.priceOf(speed, {})).toBe(speed.cents);
    expect(U.priceOf(speed, { speed: 1 })).toBe(Math.round((speed.cents * 1.07) / 10) * 10);
    expect(U.priceOf(speed, { speed: 9 })).toBe(Math.round((speed.cents * 1.07 ** 9) / 10) * 10);
  });

  it("multiply: each speed upgrade is +10% speed, each order upgrade a 10% shorter wait", () => {
    expect(U.speedX({})).toBe(1);
    expect(U.speedX({ speed: 2 })).toBeCloseTo(1.21);
    expect(U.waitX({ orders: 3 })).toBeCloseTo(0.729);
  });

  it("are bought with money, one at a time, only when open and affordable", () => {
    const s = new Stats();
    s.cents = speed.cents - 10;
    expect(s.buy(speed)).toBe(false);
    s.cents = 100_000;
    expect(s.buy(orders)).toBe(false);
    for (let i = 0; i < U.OPENS_AFTER; i++) expect(s.buy(speed)).toBe(true);
    expect(s.upgrades.speed).toBe(U.OPENS_AFTER);
    expect(s.buy(orders)).toBe(true);
    expect(s.history.latest()).toContain("Delivery app boost #1");
  });
});
