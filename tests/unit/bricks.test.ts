// Golden bricks, the monuments they pay for, and his life chronicle.
import { describe, expect, it } from "vitest";
import { BRICK_CHANCE, BRICKS_PER_DAY, Bricks, MONUMENTS } from "../../src/core/bricks";
import { Chronicle, COUNTRY_MARKS, LEVEL_MARKS } from "../../src/core/chronicle";
import { monumentIcons } from "../../src/core/mapIcons";
import { ICONS } from "../../src/map/icons";
import { Stats, xpToNext, type Place } from "../../src/core/stats";

const PARK: Place = { name: "Borisova Garden", class: "park", subclass: "park", rank: 1, lat: 42.68, lon: 23.34 };
const CAFE: Place = { ...PARK, name: "Cafe Near", class: "cafe", subclass: "cafe" };

describe("golden bricks", () => {
  it("are found at a stop with BRICK_CHANCE, at most BRICKS_PER_DAY a day", () => {
    const b = new Bricks();
    expect(b.find("d1", BRICK_CHANCE)).toBe(false);
    for (let i = 0; i < BRICKS_PER_DAY; i++) expect(b.find("d1", 0)).toBe(true);
    expect(b.find("d1", 0)).toBe(false);
    expect(b.find("d2", 0)).toBe(true);
    expect(b.count).toBe(BRICKS_PER_DAY + 1);
  });

  it("take about a month for the first monument", () => {
    expect(MONUMENTS[0].bricks / BRICKS_PER_DAY).toBeGreaterThan(25);
    expect(MONUMENTS[0].bricks / BRICKS_PER_DAY).toBeLessThan(40);
  });

  it("pay for the next monument at a real park only, then the next kind, and the last one again", () => {
    const b = new Bricks();
    b.count = MONUMENTS[0].bricks - 1;
    expect(b.build(PARK, "Sofia", 1)).toBeNull();
    b.count++;
    expect(b.build(CAFE, "Sofia", 1)).toBeNull();
    expect(b.build({ ...PARK, made: true }, "Sofia", 1)).toBeNull();
    expect(b.build(PARK, "Sofia", 1)).toMatchObject({ kind: 0, park: "Borisova Garden", city: "Sofia" });
    expect(b.count).toBe(0);
    expect(b.next()).toBe(MONUMENTS[1]);
    for (let i = 1; i < MONUMENTS.length + 2; i++) {
      b.count = b.next().bricks;
      expect(b.build(PARK, "Sofia", 1)!.kind).toBe(Math.min(i, MONUMENTS.length - 1));
    }
  });

  it("in his stats: a feed line for a find, and for a monument, which goes in his life too", () => {
    const s = new Stats();
    s.arrive("Sofia, Bulgaria", "BGR", "Bulgaria");
    let found = 0;
    for (let i = 0; i < 200; i++) {
      s.now = () => i * 7919;
      const before = s.bricks.count;
      s.bricksAt(CAFE);
      if (s.bricks.count > before) found++;
    }
    expect(found).toBeGreaterThan(0);
    expect(s.history.entries.some((e) => /^Found a golden brick \(\d+ \/ 100\)$/.test(e.text))).toBe(true);
    s.bricks.count = MONUMENTS[0].bricks;
    s.bricks.day = "";
    s.bricksAt(PARK);
    expect(s.history.entries.some((e) => e.text === "Paid 100 golden bricks for a bench with his name in Borisova Garden 🪑")).toBe(true);
    expect(s.chronicle.lines.at(-1)!.text).toBe("Built a bench with his name in Borisova Garden, Sofia, Bulgaria");
  });

  it("show a plaque on the map in their city only", () => {
    const b = new Bricks();
    b.count = MONUMENTS[0].bricks;
    b.build(PARK, "Sofia", 1);
    expect(monumentIcons(b.built, "Sofia")).toEqual([{ id: "monument:0", at: [PARK.lat, PARK.lon], icon: "plaque", label: "His bench", kind: "place" }]);
    expect(monumentIcons(b.built, "Paris")).toEqual([]);
    expect(ICONS.plaque).toBeDefined();
  });
});

describe("life chronicle", () => {
  it("writes each milestone once", () => {
    const c = new Chronicle();
    expect(c.note("job", "First wage", 1)).toBe(true);
    expect(c.note("job", "First wage again", 2)).toBe(false);
    expect(c.lines).toEqual([{ t: 1, text: "First wage" }]);
  });

  it("follows his life: start, first trip, abroad, countries, wage, levels, fainting", () => {
    const s = new Stats();
    s.arrive("Sofia, Bulgaria", "BGR", "Bulgaria");
    s.arrive("Plovdiv, Bulgaria", "BGR", "Bulgaria");
    s.arrive("Paris, France", "FRA", "France");
    s.arrive("Lyon, France", "FRA", "France");
    for (const c of ["DEU", "ITA", "ESP"]) s.arrive(`X, ${c}`, c, c);
    s.do({ name: "Wash dishes", min: 30, earn: 5 }, "Cafe Near", { randf: () => 0.99 } as never);
    s.do({ name: "Wash dishes", min: 30, earn: 5 }, "Cafe Near", { randf: () => 0.99 } as never);
    while (s.level < LEVEL_MARKS[0]!) s.addXp(xpToNext(s.level));
    s.meters.health = 0;
    s.wakeInHospital("St. Anna");
    expect(s.chronicle.lines.map((l) => l.text)).toEqual([
      "Set out from Sofia, Bulgaria",
      "First trip away: to Plovdiv, Bulgaria",
      "First time abroad: France",
      `Had walked in ${COUNTRY_MARKS[0]} countries`,
      "First wage: Wash dishes at Cafe Near",
      `Reached level ${LEVEL_MARKS[0]}`,
      "Fainted for the first time and woke up at St. Anna",
    ]);
  });

  it("comes back from a save, and a save from before it skips the firsts already past", () => {
    const s = new Stats();
    s.arrive("Sofia, Bulgaria", "BGR", "Bulgaria");
    const back = Stats.fromJSON(JSON.parse(JSON.stringify(s)));
    expect(back.chronicle.lines).toEqual(s.chronicle.lines);
    const d = JSON.parse(JSON.stringify(s));
    delete d.chronicle;
    delete d.bricks;
    const old = Stats.fromJSON(d);
    old.arrive("Paris, France", "FRA", "France");
    expect(old.chronicle.lines).toEqual([]);
    expect(old.bricks.count).toBe(0);
  });
});
