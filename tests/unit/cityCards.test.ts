// City cards: the pool from the city list, pulls, free and bought packs,
// spares and their sale, country sets, and saving them.
import { beforeEach, describe, expect, it } from "vitest";
import type { ActionTable } from "../../src/core/activities";
import * as CC from "../../src/core/cityCards";
import { Rng } from "../../src/core/rng";
import { Stats, type Action, type Place } from "../../src/core/stats";
import { type City, parseCities } from "../../src/core/trips";
import { dataFile } from "../support/data";

const city = (name: string, code: string, pop: number): City => ({ name, code, country: `${code}-land`, lat: 0, lon: 0, pop });
/** Country A has 12 cities (10 get cards), B has 2. */
const CITIES = [...Array.from({ length: 12 }, (_, i) => city(`A${i}`, "A", 1000 - i)), city("B0", "B", 50), city("B1", "B", 40)];
/** An Rng whose rolls come from a list. */
const rolls = (...r: number[]) => Object.assign(new Rng(1), { randf: () => r.shift() ?? 0.99 });
const pack: Action = { name: "Buy a city card pack", min: 3, cost: 5, pack: true };
const kiosk: Place = { name: "Kiosk", class: "shop", subclass: "kiosk", rank: 5, lat: 0, lon: 0 };
/** Rolls that pull this card (a rarity roll, then its index in its rarity list) with no finish. */
const pullOf = (p: CC.Pool, key: string, finish = 0.9) => {
  const card = p.byKey.get(key)!;
  const list = p.byRarity.get(card.rarity)!;
  let before = 0;
  for (const [r, odds] of CC.PULL_ODDS) {
    if (r === card.rarity) break;
    before += odds;
  }
  return [before + 0.001, (list.indexOf(card) + 0.5) / list.length, finish];
};

let stats: Stats;
let pool: CC.Pool;
beforeEach(() => {
  pool = CC.pool(CITIES);
  stats = new Stats();
  stats.cityPool = pool;
  stats.now = () => 1_000_000;
  // Kinds he has seen already, so the Placedex's XP never levels him up into an extra free pack.
  for (const kind of ["cafe/cafe", "shop/kiosk"]) stats.keepsakes.dex.set(kind, { t: 0, city: "" });
});

describe("the pool", () => {
  it("has the biggest cities of each country, rarity by size", () => {
    expect(pool.cards.filter((c) => c.code === "A")).toHaveLength(CC.CARDS_PER_COUNTRY);
    expect(pool.byKey.get("A:A0")!.rarity).toBe("Rare");
    expect(pool.byKey.get("A:A2")!.rarity).toBe("Uncommon");
    expect(pool.byKey.get("A:A3")!.rarity).toBe("Common");
    expect(pool.byKey.has("A:A10")).toBe(false);
    expect(pool.byCountry.get("B")).toHaveLength(2);
    const real = CC.pool(parseCities(dataFile("cities.tsv")));
    expect(real.cards.length).toBeGreaterThan(1000);
    expect(real.byKey.size).toBe(real.cards.length);
  });

  it("gives a name that two towns share to the bigger one only", () => {
    const p = CC.pool([city("Springfield", "C", 100), city("Springfield", "C", 90), city("Salem", "C", 80)]);
    expect(p.cards.map((c) => [c.name, c.rarity])).toEqual([["Springfield", "Rare"], ["Salem", "Uncommon"]]);
  });

  it("pulls by the rarity odds, then a city of that rarity", () => {
    expect(CC.pull(pool, rolls(0.01, 0)).card.rarity).toBe("Rare");
    expect(CC.pull(pool, rolls(0.1, 0)).card.rarity).toBe("Uncommon");
    expect(CC.pull(pool, rolls(0.5, 0)).card.rarity).toBe("Common");
    expect(CC.pull(pool, rolls(...pullOf(pool, "B:B1", 0.001))).finish).toBe("gold");
  });
});

