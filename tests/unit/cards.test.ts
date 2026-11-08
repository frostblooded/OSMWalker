import { describe, expect, it } from "vitest";
import * as C from "../../src/core/cards";
import { moved } from "../../src/core/geo";
import { Rng } from "../../src/core/rng";
import { visitKey, type Place } from "../../src/core/stats";
import { GUIDE_XP_X, LADDER, METRO_MIN_M, PARCEL_PAY_X, powers, upgradeOf, type UpgradeId } from "../../src/core/upgrades";

const HERE: [number, number] = [42, 23];
/** A place `east` metres east of HERE (negative: west). */
const at = (name: string, cls: string, east: number, rank = 5, subclass = ""): Place => {
  const [lat, lon] = moved(HERE[0], HERE[1], [east, 0]);
  return { name, class: cls, subclass, rank, lat, lon };
};
const ctx = (seed = 1, recent: string[] = [], isNew = (_: Place) => false): C.DealCtx => ({ rng: new Rng(seed), isNew, recent: new Set(recent) });
const names = (o: C.Offer[]) => o.map((c) => c.place.name);

const CITY = [
  at("Cafe 200", "cafe", 200),
  at("Bakery 300", "bakery", -300),
  at("Shop 1000", "shop", 1000),
  at("Bar 1200", "bar", -1200),
  at("Museum 600", "museum", 600),
  at("Park 500", "park", -500),
];

describe("dealing cards", () => {
  it("deals one close, one far and one of another kind, nearest first", () => {
    for (let s = 0; s < 30; s++) {
      const o = C.deal(CITY, HERE, ctx(s));
      expect(o).toHaveLength(C.CARDS);
      const by = Object.fromEntries(o.map((c) => [c.slot, c]));
      expect(by.close!.distM).toBeLessThanOrEqual(C.CLOSE_MAX_M + 1);
      expect(by.far!.distM).toBeGreaterThanOrEqual(C.FAR_MIN_M - 1);
      // Close and far both pay money here, so the third gives XP.
      expect(["sight", "green"]).toContain(by.other!.kind);
      expect(o.map((c) => c.distM)).toEqual([...o.map((c) => c.distM)].sort((a, b) => a - b));
      expect(new Set(names(o)).size).toBe(C.CARDS);
    }
  });

  it("puts what each card gives on it, more for the far one", () => {
    const o = C.deal([at("Cafe 200", "cafe", 200), at("Shop 1000", "shop", 1000)], HERE, ctx());
    const [near, far] = o;
    expect(near!.walkM).toBeCloseTo(near!.distM * C.ROUTE_FACTOR, 6);
    expect(far!.reward.cents).toBeGreaterThan(near!.reward.cents);
    // The close one pays more for each metre walked.
    expect(near!.reward.cents / near!.walkM).toBeGreaterThan(far!.reward.cents / far!.walkM);
  });

  it("prefers a place he has never been to for the third card", () => {
    const fresh = (p: Place) => p.name === "Park 500";
    for (let s = 0; s < 20; s++) {
      const o = C.deal(CITY, HERE, ctx(s, [], fresh));
      const other = o.find((c) => c.slot === "other")!;
      expect(other.place.name).toBe("Park 500");
      expect(other.isNew).toBe(true);
      expect(other.reward.xp).toBeGreaterThan(C.offerFor(other.place, HERE, "other", false).reward.xp);
    }
  });

  it("leaves out his recent picks, places that give nothing and places he stands at", () => {
    const o = C.deal([...CITY, at("Bench", "bench", 300), at("Here", "cafe", 5)], HERE, ctx(1, [visitKey(CITY[0]!), visitKey(CITY[1]!)]));
    expect(names(o)).not.toContain("Cafe 200");
    expect(names(o)).not.toContain("Bakery 300");
    expect(names(o)).not.toContain("Bench");
    expect(names(o)).not.toContain("Here");
  });

  it("reaches further when too few places are near, and deals what there is", () => {
    const far = [at("Cafe far", "cafe", 3000), at("Park far", "park", -4000)];
    expect(names(C.deal(far, HERE, ctx())).sort()).toEqual(["Cafe far", "Park far"]);
    expect(C.deal([], HERE, ctx())).toEqual([]);
  });

  it("turns up notable places more often", () => {
    const two = [at("Big cafe", "cafe", 200, 1), at("Small cafe", "cafe", 250, 9), at("Shop 1000", "shop", 1000)];
    let big = 0;
    for (let s = 0; s < 200; s++) if (C.deal(two, HERE, ctx(s)).some((c) => c.slot === "close" && c.place.name === "Big cafe")) big++;
    expect(big).toBeGreaterThan(150);
  });
});

