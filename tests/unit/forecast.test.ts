// The daily forecast: the same rule for everyone on a date, and what each one changes.
import { describe, expect, it, vi } from "vitest";
import * as F from "../../src/core/forecast";
import { Rng } from "../../src/core/rng";
import { FIRST_VISIT_XP, Stats } from "../../src/core/stats";

vi.unmock("../../src/core/forecast");

/** Unix seconds at noon on the first day from 2026-01-01 whose forecast is `id`. */
function dayWith(id: string): number {
  for (let d = 0; d < 400; d++) {
    const t = Date.UTC(2026, 0, 1 + d, 12) / 1000;
    if (F.forecastAt(t).id === id) return t;
  }
  throw new Error(`no day with ${id}`);
}
const statsOn = (id: string) => {
  const s = new Stats();
  const t = dayWith(id);
  s.now = () => t;
  return s;
};

describe("daily forecast", () => {
  it("is the same all day and for everyone on that date", () => {
    expect(F.forecastOn("2026-10-30")).toBe(F.forecastOn("2026-10-30"));
    const ids = new Set(Array.from({ length: 60 }, (_, d) => F.forecastOn(`2026-11-${String(d + 1).padStart(2, "0")}`).id));
    expect(ids.size).toBeGreaterThan(5);
  });

  it("every forecast can come up", () => {
    const seen = new Set<string>();
    for (let d = 0; d < 1000; d++) seen.add(F.forecastAt(Date.UTC(2026, 0, 1 + d, 12) / 1000).id);
    expect(seen.size).toBe(F.FORECASTS.length);
  });

  it("only changes what it names", () => {
    const f = F.FORECASTS.find((x) => x.id === "bakery")!;
    expect(F.mult(f, "mood", "bakery")).toBe(2);
    expect(F.mult(f, "mood", "cafe")).toBe(1);
    expect(F.mult(f, "fare")).toBe(1);
  });

  it("doubles mood at that kind of place", () => {
    const act = { name: "Eat a bun", min: 5, fx: { mood: 10 } };
    const s = statsOn("bakery");
    s.meters.mood = 50;
    s.do(act, "Bun Shop", new Rng(1), "bakery");
    expect(s.meters.mood).toBe(70);
    s.do(act, "Cafe", new Rng(1), "cafe");
    expect(s.meters.mood).toBe(80);
  });

  it("cuts fares, raises sale prices, wages and first-visit XP, eases walking", () => {
    expect(statsOn("fares").fareMult()).toBeCloseTo(0.8);
    const item = { name: "Cup", slot: "weapon" as const, stats: {}, rarity: "Common" as const, price: 1000 };
    expect(statsOn("sell").sellPrice(item)).toBe(Math.round(new Stats().sellPrice(item) * 1.25));
    const job = { name: "Work", min: 60, earn: 10, needs: {} };
    expect(statsOn("wage").wageMult(job)).toBeCloseTo(1.1);
    const s = statsOn("visit");
    expect(s.visit({ name: "A", lat: 1, lon: 1 })).toBe(FIRST_VISIT_XP * 1.5);
    const tired = statsOn("effort");
    tired.passTime(0, 1000);
    expect(100 - tired.meters.energy).toBeCloseTo(2 * 0.75);
  });
});
