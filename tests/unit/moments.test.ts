// Timed moments: the default he takes and how a mini-game score picks an option (src/core/moments.ts).
import { describe, expect, it } from "vitest";
import { defaultPick, LEAN_CAP, LEAN_PER_POINT, optionFor, scorePick, type Moment } from "../../src/core/moments";
import type { Rng } from "../../src/core/rng";
import { Stats } from "../../src/core/stats";

const fixed = (...rolls: number[]) => ({ randf: () => rolls.shift() ?? 0 }) as unknown as Rng;
const shop: Moment = {
  id: "shopkeeper", icon: "🛒", ask: "The shopkeeper looks bored.",
  options: [{ id: "chat", label: "Chat" }, { id: "haggle", label: "Haggle" }, { id: "browse", label: "Just browse" }],
  default: "browse",
};

describe("the default", () => {
  it("is the moment's own default when it leans on nothing", () => {
    expect(defaultPick(shop, new Stats(), fixed(0))).toBe("browse");
  });

  it("leans to the first option with the moment's attribute, never past the cap", () => {
    const m: Moment = { ...shop, lean: "cha" };
    const s = new Stats();
    expect(defaultPick(m, s, fixed(0.99))).toBe("browse");
    // At attribute 1 there is no lean: the roll must land under 0 to pick the first option.
    expect(defaultPick(m, s, fixed(0.01))).toBe("browse");
    s.attrs.cha = 1 + Math.ceil(LEAN_CAP / LEAN_PER_POINT) + 5;
    expect(defaultPick(m, s, fixed(LEAN_CAP - 0.01))).toBe("chat");
    expect(defaultPick(m, s, fixed(LEAN_CAP))).toBe("browse");
  });
});

describe("mini-game scores", () => {
  const game: Moment = { ...shop, game: "timing" };
  it("map 0..1 onto the options, worst to best", () => {
    expect(scorePick(game, 0)).toBe("chat");
    expect(scorePick(game, 0.5)).toBe("haggle");
    expect(scorePick(game, 1)).toBe("browse");
    expect(scorePick(game, 7)).toBe("browse");
    expect(scorePick(game, -1)).toBe("chat");
  });

  it("finds an option by id", () => {
    expect(optionFor(shop, "haggle").label).toBe("Haggle");
    expect(() => optionFor(shop, "nope")).toThrow();
  });
});
