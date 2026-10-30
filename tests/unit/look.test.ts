// His face, bubble and pose on the map, and the icon of every kind of place.
import { describe, expect, it } from "vitest";
import { NEED_AT } from "../../src/core/activities";
import { face, look, need, placeIcon, pose, SICK_AT } from "../../src/core/look";
import { DIRTY_AT, METERS, TIRED_ENERGY, type Action, type Meter } from "../../src/core/stats";
import { dataFile } from "../support/data";

const fine = (): Record<Meter, number> => ({ health: 100, energy: 100, fullness: 80, mood: 60, hygiene: 100, thirst: 80 });
const act = (a: Partial<Action>): Action => ({ name: "x", min: 1, ...a });

describe("face", () => {
  it("smiles when he is fine, beams when happy", () => {
    expect(face(fine())).toBe("🙂");
    expect(face({ ...fine(), mood: 90 })).toBe("😄");
  });

  it("shows the worst state first: sick, then tired, then dirty, then low", () => {
    const m = { ...fine(), health: SICK_AT - 1, energy: 0, hygiene: 0, mood: 0 };
    expect(face(m)).toBe("🤒");
    expect(face({ ...m, health: 100 })).toBe("😩");
    expect(face({ ...m, health: 100, energy: TIRED_ENERGY })).toBe("😖");
    expect(face({ ...m, health: 100, energy: 100, hygiene: DIRTY_AT })).toBe("😞");
  });
});

describe("need", () => {
  it("is empty while every meter is above NEED_AT", () => {
    expect(need(fine())).toBe("");
    expect(need({ ...fine(), fullness: NEED_AT })).toBe("");
  });

  it("shows the lowest meter under NEED_AT", () => {
    expect(need({ ...fine(), fullness: NEED_AT - 1 })).toBe("🍔");
    expect(need({ ...fine(), fullness: 20, thirst: 10 })).toBe("🥤");
  });

  it("has an icon for every meter", () => {
    for (const k of METERS) expect(need({ ...fine(), [k]: 0 })).not.toBe("");
  });
});

describe("placeIcon", () => {
  it("knows classes and class/subclass keys", () => {
    expect(placeIcon({ class: "cafe", subclass: "cafe" })).toBe("☕");
    expect(placeIcon({ class: "shop", subclass: "bakery" })).toBe("🥐");
    expect(placeIcon({ class: "bar", subclass: "nightclub" })).toBe("🪩");
  });

  it("falls back to a bag for shops and a pin for the rest", () => {
    expect(placeIcon({ class: "shop", subclass: "whatever" })).toBe("🛍");
    expect(placeIcon({ class: "nothing_known", subclass: "" })).toBe("📍");
  });

  it("has an icon for every kind of place with actions", () => {
    const keys = Object.keys(JSON.parse(dataFile("actions.json"))).filter((k) => !k.startsWith("_"));
    const missing = keys.filter((k) => {
      const [c, s = ""] = k.split("/");
      return placeIcon({ class: c!, subclass: s }) === "📍";
    });
    expect(missing).toEqual([]);
  });
});

describe("pose", () => {
  it("follows what the action does most", () => {
    expect(pose(act({ fx: { energy: 20, xp: 5 } }), "park")).toEqual({ icon: "💤", motion: "rise" });
    expect(pose(act({ fx: { energy: 20 } }), "cafe")).toEqual({ icon: "☕", motion: "rise" });
    expect(pose(act({ fx: { mood: 10, wit: 0.1 } }), "")).toEqual({ icon: "🎵", motion: "rise" });
    expect(pose(act({ fx: { wit: 0.3, xp: 20 } }), "")).toEqual({ icon: "💡", motion: "pop" });
    expect(pose(act({ fx: { xp: 5 } }), "")).toEqual({ icon: "✨", motion: "pop" });
  });

  it("shows coins for work and a bag for shopping", () => {
    expect(pose(act({ earn: 25, fx: { energy: -15 } }), "")).toEqual({ icon: "💶", motion: "rise" });
    expect(pose(act({ item: "weapons" }), "")).toEqual({ icon: "🛍", motion: "pop" });
    expect(pose(act({ sell: true }), "")).toEqual({ icon: "💶", motion: "rise" });
  });
});

describe("look", () => {
  const cafe = { class: "cafe", subclass: "cafe" };

  it("walking: a need wins over the goal's icon", () => {
    expect(look(fine(), cafe, null)).toEqual({ face: "🙂", bubble: "☕", pose: null });
    expect(look({ ...fine(), thirst: 5 }, cafe, null).bubble).toBe("🥤");
  });

  it("no bubble on the way to a random spot", () => {
    expect(look(fine(), null, null).bubble).toBe("");
  });

  it("staying: the pose takes the bubble's place", () => {
    const l = look(fine(), cafe, act({ fx: { energy: 20 } }));
    expect(l.bubble).toBe("");
    expect(l.pose).toEqual({ icon: "☕", motion: "rise" });
  });
});
