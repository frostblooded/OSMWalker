// The hall of walkers: the family's records, who holds each, and old ancestors without them.
import { describe, expect, it } from "vitest";
import { FEATS, tierOf } from "../../src/core/collection";
import { HALL, hall, heldBy } from "../../src/core/hall";
import type { Ancestor } from "../../src/core/life";
import { Stats } from "../../src/core/stats";

const BEST = { stretchM: 0, dayM: 0, dayStops: 0, cents: 0, noFaintS: 0 };
const OLD: Ancestor = { gen: 1, born: 0, retired: 1, by: "age", title: "Elder", level: 30, km: 900, cities: 12, home: "Sofia, Bulgaria", heirloom: "", letter: "", chronicle: [], countries: 4, best: { ...BEST, cents: 90_000, dayM: 20_000 } };

describe("hall of walkers", () => {
  it("names the walker who holds each record, the first to reach it on a tie", () => {
    const s = new Stats();
    s.life.gen = 3;
    s.life.family = [OLD, { ...OLD, gen: 2, km: 1500, level: 30, countries: 2, best: { ...BEST, cents: 120_000 } }];
    s.life.km = 50;
    s.level = 3;
    s.records.best.dayM = 25_000;
    const rows = Object.fromEntries(hall(s).map((r) => [r.id, r]));
    expect(rows.km).toMatchObject({ gen: 2, value: 1500 });
    expect(rows.level!.gen).toBe(1);
    expect(rows.countries).toMatchObject({ gen: 1, value: 4 });
    expect(rows.cents).toMatchObject({ gen: 2, value: 120_000 });
    expect(rows.dayM).toMatchObject({ gen: 3, value: 25_000 });
    expect(heldBy(s)).toEqual(["dayM"]);
    const pride = FEATS.find((f) => f.id === "heir")!;
    expect(tierOf(pride, pride.count(s))).toBe(1);
    expect(hall(s).map((r) => r.id)).toEqual(HALL.map((h) => h.id));
  });

  it("counts an ancestor from before the hall by what the family tree kept", () => {
    const s = new Stats();
    s.life.gen = 2;
    const { countries: _c, best: _b, ...old } = OLD;
    s.life.family = [old];
    s.records.countries = ["BGR"];
    const rows = Object.fromEntries(hall(s).map((r) => [r.id, r]));
    expect(rows.km!.gen).toBe(1);
    expect(rows.countries).toMatchObject({ gen: 2, value: 1 });
  });

  it("gives a record nobody has above 0 no holder, and the first walker holds none over a family", () => {
    const s = new Stats();
    const rows = Object.fromEntries(hall(s).map((r) => [r.id, r]));
    expect(rows.level!.gen).toBe(1);
    expect(rows.cents).toMatchObject({ gen: 0, value: 0 });
    expect(heldBy(s)).toEqual([]);
    // An heir on his first day, after an ancestor from before the hall: the bests have no holder yet.
    const { countries: _c, best: _b, ...old } = OLD;
    s.life.gen = 2;
    s.life.family = [old];
    expect(heldBy(s)).toEqual([]);
    expect(hall(s).find((r) => r.id === "noFaintS")!.gen).toBe(0);
  });

  it("keeps his countries and bests on the family tree when he retires", () => {
    const s = new Stats();
    s.records.arrived("Sofia, Bulgaria", "BGR");
    s.records.arrived("Paris, France", "FRA");
    s.records.best.cents = 77_000;
    const { ancestor, heir } = s.retire("age");
    expect(ancestor.countries).toBe(2);
    expect(ancestor.best!.cents).toBe(77_000);
    const back = Stats.fromJSON(JSON.parse(JSON.stringify(heir)));
    expect(back.life.family[0]!.best!.cents).toBe(77_000);
  });
});
