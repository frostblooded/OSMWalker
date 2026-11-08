import { describe, expect, it } from "vitest";
import { Stats } from "../../src/core/stats";
import * as U from "../../src/core/upgrades";

const place = (cls: string, subclass = "") => ({ name: "X", class: cls, subclass, rank: 1, lat: 0, lon: 0 });
const owned = (...ids: U.UpgradeId[]) => new Set<string>(ids);

describe("the ladder", () => {
  it("has seven unlocks whose shops open at rising levels", () => {
    expect(U.LADDER.map((u) => u.id)).toEqual(["map", "bike", "guide", "bag", "scooter", "metro", "train"]);
    const levels = U.LADDER.map((u) => u.level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(new Set(levels).size).toBe(levels.length);
  });

  it("is bought in order", () => {
    expect(U.nextUpgrade(owned())!.id).toBe("map");
    expect(U.nextUpgrade(owned("map", "bike"))!.id).toBe("guide");
    expect(U.nextUpgrade(new Set(U.LADDER.map((u) => u.id)))).toBeNull();
  });

  it("offers a shop only once its level is reached and he has the money", () => {
    const map = U.LADDER[0]!;
    expect(U.shopFor(owned(), map.level - 1, 1e9)).toBeNull();
    expect(U.shopFor(owned(), map.level, map.cents - 1)).toBeNull();
    expect(U.shopFor(owned(), map.level, map.cents)).toBe(map);
    expect(U.opensAt(map.level)).toBe(map);
  });

  it("is sold at its own kind of shop, any shop at a pinch, and the rides only at stations", () => {
    const sells = (id: U.UpgradeId, p: ReturnType<typeof place>) => U.upgradeOf(id)!.sellers.some((m) => m(p));
    expect(U.upgradeOf("bike")!.sellers[0]!(place("bicycle", "bicycle"))).toBe(true);
    expect(U.upgradeOf("bike")!.sellers[0]!(place("shop", "books"))).toBe(false);
    expect(sells("bike", place("shop", "gift"))).toBe(true);
    expect(sells("guide", place("library", "books"))).toBe(true);
    expect(sells("bag", place("post", "post_office"))).toBe(true);
    expect(sells("metro", place("shop", "gift"))).toBe(false);
    expect(sells("metro", place("railway", "subway"))).toBe(true);
    expect(sells("train", place("railway", "subway"))).toBe(false);
    expect(sells("train", place("railway", "station"))).toBe(true);
    expect(sells("train", place("bus", "bus_station"))).toBe(true);
  });

  it("changes what he can do, not just numbers", () => {
    expect(U.powers(owned())).toEqual({ cards: 3, speedX: 1, reachX: 1, guide: false, parcels: false, metro: false, train: false });
    expect(U.powers(owned("map")).cards).toBe(4);
    expect(U.powers(owned("map", "bike"))).toMatchObject({ speedX: U.BIKE_SPEED_X, reachX: U.BIKE_REACH_X });
    expect(U.powers(owned("map", "bike", "guide", "bag", "scooter", "metro", "train"))).toEqual({ cards: 4, speedX: U.SCOOTER_SPEED_X, reachX: U.SCOOTER_REACH_X, guide: true, parcels: true, metro: true, train: true });
    expect(U.ride(owned("bike"))).toBe("🚲");
  });
});

describe("buying", () => {
  it("costs its price once, says so in the feed and survives a save", () => {
    const s = new Stats();
    const map = U.LADDER[0]!;
    expect(s.buy(map, place("shop", "books"))).toBe(false);
    s.cents = map.cents + 50;
    expect(s.buy(map, place("shop", "books"))).toBe(true);
    expect(s.cents).toBe(50);
    expect(s.buy(map, place("shop", "books"))).toBe(false);
    expect(s.history.latest()).toMatch(/^Bought a 🗺 City map at X for €[\d.]+: a 4th card at every stop$/);
    const back = Stats.fromJSON(JSON.parse(JSON.stringify(s)));
    expect([...back.upgrades]).toEqual(["map"]);
    expect(Stats.fromJSON({ ...JSON.parse(JSON.stringify(s)), upgrades: ["rocket", "map"] }).upgrades).toEqual(new Set(["map"]));
    expect(Stats.fromJSON({}).upgrades.size).toBe(0);
  });
});