describe("cards from upgrades", () => {
  const up = (ids: UpgradeId[], seed = 1, isNew = (_: Place) => false): C.DealCtx => ({ ...ctx(seed, [], isNew), powers: powers(new Set(ids)) });
  const slots = (o: C.Offer[]) => o.map((c) => c.slot).sort();

  it("deals a 4th card with the City map", () => {
    expect(C.deal(CITY, HERE, up(["map"]))).toHaveLength(4);
  });

  it("deals the shop for the next upgrade, its own kind of shop when one is near", () => {
    const bike = upgradeOf("bike")!;
    const city = [...CITY, at("Gifts", "shop", 150, 5, "gift"), at("Bikes", "bicycle", -400, 5, "bicycle")];
    const shop = C.deal(city, HERE, { ...up([]), shop: bike }).find((c) => c.slot === "shop")!;
    expect(shop.place.name).toBe("Bikes");
    expect(shop.upgrade).toBe("bike");
    expect(shop.reward).toEqual({ cents: 0, xp: 0 });
    // No bike shop near: any shop sells it.
    const far = [...CITY, at("Gifts", "shop", 150, 5, "gift"), at("Bikes", "bicycle", -2500, 5, "bicycle")];
    expect(C.deal(far, HERE, { ...up([]), shop: bike }).find((c) => c.slot === "shop")!.place.name).toBe("Gifts");
    // Only a station sells the metro pass.
    expect(C.deal(city, HERE, { ...up([]), shop: upgradeOf("metro")! }).some((c) => c.slot === "shop")).toBe(false);
  });

  it("deals a never-seen sight for more XP with the Guidebook", () => {
    const fresh = (p: Place) => p.name === "Museum 600";
    for (let s = 0; s < 10; s++) {
      const guide = C.deal(CITY, HERE, up(["map", "bike", "guide"], s, fresh)).find((c) => c.slot === "guide")!;
      expect(guide.place.name).toBe("Museum 600");
      expect(guide.reward.xp).toBe(C.offerFor(guide.place, HERE, "guide", true).reward.xp * GUIDE_XP_X);
    }
  });

  it("deals a parcel: picked up close by, paid more at a work place farther off", () => {
    let seen = 0;
    for (let s = 0; s < 20; s++) {
      const p = C.deal(CITY, HERE, up(["map", "bike", "guide", "bag"], s)).find((c) => c.slot === "parcel");
      if (!p) continue;
      seen++;
      expect(p.kind).toBe("work");
      expect(p.to!.name).not.toBe(p.place.name);
      expect(p.distM).toBeGreaterThan(C.offerFor(p.place, HERE, "close", false).distM);
      const leg = C.offerFor(p.to!, [p.place.lat, p.place.lon], "far", false);
      expect(p.reward.cents).toBe(leg.reward.cents * PARCEL_PAY_X);
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("deals a metro ride from a station near him to a place far off", () => {
    const city = [...CITY, at("Central", "railway", 300, 1, "subway"), at("Far Park", "park", METRO_MIN_M + 500)];
    let ride: C.Offer | undefined;
    for (let s = 0; s < 20 && !ride; s++) ride = C.deal(city, HERE, up(["map", "bike", "guide", "bag", "scooter", "metro"], s)).find((c) => c.slot === "metro");
    expect(ride!.place.name).toBe("Central");
    expect(ride!.to!.name).toBe("Far Park");
    expect(ride!.reward).toEqual({ cents: 0, xp: 0 });
  });

  it("deals a train from a train station, and nothing it can't use", () => {
    const all = LADDER.map((u) => u.id);
    const city = [...CITY, at("Main Station", "railway", 700, 1, "station")];
    let train: C.Offer | undefined;
    for (let s = 0; s < 30 && !train; s++) train = C.deal(city, HERE, up(all, s)).find((c) => c.slot === "train");
    expect(train!.place.name).toBe("Main Station");
    // No stations: the cards from places are all there is.
    for (let s = 0; s < 10; s++) expect(slots(C.deal(CITY, HERE, up(all, s))).every((x) => !["metro", "train"].includes(x))).toBe(true);
  });

  it("reaches farther on a bike", () => {
    const city = [at("Cafe 100", "cafe", 100), at("Bar 2000", "bar", 2000), at("Bakery 1100", "bakery", -1100), at("Park 600", "park", 600), at("Museum 900", "museum", -900)];
    for (let s = 0; s < 20; s++) expect(names(C.deal(city, HERE, up([], s)))).not.toContain("Bar 2000");
    expect(Array.from({ length: 20 }, (_, s) => names(C.deal(city, HERE, up(["map", "bike"], s)))).flat()).toContain("Bar 2000");
  });
});

describe("the choice", () => {
  it("takes a card: it becomes where he goes and joins his recent picks", () => {
    const c = new C.Choice();
    c.offer = C.deal(CITY, HERE, ctx());
    const card = c.offer[1]!;
    expect(c.take(5)).toBeNull();
    expect(c.take(1)).toBe(card);
    expect(c.going).toBe(card);
    expect(c.offer).toEqual([]);
    expect(c.recent).toEqual([visitKey(card.place)]);
  });

  it("remembers only the last few picks", () => {
    const c = new C.Choice();
    for (let i = 0; i < C.RECENT + 3; i++) {
      c.offer = [C.offerFor(at(`Cafe ${i}`, "cafe", 100 + i), HERE, "close", false)];
      c.take(0);
    }
    expect(c.recent).toHaveLength(C.RECENT);
    expect(c.recent.at(-1)).toContain(`Cafe ${C.RECENT + 2}`);
  });

  it("survives a save, and an old save has none", () => {
    const c = new C.Choice();
    c.offer = C.deal(CITY, HERE, ctx());
    c.take(0);
    c.train = true;
    c.offer = C.deal(CITY, HERE, ctx(2));
    const back = C.Choice.fromJSON(JSON.parse(JSON.stringify(c)));
    expect(back).toEqual(c);
    expect(C.Choice.fromJSON(undefined)).toEqual(new C.Choice());
    expect(C.Choice.fromJSON({ recent: [1, "a"] }).recent).toEqual(["a"]);
    // A broken card in a save is dropped rather than drawn.
    expect(C.Choice.fromJSON({ offer: [{ place: { name: "x" } }, c.offer[0]], going: { reward: {} } })).toMatchObject({ offer: [c.offer[0]], going: null, train: false });
    expect(C.Choice.fromJSON({ offer: [{ ...c.offer[0], to: { name: "y" } }] }).offer).toEqual([]);
  });
});
