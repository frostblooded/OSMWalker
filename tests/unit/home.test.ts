// His home: rented once a city knows him as a Regular, bought with money to spare, furnished from his travels, nights there, trips home; and fame's greetings and paper story.
import { describe, expect, it } from "vitest";
import { billsAt } from "../../src/core/bills";
import { cityKey, FAME_TIERS, GREET_PER_TIER, greeting } from "../../src/core/fame";
import * as Hm from "../../src/core/home";
import type { Item } from "../../src/core/items";
import { homeIcons } from "../../src/core/mapIcons";
import { Rng } from "../../src/core/rng";
import { Stats, type Action } from "../../src/core/stats";
import { Trips, type City } from "../../src/core/trips";
import { WEEK_S } from "../../src/core/week";

const DAY = 86400;
/** Monday 2026-11-02 12:00 UTC. */
const T0 = Date.UTC(2026, 10, 2, 12) / 1000;
const SOFIA = "Sofia, Bulgaria";
const HOSTEL: Action = { name: "Hostel bunk for the night", min: 480, cost: 15, sleep: true, fx: { energy: 100 } } as Action;
const thing = (name: string, price: number, from = "Lisbon", countries: string[] = ["PT"]): Item => ({ name, slot: "trinket", stats: {}, rarity: "Common", price, story: { from, t: 0, countries, km: 0 } });

/** A Stats in Sofia at T0 whose day has started, known there at `points` of fame. */
function inSofia(points: number, cents = 0): Stats {
  const s = new Stats();
  s.where = { city: SOFIA, code: "BG", country: "Bulgaria" };
  s.life.mark(SOFIA, [42.69, 23.32]);
  s.fame.add(cityKey(SOFIA, "BG"), points);
  s.now = () => T0;
  s.passTime(1, 0);
  s.cents = cents;
  return s;
}

/** Moves `s` on to the start of the next day. */
function nextDay(s: Stats, days = 1): void {
  const t = s.now() + days * DAY;
  s.now = () => t;
  s.passTime(1, 0);
}

