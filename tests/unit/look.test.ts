// His look: the bubble names the kind of place he heads for, and a pop after a reward takes its place.
import { describe, expect, it } from "vitest";
import { look, MONEY_POSE, placeIcon, XP_POSE } from "../../src/core/look";

describe("look", () => {
  const cafe = { class: "cafe", subclass: "cafe" };

  it("walking: the goal's icon in the bubble", () => {
    expect(look(cafe, null)).toEqual({ bubble: "☕", pose: null });
  });

  it("no bubble on the way to a random spot", () => {
    expect(look(null, null).bubble).toBe("");
  });

  it("after a reward the pop takes the bubble's place", () => {
    expect(look(cafe, MONEY_POSE)).toEqual({ bubble: "", pose: MONEY_POSE });
    expect(look(null, XP_POSE).pose).toBe(XP_POSE);
  });

  it("finds icons by class and subclass, subclass, then class", () => {
    expect(placeIcon({ class: "shop", subclass: "newsagent" })).toBe("🗞");
    expect(placeIcon({ class: "bar", subclass: "nightclub" })).toBe("🪩");
    expect(placeIcon({ class: "museum", subclass: "" })).toBe("🏛");
    expect(placeIcon({ class: "nothing", subclass: "" })).toBe("📍");
  });
});
