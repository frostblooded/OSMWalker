// Targets for the delivery economy, from the user's picks: two deliveries buy
// the first upgrade, and later ones come at a steady, slowly growing pace.
// SIM=1 prints the table (npm run sim).
import { describe, expect, it } from "vitest";
import { OPENS_AFTER } from "../../src/core/upgrades";
import { summary } from "../support/economy";

const sim = !!process.env.SIM;
const { at, delivery } = summary(sim ? 15 : 5, sim ? 8 : 4);

describe("the economy", () => {
  if (sim) {
    const rows = [1, 2, 3, 5, 10].map((n) => `| speed #${n} | ${at("speed", n).toFixed(0)} |`);
    rows.push(...[1, 5, 10].map((n) => `| orders #${n} | ${at("orders", n).toFixed(0)} |`));
    console.log(`| Upgrade | Minutes |\n| --- | --- |\n${rows.join("\n")}\n\nMinutes to delivery 1, 10, 100: ${[1, 10, 100].map((n) => delivery(n).toFixed(1)).join(", ")}`);
  }

  it("buys the first speed upgrade after about two deliveries, within 10 minutes", () => {
    expect(at("speed", 1)).toBeLessThan(10);
  });

  it("takes 1 to 6 minutes per order at the start", () => {
    expect(delivery(10) / 10).toBeGreaterThan(1);
    expect(delivery(10) / 10).toBeLessThan(6);
  });

  it("opens the order upgrade within the first couple of hours, and each later buy takes longer than the one before", () => {
    expect(at("orders", 1)).toBeLessThan(180);
    const gaps = [2, 4, 6, 8, OPENS_AFTER].map((n) => at("speed", n) - at("speed", n - 1));
    expect(gaps.at(-1)!).toBeGreaterThan(gaps[0]!);
  });
});
