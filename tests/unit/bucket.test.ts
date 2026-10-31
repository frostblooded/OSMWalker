// His bucket list (src/core/bucket.ts): game goals and real sights, how he
// ticks them off by himself and what that gives him, refilling, the gentle
// pull a sight puts on his trips, the Collection, and saving it.
import { describe, expect, it } from "vitest";
import * as Bk from "../../src/core/bucket";
import * as C from "../../src/core/collection";
import * as Items from "../../src/core/items";
import { Rng } from "../../src/core/rng";
import { Stats } from "../../src/core/stats";
import { Trips, type City } from "../../src/core/trips";
import { dataFile } from "../support/data";

const NOON = new Date(2026, 5, 10, 12, 0, 0).getTime() / 1000;
const roundTrip = (s: Stats) => Stats.fromJSON(JSON.parse(JSON.stringify(s)));
const facts = (over: Partial<Bk.Facts> = {}): Bk.Facts => ({ city: "", level: 1, countries: 0, car: 0, dragon: 0, dishes: 0, fluent: 0, prize: 0, business: 0, monument: 0, skill: 0, ...over });
const listed = new Set(
  dataFile("cities.tsv")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const [name, , country] = l.split("\t");
      return `${name}, ${country}`;
    }),
);

describe("dreams", () => {
  it("have unique ids, and each sight is in a listed city", () => {
    expect(new Set(Bk.DREAMS.map((d) => d.id)).size).toBe(Bk.DREAMS.length);
    for (const d of Bk.SIGHTS) expect(listed.has(d.city!), d.city).toBe(true);
    for (const d of Bk.GOALS) expect(d.fact && d.n! > 0).toBeTruthy();
  });

  it("are met by their goal or by being in their city", () => {
    const level10 = Bk.dreamOf("level10")!;
    expect(Bk.met(level10, facts({ level: 9 }))).toBe(false);
    expect(Bk.met(level10, facts({ level: 10 }))).toBe(true);
    expect(Bk.met(Bk.dreamOf("eiffel")!, facts({ city: "Paris, France" }))).toBe(true);
    expect(Bk.met(Bk.dreamOf("eiffel")!, facts({ city: "Lyon, France" }))).toBe(false);
  });
});

describe("Bucket", () => {
  it("fills up with a sight among them, never one he has met or done", () => {
    for (let seed = 1; seed < 30; seed++) {
      const b = new Bk.Bucket();
      b.done.push({ id: "eiffel", t: 0, city: "" });
      const added = b.fill(facts({ level: 30 }), new Rng(seed));
      expect(added).toHaveLength(Bk.BUCKET_SIZE);
      expect(b.dreams().some((d) => d.city)).toBe(true);
      expect(b.list).not.toContain("eiffel");
      expect(b.list).not.toContain("level10");
      expect(b.list).not.toContain("level25");
      expect(new Set(b.list).size).toBe(Bk.BUCKET_SIZE);
    }
  });

  it("ticks off what is met and makes room for new ones, and stops once all are done", () => {
    const b = new Bk.Bucket();
    b.list = ["level10", "eiffel", "dragon"];
    expect(b.tick(facts({ level: 12, city: "Paris, France" }), 5).map((d) => d.id)).toEqual(["level10", "eiffel"]);
    expect(b.list).toEqual(["dragon"]);
    expect(b.done).toEqual([
      { id: "level10", t: 5, city: "Paris, France" },
      { id: "eiffel", t: 5, city: "Paris, France" },
    ]);
    b.done = Bk.DREAMS.filter((d) => d.id !== "dragon").map((d) => ({ id: d.id, t: 0, city: "" }));
    expect(b.fill(facts(), new Rng(1))).toEqual([]);
  });

  it("pulls his trips toward a city with a sight on his list", () => {
    const b = new Bk.Bucket();
    b.list = ["eiffel", "dragon"];
    expect(b.pull("Paris, France")).toBe(Bk.DREAM_PULL);
    expect(b.pull("Lyon, France")).toBe(1);
  });

  it("comes back from a save, and an old save starts empty", () => {
    const b = new Bk.Bucket();
    b.list = ["eiffel", "nope", "eiffel", "dragon"];
    b.done = [{ id: "level10", t: 3, city: "Sofia" }, { id: "gone", t: 1, city: "" }] as Bk.Ticked[];
    const back = Bk.Bucket.fromJSON(JSON.parse(JSON.stringify(b)));
    expect(back.list).toEqual(["eiffel", "dragon"]);
    expect(back.done).toEqual([{ id: "level10", t: 3, city: "Sofia" }]);
    expect(Bk.Bucket.fromJSON(undefined).list).toEqual([]);
  });
});

