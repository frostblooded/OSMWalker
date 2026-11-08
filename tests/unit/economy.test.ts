// Targets for the delivery economy, from the user's picks: two deliveries buy
// the first upgrade, and then about one upgrade comes every 5 minutes (a
// project rule, user 2026-11-08).
// SIM=1 prints the table (npm run sim).
import { describe, expect, it } from "vitest";
import { OPENS_AFTER } from "../../src/core/upgrades";
import { summary } from "../support/economy";

const sim = !!process.env.SIM;
const { at, buys, delivery } = summary(sim ? 15 : 5, sim ? 8 : 7);

describe("the economy", () => {
  if (sim) {
    const rows = [1, 2, 3, 5, 10].map((n) => `| speed #${n} | ${at("speed", n).toFixed(0)} |`);
    rows.push(...[1, 5, 10].map((n) => `| orders #${n} | ${at("orders", n).toFixed(0)} |`));
    rows.push(...[10, 20, 30, 50, 70].map((n) => `| any upgrade #${n} | ${buys(n).toFixed(0)} |`));
    console.log(`| Upgrade | Minutes |\n| --- | --- |\n${rows.join("\n")}\n\nMinutes to delivery 1, 10, 100: ${[1, 10, 100].map((n) => delivery(n).toFixed(1)).join(", ")}`);
  }

  it("buys the first speed upgrade after about two deliveries, within 10 minutes", () => {
    expect(at("speed", 1)).toBeLessThan(10);
  });

  it("takes 1 to 6 minutes per order at the start", () => {
    expect(delivery(10) / 10).toBeGreaterThan(1);
    expect(delivery(10) / 10).toBeLessThan(6);
  });

  it("opens the order upgrade within the first couple of hours", () => {
    expect(at("orders", 1)).toBeLessThan(180);
  });

  it("buys about one upgrade every 5 minutes, early and later", () => {
    const nth = (n: number) => (n <= OPENS_AFTER ? at("speed", n) : buys(n));
    for (const [a, b] of [[1, 10], [10, 20], [20, 30], [30, 50], [50, 70]] as const) {
      const gap = (nth(b) - nth(a)) / (b - a);
      expect(gap).toBeGreaterThan(3.5);
      expect(gap).toBeLessThan(7);
    }
  });
});
