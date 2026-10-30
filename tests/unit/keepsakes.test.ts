// Keepsakes: landmark cards and their finishes, the Placedex, crawls,
// souvenirs and fare cuts, item stories, and saving them all.
import { beforeEach, describe, expect, it } from "vitest";
import { weight } from "../../src/core/activities";
import type { Item } from "../../src/core/items";
import * as K from "../../src/core/keepsakes";
import { NOT_A_PLACE_SUBCLASS } from "../../src/core/ofm";
import { Rng } from "../../src/core/rng";
import { Stats, type Action, type Place } from "../../src/core/stats";
import { Trips, type City } from "../../src/core/trips";
import { readFileSync } from "node:fs";
import { dataFile } from "../support/data";

const place = (name: string, cls: string, subclass = cls, rank = 3, lat = 42, lon = 23): Place => ({ name, class: cls, subclass, rank, lat, lon });
const souvenir: Action = { name: "Buy a souvenir", min: 5, cost: 8, fx: { mood: 8 }, souvenir: true };
/** An Rng whose rolls come from a list. */
const rolls = (...r: number[]) => Object.assign(new Rng(1), { randf: () => r.shift() ?? 0.99 });
const roundTrip = (s: Stats) => Stats.fromJSON(JSON.parse(JSON.stringify(s)));

let stats: Stats;
beforeEach(() => {
  stats = new Stats();
  stats.arrive("Sofia", "BGR", "Bulgaria");
  stats.now = () => 1_000_000;
});

describe("landmark cards", () => {
  it("gives a card the first time he reaches a landmark, its rarity from the map rank", () => {
    stats.collect(place("Alexander Nevsky Cathedral", "place_of_worship", "christian", 1), rolls(0.9));
    stats.collect(place("Vasil Levski Monument", "monument", "monument", 2, 42.1), rolls(0.9));
    stats.collect(place("Small Museum", "museum", "museum", 5, 42.2), rolls(0.9));
    expect([...stats.keepsakes.cards.values()].map((c) => [c.name, c.rarity, c.finish, c.city])).toEqual([
      ["Alexander Nevsky Cathedral", "Rare", "", "Sofia"],
      ["Vasil Levski Monument", "Uncommon", "", "Sofia"],
      ["Small Museum", "Common", "", "Sofia"],
    ]);
    expect(stats.history.entries.some((e) => e.text === "New card: Small Museum (Common)")).toBe(true);
  });

  it("gives no card at an ordinary place or an art shop", () => {
    stats.collect(place("Cafe", "cafe"), rolls(0.9));
    stats.collect(place("Art Shop", "art_gallery", "art"), rolls(0.9));
    expect(stats.keepsakes.cards.size).toBe(0);
  });

  it("rolls foil and gold", () => {
    expect(K.rollFinish(0)).toBe("gold");
    expect(K.rollFinish(K.GOLD_CHANCE + 0.01)).toBe("foil");
    expect(K.rollFinish(K.GOLD_CHANCE + K.FOIL_CHANCE)).toBe("");
    stats.collect(place("Castle", "castle"), rolls(0.001));
    expect(stats.history.entries.some((e) => e.text === "New card: Castle (Common, Gold)")).toBe(true);
  });

  it("can upgrade a card on a revisit, never downgrade it", () => {
    const castle = place("Castle", "castle");
    stats.collect(castle, rolls(0.9));
    stats.collect(castle, rolls(K.UPGRADE_CHANCE + 0.01, 0.01)); // no upgrade roll
    expect(stats.keepsakes.cards.values().next().value!.finish).toBe("");
    stats.collect(castle, rolls(0.1, 0.01)); // upgrade roll, foil
    expect(stats.keepsakes.cards.values().next().value!.finish).toBe("foil");
    stats.collect(castle, rolls(0.1, 0.9)); // upgrade roll, plain: kept foil
    expect(stats.keepsakes.cards.values().next().value!.finish).toBe("foil");
    expect(stats.keepsakes.cards.size).toBe(1);
  });
});