describe("Trips.pick with a pull", () => {
  const cities: City[] = [
    { name: "Big", code: "AAA", country: "A", lat: 0, lon: 0, pop: 1000 },
    { name: "Small", code: "AAA", country: "A", lat: 1, lon: 1, pop: 1000 },
  ];
  it("makes a pulled city DREAM_PULL times likelier", () => {
    const trips = new Trips(cities, []);
    const rng = new Rng(7);
    let small = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) if (trips.pick("city", "AAA", 5, 5, rng, (c) => (c.name === "Small" ? Bk.DREAM_PULL : 1))?.name === "Small") small++;
    expect(small / n).toBeCloseTo(Bk.DREAM_PULL / (Bk.DREAM_PULL + 1), 1);
  });
});

describe("Stats and his bucket list", () => {
  const inSofia = () => {
    const s = new Stats();
    s.now = () => NOON;
    s.arrive("Sofia, Bulgaria", "BGR", "Bulgaria");
    return s;
  };

  it("fills on his first day quietly, and ticks off a sight when he arrives in its city", () => {
    const s = inSofia();
    s.passTime(1, 0);
    expect(s.bucket.list).toHaveLength(Bk.BUCKET_SIZE);
    expect(s.history.entries.some((l) => l.text.includes("bucket list"))).toBe(false);
    s.bucket.list = ["eiffel", "dragon", "level25"];
    const xp = s.xp + s.level * 1000;
    const mood = s.meters.mood;
    s.arrive("Paris, France", "FRA", "France");
    expect(s.bucket.done.map((x) => x.id)).toEqual(["eiffel"]);
    expect(s.bucket.list).toHaveLength(Bk.BUCKET_SIZE);
    expect(s.xp + s.level * 1000).toBeGreaterThan(xp);
    expect(s.meters.mood).toBeGreaterThan(mood);
    const said = s.history.entries.map((l) => l.text);
    expect(said.some((t) => t.includes(`Ticked off his bucket list: See the Eiffel Tower! (+${Bk.DREAM_XP} XP)`))).toBe(true);
    expect(said.some((t) => t.startsWith("📝 New on his bucket list:"))).toBe(true);
    expect(s.chronicle.lines.some((l) => l.text === "Ticked off his bucket list: See the Eiffel Tower")).toBe(true);
  });

  it("ticks off a game goal the next morning", () => {
    const s = inSofia();
    s.passTime(1, 0);
    s.bucket.list = ["dragon"];
    s.equip(Items.build(Items.KINDS.dragons[0]!, Items.MATERIALS[0]!, []));
    expect(s.facts().dragon).toBe(1);
    s.now = () => NOON + 86400;
    s.passTime(1, 0);
    expect(s.bucket.done.map((x) => x.id)).toEqual(["dragon"]);
  });

  it("saves it, and shows it in the Collection with the Dreamer badge", () => {
    const s = inSofia();
    s.passTime(1, 0);
    s.bucket.done.push({ id: "eiffel", t: NOON, city: "Paris, France" });
    const back = roundTrip(s);
    expect(back.bucket.list).toEqual(s.bucket.list);
    expect(back.bucket.done).toEqual(s.bucket.done);
    const set = C.SETS.find((x) => x.id === "dreams")!;
    const tiles = set.entries(back);
    expect(tiles).toHaveLength(Bk.DREAMS.length);
    expect(tiles.find((e) => e.id === "eiffel")).toMatchObject({ got: true, info: "Ticked off in Paris" });
    expect(tiles.find((e) => e.id === back.bucket.list[0])).toMatchObject({ got: false, info: "On his list now" });
    expect(C.FEATS.find((f) => f.id === "dreamer")!.count(back)).toBe(1);
  });
});
