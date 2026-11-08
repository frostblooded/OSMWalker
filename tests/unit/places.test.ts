import { describe, expect, it } from "vitest";
import * as P from "../../src/core/places";
import { Stats, xpToNext } from "../../src/core/stats";

describe("rewards", () => {
  const at5 = (cls: string, rank = 9) => P.rewardOf({ class: cls, rank }, 5, false);

  it("come from the kind of place and grow with the walk", () => {
    const w = 5 * (1 + 5 / P.FAR_EXTRA_MIN);
    expect(at5("cafe")).toEqual({ cents: Math.round((P.WORK_CENTS_PER_MIN * w) / 10) * 10, xp: 0 });
    expect(at5("museum")).toEqual({ cents: 0, xp: Math.round(P.SIGHT_XP_PER_MIN * w) });
    expect(at5("park")).toEqual({ cents: 0, xp: Math.round(P.GREEN_XP_PER_MIN * w) });
  });

  it("pay about the same per minute near and far, a little more for far", () => {
    const perMin = (min: number) => P.rewardOf({ class: "cafe", rank: 9 }, min, false).cents / min;
    expect(perMin(15)).toBeGreaterThan(perMin(3));
    expect(perMin(15) / perMin(3)).toBeLessThan(1.5);
    expect(perMin(P.FAR_EXTRA_MIN)).toBeCloseTo(2 * P.WORK_CENTS_PER_MIN, -1);
  });

  it("give landmarks more XP, and a first visit a bonus", () => {
    expect(at5("museum", 1).xp).toBe(Math.round(P.SIGHT_XP_PER_MIN * 5 * (1 + 5 / P.FAR_EXTRA_MIN) * P.LANDMARK_BONUS));
    expect(at5("park", 1)).toEqual(at5("park"));
    expect(P.rewardOf({ class: "park", rank: 9 }, 5, true).xp).toBe(at5("park").xp + P.NEW_PLACE_XP);
    expect(P.rewardOf({ class: "cafe", rank: 9 }, 5, true).xp).toBe(P.NEW_PLACE_XP);
  });

  it("are never nothing for a kind that pays, even next door", () => {
    expect(P.rewardOf({ class: "cafe", rank: 9 }, 0, false).cents).toBe(10);
    expect(P.rewardOf({ class: "park", rank: 9 }, 0, false).xp).toBe(1);
  });

  it("are nothing at a place of no kind, new or not", () => {
    expect(P.kindOf({ class: "car" })).toBeNull();
    expect(P.rewardOf({ class: "car", rank: 1 }, 10, true)).toEqual({ cents: 0, xp: 0 });
  });
});

describe("levels", () => {
  it("carry extra XP over several levels at once, each said in the feed", () => {
    const s = new Stats();
    s.addXp(xpToNext(1) + xpToNext(2) + 5);
    expect(s.level).toBe(3);
    expect(s.xp).toBe(5);
    expect(s.history.entries.map((e) => e.text)).toEqual(["Reached level 2", "Reached level 3"]);
  });

  it("are not reached a point short", () => {
    const s = new Stats();
    s.addXp(xpToNext(1) - 1);
    expect(s.level).toBe(1);
  });
});