describe("placedex", () => {
  it("rates kinds by the sweep, with unseen kinds Legendary", () => {
    const dex = JSON.parse(dataFile("placedex.json")) as K.Dex;
    expect(K.dexRarity(dex, "restaurant/restaurant")).toBe("Common");
    expect(K.dexRarity(dex, "museum/museum")).toBe("Uncommon");
    expect(K.dexRarity(dex, "castle/castle")).toBe("Rare");
    expect(K.dexRarity(dex, "zoo/zoo")).toBe("Legendary");
    expect(K.dexRarity(dex, "lighthouse/lighthouse")).toBe("Legendary");
    expect(dex["bus/bus_stop"]).toBeUndefined();
  });

  it("gives XP by rarity the first time he sees a kind", () => {
    stats.dex = { "cafe/cafe": "C" };
    stats.collect(place("Cafe A", "cafe"), rolls());
    expect(stats.xp).toBe(K.DEX_XP.Common);
    stats.collect(place("Cafe B", "cafe", "cafe", 3, 43), rolls());
    expect(stats.xp).toBe(K.DEX_XP.Common);
    stats.collect(place("Windmill", "windmill"), rolls());
    expect(stats.xp).toBe(K.DEX_XP.Common + K.DEX_XP.Legendary - 100); // levelled up once
    expect(stats.level).toBe(2);
    expect(stats.history.entries.some((e) => e.text === "New in the Placedex: Windmill (Legendary, +200 XP)")).toBe(true);
  });

  it("keeps its bands and skipped kinds the same as the tool that builds placedex.json", () => {
    const tool = readFileSync(new URL("../../tools/make_placedex.py", import.meta.url), "utf8");
    const code = { C: "Common", U: "Uncommon", R: "Rare" } as Record<string, string>;
    const bands = [...tool.match(/^BANDS = \[(.*)\]$/m)![1]!.matchAll(/\((\d+), "(\w)"\)/g)].map((m) => [Number(m[1]), code[m[2]!]]);
    expect(bands).toEqual(K.DEX_BANDS);
    const skipped = [...tool.match(/^SKIPPED = \{(.*)\}$/m)![1]!.matchAll(/"(\w+)"/g)].map((m) => m[1]);
    expect(new Set(skipped)).toEqual(NOT_A_PLACE_SUBCLASS);
  });

  it("names kinds for people", () => {
    expect(K.kindLabel("place_of_worship/christian")).toBe("Christian · place of worship");
    expect(K.kindLabel("fast_food/fast_food")).toBe("Fast food");
  });
});

describe("crawls", () => {
  const coffee = K.CRAWLS.find((c) => c.id === "coffee")!;
  const cafes = (n: number, from = 0) => Array.from({ length: n }, (_, i) => place(`Cafe ${from + i}`, "cafe", "cafe", 3, 42 + (from + i) / 100));

  it("finishes once with enough different places in a day, and pays", () => {
    const cents = stats.cents;
    for (const c of cafes(coffee.need)) stats.collect(c, rolls());
    expect(stats.keepsakes.done.has("coffee")).toBe(true);
    expect(stats.cents).toBe(cents + coffee.cents);
    for (const c of cafes(coffee.need, 10)) stats.collect(c, rolls());
    expect(stats.cents).toBe(cents + coffee.cents);
  });

  it("doesn't count the same place twice", () => {
    for (let i = 0; i < 6; i++) stats.collect(cafes(1)[0]!, rolls());
    expect(stats.keepsakes.done.has("coffee")).toBe(false);
  });

  it("starts a day's crawl over the next day", () => {
    for (const c of cafes(coffee.need - 1)) stats.collect(c, rolls());
    stats.now = () => 1_000_000 + 86_400;
    stats.collect(cafes(1, 20)[0]!, rolls());
    expect(stats.keepsakes.done.has("coffee")).toBe(false);
    expect(stats.keepsakes.progress.coffee).toHaveLength(1);
  });

  it("doesn't count art shops as galleries or sights", () => {
    const shop = place("Art Shop", "art_gallery", "art");
    expect(K.CRAWLS.filter((c) => K.crawlMatches(c, shop))).toEqual([]);
    expect(K.CRAWLS.filter((c) => K.crawlMatches(c, place("Gallery", "art_gallery", "art_gallery"))).map((c) => c.id)).toEqual(["culture", "sights"]);
  });

  it("starts a city's crawl over in a new city", () => {
    for (let i = 0; i < 4; i++) stats.collect(place(`Church ${i}`, "place_of_worship", "christian", 3, 42 + i / 100), rolls());
    stats.arrive("Plovdiv", "BGR", "Bulgaria");
    stats.collect(place("Church 9", "place_of_worship", "christian", 3, 43), rolls());
    expect(stats.keepsakes.done.has("pilgrim")).toBe(false);
  });
});