describe("his home", () => {
  it("is rented once a city knows him as a Regular, not before", () => {
    const s = inSofia(FAME_TIERS[Hm.RENT_TIER]! - 1);
    nextDay(s);
    expect(s.home.has()).toBe(false);
    s.fame.add(s.here(), 1);
    nextDay(s);
    expect(s.home).toMatchObject({ city: SOFIA, code: "BG", at: [42.69, 23.32], bought: 0 });
    expect(s.history.entries.some((e) => /^🏡 Rented a flat in Sofia/.test(e.text))).toBe(true);
    expect(s.chronicle.lines.some((l) => l.text === "Rented a flat in Sofia")).toBe(true);
  });

  it("puts its rent on the weekly bills while rented", () => {
    const s = inSofia(1000);
    expect(s.home.has()).toBe(true);
    s.cents = 1e6;
    s.bond.nudge = "save";
    s.bond.nudgeLeft = 1e9;
    const t = T0 + WEEK_S;
    s.now = () => t;
    s.passTime(1, 0);
    expect(s.home.rentAt(s.level)).toBe(Hm.RENT_CENTS);
    expect(s.history.entries.some((e) => /^Paid the week's bills: rent, phone/.test(e.text))).toBe(true);
    expect(s.cents).toBe(1e6 - billsAt(1) - Hm.RENT_CENTS);
  });

  it("is bought with its price to spare, and then has no rent", () => {
    const s = inSofia(1000);
    nextDay(s);
    s.cents = Hm.HOME_PRICE;
    nextDay(s);
    expect(s.home.bought).toBe(0);
    const cents = Hm.HOME_PRICE + s.savingTarget() + 100_000;
    s.cents = cents;
    nextDay(s);
    expect(s.home.bought).toBeGreaterThan(0);
    expect(s.history.entries.some((e) => e.text.startsWith("🔑 Bought his flat in Sofia"))).toBe(true);
    expect(s.cents).toBeLessThanOrEqual(cents - Hm.HOME_PRICE);
    expect(s.home.rentAt(s.level)).toBe(0);
  });

  it("in a home he owns, he puts up one thing from his travels a day, never a treasured, stolen or local one", () => {
    const s = inSofia(1000);
    nextDay(s);
    s.home.bought = s.now();
    const treasured = thing("Old Map", 9000, "Rome", ["IT", "FR", "ES", "PT", "GR"]);
    s.bag = [thing("Cheap Fan", 100), thing("Silk Shawl", 2000), { ...thing("Hot Watch", 5000), stolen: true }, thing("Sofia Mug", 3000, "Sofia"), treasured];
    nextDay(s);
    expect(s.home.things.map((i) => i.name)).toEqual(["Silk Shawl"]);
    nextDay(s);
    expect(s.home.things.map((i) => i.name)).toEqual(["Silk Shawl", "Cheap Fan"]);
    nextDay(s);
    expect(s.home.things).toHaveLength(2);
    expect(s.bag.map((i) => i.name)).toEqual(["Hot Watch", "Sofia Mug", "Old Map"]);
  });

  it("a night at a hostel in his home city is free and cheers him, more with each thing up", () => {
    const s = inSofia(1000, 10_000);
    nextDay(s);
    s.cents = 10_000;
    s.meters.mood = 50;
    s.do(HOSTEL, "Hostel Mostel", new Rng(1), "lodging");
    expect(s.cents).toBe(10_000);
    expect(s.meters.mood).toBe(50 + Hm.HOME_MOOD);
    expect(s.history.latest()).toBe("🏡 Slept at home in his own bed");
    s.home.things = [thing("A", 1), thing("B", 1)];
    expect(s.home.mood()).toBe(Hm.HOME_MOOD + 2 * Hm.HOME_MOOD_PER_THING);
  });

  it("nothing goes wrong on a night at home, though the risk's roll still happens", () => {
    const s = inSofia(1000, 10_000);
    s.cents = 10_000;
    const rolls: number[] = [];
    const rng = { randf: () => (rolls.push(0), 0), randiRange: (lo: number) => lo, pick: <T>(l: readonly T[]) => l[0]! } as unknown as Rng;
    s.do({ ...HOSTEL, risk: { p: 1, text: "and a bunkmate stole 10c", cost: 0.1 } } as Action, "Hostel Mostel", rng, "lodging");
    expect(s.cents).toBe(10_000);
    expect(s.history.latest()).toBe("🏡 Slept at home in his own bed");
    expect(rolls.length).toBeGreaterThan(0);
  });

  it("a nap at a museum, or a hostel in another city, isn't at home", () => {
    const s = inSofia(1000, 10_000);
    nextDay(s);
    s.cents = 10_000;
    s.do(HOSTEL, "Hostel Mostel", new Rng(1), "museum");
    expect(s.cents).toBeLessThan(10_000);
    s.where = { city: "Plovdiv, Bulgaria", code: "BG", country: "Bulgaria" };
    s.cents = 10_000;
    s.do(HOSTEL, "Hostel Mostel", new Rng(1), "lodging");
    expect(s.cents).toBeLessThan(10_000);
  });

  it("calls him home on a share of trips from other cities", () => {
    const sofia: City = { name: "Sofia", code: "BG", country: "Bulgaria", lat: 42.69, lon: 23.32, pop: 1e6 };
    const trips = new Trips([sofia]);
    const h = new Hm.Home();
    expect(trips.homeward(h, "Plovdiv, Bulgaria", 0)).toBeNull();
    h.rent(SOFIA, "BG", [42.69, 23.32], T0);
    expect(trips.homeward(h, "Plovdiv, Bulgaria", Hm.HOME_TRIP - 0.01)).toBe(sofia);
    expect(trips.homeward(h, "Plovdiv, Bulgaria", Hm.HOME_TRIP)).toBeNull();
    expect(trips.homeward(h, SOFIA, 0)).toBeNull();
  });

  it("shows on the map in its city, and is where he retires; his heir keeps it", () => {
    const s = inSofia(1000);
    nextDay(s);
    expect(homeIcons(s.home, SOFIA)).toEqual([{ id: "home", at: [42.69, 23.32], icon: "flat", label: "His flat (rented)", kind: "place" }]);
    expect(homeIcons(s.home, "Plovdiv, Bulgaria")).toEqual([]);
    s.where = { city: "Varna, Bulgaria", code: "BG", country: "Bulgaria" };
    s.life.cityMin["Varna, Bulgaria"] = 1e6;
    expect(s.homeCity()).toBe(SOFIA);
    expect(s.retire("age").heir.home.city).toBe(SOFIA);
  });

  it("is kept in the save, and an old save has none", () => {
    const s = inSofia(1000);
    nextDay(s);
    s.home.things = [thing("Silk Shawl", 2000)];
    const back = Stats.fromJSON(JSON.parse(JSON.stringify(s)));
    expect(back.home.toJSON()).toEqual(s.home.toJSON());
    const old = JSON.parse(JSON.stringify(new Stats()));
    delete old.home;
    expect(Stats.fromJSON(old).home.has()).toBe(false);
  });
});

describe("fame's greetings and paper", () => {
  it("someone greets him more often the better the city knows him, never as a stranger", () => {
    expect(greeting(0, "Cafe", 0, 0)).toBe("");
    expect(greeting(1, "Cafe", GREET_PER_TIER - 0.001, 0)).toMatch(/^👋 .*Cafe/);
    expect(greeting(1, "Cafe", GREET_PER_TIER, 0)).toBe("");
    expect(greeting(3, "Cafe", 3 * GREET_PER_TIER - 0.001, 0.99)).toMatch(/^👋 /);
  });

  it("at a stop where he is known, on its own dice", () => {
    let hi = 0;
    for (let i = 0; i < 400; i++) {
      const s = inSofia(1000);
      s.now = () => T0 + i;
      // A deck that never plays, so only the greeting is left.
      s.incidents = [{ id: "x", icon: "", tone: "odd", text: "", say: "" }];
      s.story.tension = 0;
      if (s.happen({ name: "Cafe Rila", class: "cafe", lat: 0, lon: 0 }, 12, new Rng(1)).startsWith("👋")) hi++;
    }
    expect(hi).toBeGreaterThan(0);
    expect(hi).toBeLessThan(400 * 3 * GREET_PER_TIER * 2);
  });

  it("a Local hero gets a story in the local paper and his life story", () => {
    const s = inSofia(FAME_TIERS[3]! - 1);
    s.addFame(1);
    expect(s.history.latest()).toMatch(/^📰 The Sofia paper runs a story on him: "/);
    expect(s.chronicle.lines.at(-1)!.text).toMatch(/^In the Sofia paper: "/);
  });
});