describe("packs", () => {
  it("are free for each new city and country and each level, opened at his next stop", () => {
    stats.arrive("Sofia", "BGR", "Bulgaria");
    expect(stats.keepsakes.freePacks).toBe(2);
    stats.arrive("Sofia", "BGR", "Bulgaria");
    stats.arrive("Plovdiv", "BGR", "Bulgaria");
    expect(stats.keepsakes.freePacks).toBe(3);
    stats.addXp(100);
    expect(stats.keepsakes.freePacks).toBe(4);
    stats.collect({ ...kiosk, class: "cafe", subclass: "cafe" }, new Rng(5));
    expect(stats.keepsakes.freePacks).toBe(0);
    expect(stats.keepsakes.cityCards.size + stats.keepsakes.spares.length).toBe(4 * CC.PACK_SIZE);
    expect(stats.history.entries.some((e) => e.text.startsWith("Opened a free card pack: "))).toBe(true);
  });

  it("can be bought at card shops, once the pool is known", () => {
    stats.cityPool = null;
    expect(stats.canDo(pack, 12)).toBe(false);
    stats.cityPool = pool;
    expect(stats.canDo(pack, 12)).toBe(true);
    const cents = stats.cents;
    const line = stats.do(pack, "Kiosk", new Rng(2));
    expect(line).toMatch(/^Bought a card pack at Kiosk \(-€5\): /);
    expect(stats.cents).toBe(cents - 500);
    expect(stats.keepsakes.cityCards.size + stats.keepsakes.spares.length).toBe(CC.PACK_SIZE);
  });

  it("are sold where every shop that buys spares also sells packs", () => {
    const actions = JSON.parse(dataFile("actions.json")) as ActionTable;
    const sellers = Object.entries(actions)
      .filter(([, list]) => Array.isArray(list) && list.some((a) => a.pack))
      .map(([k]) => k);
    expect(sellers.sort()).toEqual(Object.keys(CC.CARD_SHOPS).sort());
  });
});

describe("spares and sets", () => {
  const open = (...cards: number[][]) => {
    stats.keepsakes.freePacks = 1;
    stats.collect({ ...kiosk, class: "cafe", subclass: "cafe" }, rolls(...cards.flat()));
  };

  it("keeps the better finish and makes the other a spare, then sells spares at a card shop", () => {
    open(pullOf(pool, "A:A5"), pullOf(pool, "A:A5", 0.01), pullOf(pool, "A:A5"), pullOf(pool, "A:A6"), pullOf(pool, "A:A6"));
    expect(stats.keepsakes.cityCards.get("A:A5")!.finish).toBe("foil");
    expect(stats.keepsakes.spares).toEqual([
      { rarity: "Common", finish: "" },
      { rarity: "Common", finish: "" },
      { rarity: "Common", finish: "" },
    ]);
    const cents = stats.cents;
    stats.collect(kiosk, rolls());
    expect(stats.cents).toBe(cents + 3 * CC.SPARE_CENTS.Common!);
    expect(stats.keepsakes.spares).toEqual([]);
    expect(stats.history.latest()).toBe("Sold 3 spare city cards at Kiosk (+€0.30)");
    expect(CC.spareCents({ rarity: "Rare", finish: "gold" })).toBe(CC.SPARE_CENTS.Rare! * CC.GOLD_MULT);
  });

  it("gives Charm in a country whose whole set he has", () => {
    stats.arrive("B0", "B", "B-land");
    const charm = stats.attr("cha");
    open(pullOf(pool, "B:B0"), pullOf(pool, "B:B1"), pullOf(pool, "A:A3"), pullOf(pool, "A:A3"), pullOf(pool, "A:A3"));
    expect(stats.keepsakes.sets).toEqual(["B"]);
    expect(stats.history.entries.some((e) => e.text === "Completed the B-land city card set! Charm +1 while in B-land")).toBe(true);
    expect(stats.attr("cha")).toBe(charm + CC.SET_CHARM);
    stats.arrive("A0", "A", "A-land");
    expect(stats.attr("cha")).toBe(charm);
  });

  it("works his sets out again when the pool changes, and has no pool when it is empty", () => {
    stats.keepsakes.cityCards.set("B:B0", { finish: "", t: 0 });
    stats.keepsakes.sets = ["A"];
    stats.setCityPool(CC.pool(CITIES.filter((c) => c.name !== "B1")));
    expect(stats.keepsakes.sets).toEqual(["B"]);
    stats.setCityPool(CC.pool([]));
    expect(stats.cityPool).toBeNull();
    expect(stats.canDo(pack, 12)).toBe(false);
  });

  it("saves them, and loads old saves with none", () => {
    open(pullOf(pool, "A:A5"), pullOf(pool, "A:A5"), pullOf(pool, "A:A6"), pullOf(pool, "A:A7"), pullOf(pool, "A:A8"));
    stats.keepsakes.freePacks = 2;
    const back = Stats.fromJSON(JSON.parse(JSON.stringify(stats)));
    expect([...back.keepsakes.cityCards.keys()]).toEqual(["A:A5", "A:A6", "A:A7", "A:A8"]);
    expect(back.keepsakes.spares).toHaveLength(1);
    expect(back.keepsakes.freePacks).toBe(2);
    const old = JSON.parse(JSON.stringify(new Stats()));
    for (const f of ["cityCards", "spares", "freePacks", "seen", "sets"]) delete old.keepsakes[f];
    const loaded = Stats.fromJSON(old);
    expect(loaded.keepsakes.cityCards.size + loaded.keepsakes.freePacks + loaded.keepsakes.seen.length).toBe(0);
  });
});
