import { describe, expect, it } from "vitest";
import * as P from "../../src/core/places";
import { euro } from "../../src/core/money";
import { Stats, xpToNext } from "../../src/core/stats";
import { LADDER } from "../../src/core/upgrades";

describe("rewards", () => {
  const at5 = (cls: string, rank = 9) => P.rewardOf({ class: cls, rank }, 5, false);

  it("come from the kind of place and grow with the walk, each stop worth a few minutes more", () => {
    const w = 5 + P.STOP_MIN;
    expect(at5("cafe")).toEqual({ cents: Math.round((P.WORK_CENTS_PER_MIN * w) / 10) * 10, xp: 0 });
    expect(at5("museum")).toEqual({ cents: 0, xp: Math.round(P.SIGHT_XP_PER_MIN * w) });
    expect(at5("park")).toEqual({ cents: 0, xp: Math.round(P.GREEN_XP_PER_MIN * w) });
  });

  it("pay more per minute close by and more in all far off, so neither always wins", () => {
    const pay = (min: number) => P.rewardOf({ class: "cafe", rank: 9 }, min, false).cents;
    expect(pay(15)).toBeGreaterThan(pay(3));
    expect(pay(3) / 3).toBeGreaterThan(pay(15) / 15);
  });

  it("give landmarks more XP, and a first visit a bonus", () => {
    expect(at5("museum", 1).xp).toBe(Math.round(P.SIGHT_XP_PER_MIN * (5 + P.STOP_MIN) * P.LANDMARK_BONUS));
    expect(at5("park", 1)).toEqual(at5("park"));
    expect(P.rewardOf({ class: "park", rank: 9 }, 5, true).xp).toBe(at5("park").xp + P.NEW_PLACE_XP);
    expect(P.rewardOf({ class: "cafe", rank: 9 }, 5, true).xp).toBe(P.NEW_PLACE_XP);
  });

  it("are never nothing for a kind that pays, even next door", () => {
    expect(P.rewardOf({ class: "cafe", rank: 9 }, 0, false).cents).toBe(P.WORK_CENTS_PER_MIN * P.STOP_MIN);
    expect(P.rewardOf({ class: "park", rank: 9 }, 0, false).xp).toBe(P.GREEN_XP_PER_MIN * P.STOP_MIN);
  });

  it("are nothing at a place of no kind, new or not", () => {
    expect(P.kindOf({ class: "car" })).toBeNull();
    expect(P.rewardOf({ class: "car", rank: 1 }, 10, true)).toEqual({ cents: 0, xp: 0 });
  });
});

describe("levels", () => {
  it("carry extra XP over several levels at once, each said in the feed with the shop it opens for the next upgrade", () => {
    const s = new Stats();
    s.addXp(xpToNext(1) + xpToNext(2) + 5);
    expect(s.level).toBe(3);
    expect(s.xp).toBe(5);
    // No City map yet, so the bike shop isn't named: upgrades are bought in order.
    expect(s.history.entries.map((e) => e.text)).toEqual([`Reached level 2: a bookshop or newsagent now sells a 🗺 City map (${euro(LADDER[0]!.cents)})`, "Reached level 3"]);
    const t = new Stats();
    t.upgrades.add("map");
    t.addXp(xpToNext(1) + xpToNext(2));
    expect(t.history.latest()).toBe(`Reached level 3: a bike shop now sells a 🚲 Bike (${euro(LADDER[1]!.cents)})`);
  });

  it("are not reached a point short", () => {
    const s = new Stats();
    s.addXp(xpToNext(1) - 1);
    expect(s.level).toBe(1);
  });
});
