// The daily forecast: the same rule for everyone on a date, and what each one changes.
import { describe, expect, it } from "vitest";
import * as F from "../../src/core/forecast";
import { Activities } from "../../src/core/activities";
import { catchUp } from "../../src/core/catchup";
import { bboxAround } from "../../src/core/geo";
import { Rng } from "../../src/core/rng";
import { skyAt } from "../../src/core/sky";
import { parseAirports, parseCities, Trips } from "../../src/core/trips";
import { dataFile } from "../support/data";
import * as S from "../../src/core/stats";
import { FIRST_VISIT_XP, Stats } from "../../src/core/stats";

const LIST = JSON.parse(dataFile("forecasts.json")) as F.Forecast[];

/** Unix seconds at noon on the first day from 2026-01-01 whose forecast is `id`. */
function dayWith(id: string): number {
  for (let d = 0; d < 400; d++) {
    const t = Date.UTC(2026, 0, 1 + d, 12) / 1000;
    if (F.forecastAt(LIST, t).id === id) return t;
  }
  throw new Error(`no day with ${id}`);
}
const statsOn = (id: string) => {
  const s = new Stats();
  s.forecasts = LIST;
  const t = dayWith(id);
  s.now = () => t;
  return s;
};

describe("daily forecast", () => {
  it("is the same all day and for everyone on that date", () => {
    expect(F.forecastOn(LIST, "2026-10-30")).toBe(F.forecastOn(LIST, "2026-10-30"));
    const ids = new Set(Array.from({ length: 60 }, (_, d) => F.forecastOn(LIST, `2026-11-${String(d + 1).padStart(2, "0")}`).id));
    expect(ids.size).toBeGreaterThan(5);
  });

  it("every forecast can come up", () => {
    const seen = new Set<string>();
    for (let d = 0; d < 1000; d++) seen.add(F.forecastAt(LIST, Date.UTC(2026, 0, 1 + d, 12) / 1000).id);
    expect(seen.size).toBe(LIST.length);
  });

  it("only changes what it names", () => {
    const f = LIST.find((x) => x.id === "bakery")!;
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
    const lucky = statsOn("find");
    lucky.attrs.luck = 5;
    const plain = new Stats();
    plain.attrs.luck = 5;
    plain.now = lucky.now;
    lucky.walkFor(2000, new Rng(3));
    plain.walkFor(2000, new Rng(3));
    expect(lucky.cents - S.START_CENTS).toBeGreaterThan(1.5 * (plain.cents - S.START_CENTS));
    const tired = statsOn("effort");
    tired.passTime(0, 1000);
    expect(100 - tired.meters.energy).toBeCloseTo(2 * 0.75);
  });

  it("names place kinds the actions know, and says its own amount", () => {
    const classes = new Set(Object.keys(JSON.parse(dataFile("actions.json"))).map((k) => k.split("/")[0]));
    for (const f of LIST) {
      if (f.kind) expect(classes.has(f.kind), f.kind).toBe(true);
      expect(F.EFFECTS, f.id).toContain(f.effect);
      if (f.effect === "mood") expect(f.kind, f.id).toBeTruthy();
      expect(f.text).toContain("{n}");
      expect(F.words(f)).not.toContain("{n}");
    }
    expect(F.words(LIST.find((f) => f.id === "fares")!)).toBe("Fares are 20% off today");
  });

  it("each day he lives through while away has its own forecast", () => {
    const stats = new Stats();
    stats.forecasts = LIST;
    const start = Date.UTC(2026, 9, 29, 20, 0, 0);
    const seen: [string, number][] = [];
    const real = stats.forecast.bind(stats);
    stats.forecast = () => {
      const f = real();
      seen.push([f.id, stats.now()]);
      return f;
    };
    const city = { name: "Town", code: "", center: [0, 0] as [number, number], bounds: bboxAround(0, 0, 3000), places: null };
    catchUp(stats, city, [0, 0], 24 * 3600, start, {
      activities: new Activities(JSON.parse(dataFile("actions.json"))),
      trips: new Trips(parseCities(""), parseAirports("")),
      rng: new Rng(1),
      skyAt: (ms, c) => skyAt(ms, c.center[0], c.center[1], 0, null),
      roll: () => 0.99,
    });
    expect(seen.length).toBeGreaterThan(10);
    for (const [id, t] of seen) expect(id).toBe(F.forecastAt(LIST, t).id);
    expect(new Set(seen.map(([, t]) => new Date(t * 1000).getDate())).size).toBe(2);
  });
});
