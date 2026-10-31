// His daily comforts: the beauty around him, his bed and his meals.
import { describe, expect, it } from "vitest";
import { minded } from "../../src/core/activities";
import { FEATS } from "../../src/core/collection";
import * as C from "../../src/core/comforts";
import { NO_NEED } from "../../src/core/goals";
import { Rng } from "../../src/core/rng";
import { Stats, type Action } from "../../src/core/stats";
import { dataFile } from "../support/data";

const T0 = 1_800_000_000;
const AT: [number, number] = [42.69, 23.32];
const at = () => {
  const s = new Stats();
  s.now = () => T0;
  return s;
};
const feels = (s: Stats) => s.mind.moodlets.map((m) => m.name);
const actions = (): Record<string, Action[]> => JSON.parse(dataFile("actions.json"));

describe("beauty", () => {
  it("adds one for each kind of nice land and for an old town nearby, and takes one for each kind of grim land", () => {
    expect(C.beautyOf(["park", "water", "park", "residential"], [], AT)).toBe(2);
    expect(C.beautyOf(["industrial", "motorway"], [], AT)).toBe(-2);
    const castle = { class: "castle", lat: AT[0] + 0.001, lon: AT[1] }; // about 110 m
    expect(C.beautyOf(["motorway"], [castle], AT)).toBe(0);
    expect(C.beautyOf([], [{ ...castle, lat: AT[0] + 0.002 }], AT)).toBe(0); // about 220 m: too far
  });

  it("brings Pretty or Grim surroundings, one in place of the other; a plain spot leaves him as he was", () => {
    const s = at();
    s.lookAround(1);
    expect(feels(s)).toEqual([C.PRETTY[0]]);
    s.lookAround(0);
    expect(feels(s)).toEqual([C.PRETTY[0]]);
    s.lookAround(-1);
    expect(feels(s)).toEqual([C.GRIM[0]]);
    expect(s.mind.moodlets[0]!.per_h).toBe(C.GRIM[2]);
  });

  it("grim surroundings pull his goal towards green places only", () => {
    const s = at();
    s.meters.mood = 50;
    s.meters.energy = 50;
    s.mind.feel("Deep in thought", "🧐", 5, 1, "focused"); // so Grim's own mood doesn't make him Sad
    const park = minded(NO_NEED, { class: "park" }, s).pull;
    const bar = minded(NO_NEED, { class: "bar" }, s).pull;
    s.lookAround(-1);
    expect(minded(NO_NEED, { class: "park" }, s).pull).toBeCloseTo(park * C.BEAUTY_PULL);
    expect(minded(NO_NEED, { class: "bar" }, s).pull).toBeCloseTo(bar);
  });
});

describe("beds and meals", () => {
  it("a sleep leaves its bed's moodlet, and a night at home his own bed's", () => {
    const s = at();
    s.cents = 10_000;
    s.do({ name: "Nap on a bench", min: 30, sleep: true, bed: "rough" }, "Museum", new Rng(1), "museum");
    expect(feels(s)).toContain(C.BEDS.rough[0]);
    const hotel: Action = { name: "Hotel room", min: 480, cost: 50, sleep: true, bed: "hotel" };
    s.do(hotel, "Hotel", new Rng(1), "lodging");
    expect(feels(s)).toContain(C.BEDS.hotel[0]);
    const home = at();
    home.where = { city: "Sofia, Bulgaria", code: "BG", country: "Bulgaria" };
    home.home.city = "Sofia, Bulgaria";
    expect(home.nightAtHome(hotel, "lodging")).toBe(true);
    home.do(hotel, "Hotel", new Rng(1), "lodging");
    expect(feels(home)).toContain(C.HOME_BED[0]);
    expect(feels(home)).not.toContain(C.BEDS.hotel[0]);
  });

  it("a meal better or worse than plain leaves its moodlet; a plain one none", () => {
    const s = at();
    s.cents = 10_000;
    s.do({ name: "Three-course dinner", min: 60, cost: 35, meal: "lavish", fx: { fullness: 80 } }, "Bistro", new Rng(1), "");
    expect(s.mind.moodlets.find((m) => m.name === C.MEALS.lavish[0])?.per_h).toBe(C.MEALS.lavish[2]);
    s.mind.moodlets = [];
    s.do({ name: "Kebab", min: 10, cost: 5, fx: { fullness: 45 } }, "Kebab Hut", new Rng(1), "");
    expect(s.mind.moodlets).toEqual([]);
  });
});

describe("data", () => {
  it("every sleep action has a bed, meals are only on food, and beauty's kinds of place exist", () => {
    const all = Object.values(actions()).flat();
    for (const a of all.filter((a) => a.sleep)) expect(C.BEDS, a.name).toHaveProperty(a.bed ?? "none");
    for (const a of all.filter((a) => a.meal)) {
      expect(C.MEALS, a.name).toHaveProperty(a.meal!);
      expect(a.fx?.fullness, a.name).toBeGreaterThan(0);
    }
    for (const a of all.filter((a) => a.bed)) expect(a.sleep, a.name).toBe(true);
    const classes = new Set(Object.keys(actions()).map((k) => k.split("/")[0]));
    for (const k of [...C.GREEN_KINDS, ...C.OLD_TOWN]) expect(classes, k).toContain(k);
  });
});

describe("counts and treats", () => {
  it("count lavish meals and hotel nights, not nights at home, for the Collection", () => {
    const s = at();
    s.cents = 10_000;
    const hotel: Action = { name: "Hotel room", min: 480, cost: 50, sleep: true, bed: "hotel" };
    s.do(hotel, "Hotel", new Rng(1), "lodging");
    s.do({ name: "Oysters", min: 30, cost: 20, meal: "lavish", fx: { fullness: 30 } }, "Bistro", new Rng(1), "restaurant");
    s.where = { city: "Sofia, Bulgaria", code: "BG", country: "Bulgaria" };
    s.home.city = "Sofia, Bulgaria";
    s.do(hotel, "Hotel", new Rng(1), "lodging");
    expect(s.comforts.toJSON()).toEqual({ lavish: 1, hotel: 1 });
    const count = (id: string) => FEATS.find((f) => f.id === id)!.count(s);
    expect([count("gourmet"), count("hotels")]).toEqual([1, 1]);
  });

  it("a treat (a quest's reward) brings its meal's or bed's moodlet and counts", () => {
    const s = at();
    s.treat({ meal: "lavish", bed: "hotel" });
    expect(feels(s)).toEqual([C.MEALS.lavish[0], C.BEDS.hotel[0]]);
    expect(s.comforts.toJSON()).toEqual({ lavish: 1, hotel: 1 });
  });

  it("are kept in the save, and an old save has none", () => {
    const s = at();
    s.treat({ meal: "lavish" });
    expect(Stats.fromJSON(JSON.parse(JSON.stringify(s))).comforts.lavish).toBe(1);
    const old = JSON.parse(JSON.stringify(s));
    delete old.comforts;
    expect(Stats.fromJSON(old).comforts.toJSON()).toEqual({ lavish: 0, hotel: 0 });
  });
});
