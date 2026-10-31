// Weekly bills: paid at the start of each week, growing with his level, and the debt collector.
import { describe, expect, it } from "vitest";
import { BILLS, billsAt } from "../../src/core/bills";
import type { Item } from "../../src/core/items";
import { Stats } from "../../src/core/stats";
import { WEEK_S } from "../../src/core/week";

/** Monday 2026-11-02 12:00 UTC: a week starts some hours before it in any time zone. */
const MON = Date.UTC(2026, 10, 2, 12) / 1000;
const thing = (name: string, price: number, countries: string[] = []): Item => ({ name, slot: "trinket", stats: {}, rarity: "Common", price, story: { from: "Sofia", t: 0, countries, km: 0 } });

/** A Stats whose week started at MON, at `level`, then a week later. */
function nextWeek(level: number, cents: number): Stats {
  const s = new Stats();
  s.level = level;
  s.now = () => MON;
  s.passTime(1, 0);
  s.cents = cents;
  s.now = () => MON + WEEK_S;
  return s;
}

describe("weekly bills", () => {
  it("grow with his level", () => {
    expect(billsAt(1)).toBe(BILLS.reduce((n, b) => n + b.cents, 0));
    expect(billsAt(11) - billsAt(1)).toBe(10 * BILLS.reduce((n, b) => n + b.perLevel, 0));
  });

  it("are paid at the start of each week, not before", () => {
    const s = nextWeek(5, 100000);
    // Saving up for a trip, so he spends none of it on a business (see business.ts).
    s.savingFor = 100000;
    s.now = () => MON + 3600;
    s.passTime(1, 0);
    expect(s.cents).toBe(100000);
    s.now = () => MON + WEEK_S;
    s.passTime(1, 0);
    expect(s.cents).toBe(100000 - billsAt(5));
    expect(s.history.latest()).toMatch(/^Paid the week's bills: phone, travel insurance, storage locker \(-€/);
    s.passTime(1, 0);
    expect(s.cents).toBe(100000 - billsAt(5));
  });

  it("when he can't pay, a debt collector takes the cheapest thing that isn't treasured", () => {
    const s = nextWeek(1, 10);
    const cheap = thing("Old Ring", 100, ["BG", "RO", "GR", "TR", "MK"]);
    s.bag = [thing("Silk Scarf", 3000), cheap, thing("Brass Bell", 500)];
    s.passTime(1, 0);
    expect(s.cents).toBe(10);
    expect(s.bag.map((i) => i.name)).toEqual(["Silk Scarf", "Old Ring"]);
    expect(s.history.latest()).toMatch(/a debt collector took his Brass Bell instead$/);
  });

  it("with nothing to take, are written off", () => {
    const s = nextWeek(1, 0);
    s.passTime(1, 0);
    expect(s.cents).toBe(0);
    expect(s.history.latest()).toMatch(/written off$/);
  });
});
