// Quirks from habits and his spot: alone and through Stats.
import { describe, expect, it } from "vitest";
import { minded, placePull } from "../../src/core/activities";
import { NO_NEED } from "../../src/core/goals";
import * as Q from "../../src/core/quirks";
import * as Sp from "../../src/core/spot";
import { Rng } from "../../src/core/rng";
import { Stats, type Action, type Place } from "../../src/core/stats";

const T0 = 1_800_000_000;
const place = (name: string, cls: string, lat = 1, lon = 2): Place => ({ name, class: cls, subclass: cls, rank: 1, lat, lon });
const CITY = "Sofia, Bulgaria";

describe("quirks", () => {
  it("come from doing things at their places often enough, summed over their kinds", () => {
    const q = new Q.Quirks();
    for (let i = 0; i < 5; i++) expect(q.count("museum").gained).toBeNull();
    for (let i = 0; i < 4; i++) q.count("theatre");
    expect(q.count("art_gallery").gained?.name).toBe("Culture vulture");
    expect(q.have).toEqual(["culture"]);
  });

  it("pull their places QUIRK_PULL times as hard, and cheer him there", () => {
    const q = new Q.Quirks();
    q.have = ["culture"];
    expect(q.pull("museum")).toBe(Q.QUIRK_PULL);
    expect(q.pull("cafe")).toBe(1);
    expect(q.count("museum").here.map((x) => x.id)).toEqual(["culture"]);
  });

  it("are at most MAX_QUIRKS; the oldest fades for good", () => {
    const q = new Q.Quirks();
    q.have = ["croissant", "coffee", "culture", "owl", "bookworm"];
    q.counts = { park: 19 };
    const { gained, lost } = q.count("park");
    expect(gained?.id).toBe("nature");
    expect(lost?.id).toBe("croissant");
    expect(q.have).toHaveLength(Q.MAX_QUIRKS);
    q.have = q.have.filter((x) => x !== "coffee");
    expect(q.count("bakery").gained).toBeNull(); // faded, never back
  });

  it("survive a save", () => {
    const q = new Q.Quirks();
    q.count("cafe");
    expect(Q.Quirks.fromJSON(JSON.parse(JSON.stringify(q))).toJSON()).toEqual(q.toJSON());
  });
});

describe("his spot", () => {
  it("is the place he reached most, once SPOT_MIN times, and a tie keeps the old one", () => {
    const s = new Sp.Spots();
    const a = place("Cafe A", "cafe");
    const b = place("Bar B", "bar", 1.01);
    expect(s.visit(CITY, a)).toBe("");
    s.visit(CITY, a);
    expect(s.spot(CITY)).toBeNull();
    expect(s.visit(CITY, a)).toContain("Cafe A is his spot now");
    for (let i = 0; i < 3; i++) s.visit(CITY, b);
    expect(s.spot(CITY)?.name).toBe("Cafe A");
    expect(s.visit(CITY, b)).toContain("Bar B is his spot now");
    expect(s.spot("Elsewhere")).toBeNull();
  });

  it("pulls his goal SPOT_PULL times as hard in the morning only", () => {
    const s = new Sp.Spots();
    const a = place("Cafe A", "cafe");
    for (let i = 0; i < Sp.SPOT_MIN; i++) s.visit(CITY, a);
    expect(s.pull(CITY, a, Sp.SPOT_FROM)).toBe(Sp.SPOT_PULL);
    expect(s.pull(CITY, a, Sp.SPOT_TO)).toBe(1);
    expect(s.pull(CITY, place("Other", "cafe"), 8)).toBe(1);
  });

  it("keeps SPOT_KEEP places a city", () => {
    const s = new Sp.Spots();
    for (let i = 0; i < Sp.SPOT_KEEP + 5; i++) s.visit(CITY, place(`P${i}`, "cafe", 1 + i / 100));
    expect(s.cities[CITY]).toHaveLength(Sp.SPOT_KEEP);
  });
});

describe("through Stats", () => {
  const at = () => {
    const s = new Stats();
    s.now = () => T0;
    s.where = { city: CITY, code: "BGR", country: "Bulgaria" };
    return s;
  };

  it("an action counts toward a quirk, and a quirk's place gives its moodlet and pulls harder", () => {
    const s = at();
    s.quirks.counts = { bakery: 19 };
    s.do({ name: "Buy a pastry", min: 1 } as Action, "Bakery", new Rng(1), "bakery");
    expect(s.history.entries.some((e) => e.text === "🥐 He has become a Croissant snob")).toBe(true);
    s.do({ name: "Buy a pastry", min: 1 } as Action, "Bakery", new Rng(1), "bakery");
    expect(s.mind.moodlets.map((m) => m.name)).toContain("A proper croissant");
    expect(minded(NO_NEED, { class: "bakery" }, s).pull).toBe(Q.QUIRK_PULL);
  });

  it("fainting counts toward Hospital regular", () => {
    const s = at();
    for (let i = 0; i < 5; i++) s.wakeInHospital("City Hospital");
    expect(s.quirks.have).toEqual(["hospital"]);
  });

  it("visits make his spot, which pulls in the morning and costs less", () => {
    const s = at();
    const cafe = place("Cafe A", "cafe");
    for (let i = 0; i < Sp.SPOT_MIN; i++) s.visit(cafe);
    expect(s.history.entries.at(-1)!.text).toContain("Cafe A is his spot now");
    expect(placePull(cafe, s, 8)).toBe(Sp.SPOT_PULL);
    const coffee = { name: "Drink a coffee", min: 1, cost: 3 } as Action;
    const before = s.cents;
    s.do(coffee, "Cafe A", new Rng(1), "cafe");
    expect(before - s.cents).toBe(Math.round(300 * (1 - Sp.SPOT_DISCOUNT)));
    const elsewhere = s.cents;
    s.do(coffee, "Cafe B", new Rng(1), "cafe");
    expect(elsewhere - s.cents).toBe(300);
  });
});
