import { describe, expect, it } from "vitest";
import * as P from "../../src/core/places";
import { Stats, xpToNext } from "../../src/core/stats";

const at = (cls: string, name = "A") => ({ name, class: cls, subclass: "", rank: 1, lat: 42, lon: 23 });

describe("rewards", () => {
  it("come from the kind of place, with a bonus the first time", () => {
    expect(P.rewardOf(at("cafe"), false)).toEqual({ cents: P.WORK_CENTS, xp: 0 });
    expect(P.rewardOf(at("museum"), false)).toEqual({ cents: 0, xp: P.SIGHT_XP });
    expect(P.rewardOf(at("park"), true)).toEqual({ cents: 0, xp: P.GREEN_XP + P.NEW_PLACE_XP });
  });

  it("are nothing at a place of no kind, new or not", () => {
    expect(P.kindOf(at("car"))).toBeNull();
    expect(P.rewardOf(at("car"), true)).toEqual({ cents: 0, xp: 0 });
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