describe("souvenirs", () => {
  it("buys one per country, only where he has none yet", () => {
    expect(stats.canDo(souvenir, 12)).toBe(true);
    const cents = stats.cents;
    expect(stats.do(souvenir, "Gift Shop", new Rng(1))).toBe("Bought a souvenir from Bulgaria: a bottle of rose oil at Gift Shop (-€8)");
    expect(stats.cents).toBe(cents - 800);
    expect(stats.canDo(souvenir, 12)).toBe(false);
    stats.arrive("Reykjavik", "ISL", "Iceland");
    expect(stats.canDo(souvenir, 12)).toBe(true);
    stats.do(souvenir, "", new Rng(1));
    expect(stats.keepsakes.souvenirs.get("ISL")!.name).toBe("Iceland fridge magnet");
  });

  it("weighs up the souvenir action", () => {
    expect(weight(souvenir, stats)).toBeGreaterThan(weight({ name: "x", min: 1, cost: 8 }, stats));
  });

  it("makes fares cheaper for every five", () => {
    expect(stats.fareMult()).toBe(1);
    for (const c of ["A", "B", "C", "D", "E"]) {
      stats.arrive(c, c, c);
      stats.do(souvenir, "", new Rng(1));
    }
    expect(stats.fareMult()).toBeCloseTo(1 - K.FARE_CUT);
    expect(stats.history.latest()).toBe("Seasoned traveller: fares are now 2% cheaper");
    expect(K.fareCut(100)).toBe(K.FARE_CUT_MAX);
    const city: City = { name: "Far", code: "X", country: "X", lat: 50, lon: 23, pop: 1 };
    const station = place("Bus station", "bus", "bus_station", 1);
    const trips = new Trips([city]);
    const full = trips.planTrip(city, [42, 23], [station], 1e9, false, 0.99);
    const cut = trips.planTrip(city, [42, 23], [station], 1e9, false, 0.99, stats.fareMult());
    expect("fare" in cut && "fare" in full && cut.fare).toBe("fare" in full ? Math.ceil(full.fare * (1 - K.FARE_CUT)) : -1);
  });
});

describe("item stories", () => {
  const hat = (): Item => ({ name: "Cotton Cap", slot: "head", stats: { cha: 1 }, rarity: "Common", price: 1500 });

  it("records where he bought it, the countries and km it went through", () => {
    stats.buy(hat(), "Hat Shop");
    const story = stats.gear.head!.story!;
    expect(story).toMatchObject({ from: "Sofia", countries: ["BGR"], km: 0 });
    stats.passTime(10, 1500);
    stats.arrive("Paris", "FRA", "France");
    stats.arrive("Plovdiv", "BGR", "Bulgaria");
    expect(stats.gear.head!.story).toMatchObject({ countries: ["BGR", "FRA"], km: 1.5 });
  });

  it("never sells his most travelled treasured items", () => {
    const treasured = (name: string, price: number): Item => ({ ...hat(), name, price, story: { from: "Sofia", t: 0, countries: ["A", "B", "C"], km: 9 } });
    stats.bag = [treasured("Old Cap", 10), { ...hat(), name: "New Cap", price: 900 }];
    stats.sellLoot("");
    expect(stats.bag.map((i) => i.name)).toEqual(["Old Cap"]);
    stats.sellLoot("");
    expect(stats.bag).toEqual([]); // nothing else left to sell
  });

  it("saves and loads everything, and loads old saves without keepsakes", () => {
    stats.collect(place("Castle", "castle"), rolls(0.01));
    stats.do(souvenir, "", new Rng(1));
    stats.buy(hat(), "");
    const back = roundTrip(stats);
    expect(back.keepsakes.cards.size).toBe(1);
    expect(back.keepsakes.souvenirs.has("BGR")).toBe(true);
    expect(back.keepsakes.dex.has("castle/castle")).toBe(true);
    expect(back.where.code).toBe("BGR");
    expect(back.gear.head!.story!.from).toBe("Sofia");
    const old = JSON.parse(JSON.stringify(new Stats()));
    delete old.keepsakes;
    delete old.where;
    const loaded = Stats.fromJSON(old);
    expect(loaded.keepsakes.cards.size).toBe(0);
    expect(loaded.where.code).toBe("");
  });
});
