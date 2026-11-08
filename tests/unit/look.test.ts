// His look: the bubble names where he heads (the food place, or 🏠 the door), and the pop when he is paid takes its place.
import { describe, expect, it } from "vitest";
import { look, MONEY_POSE, placeIcon } from "../../src/core/look";

describe("look", () => {
  const cafe = { class: "cafe", subclass: "cafe" };

  it("riding: the goal's icon in the bubble, a house for the customer's door", () => {
    expect(look(cafe, null)).toEqual({ bubble: "☕", pose: null });
    expect(look({ class: "home", subclass: "" }, null).bubble).toBe("🏠");
  });

  it("no bubble while he wanders", () => {
    expect(look(null, null).bubble).toBe("");
  });

  it("when he is paid the pop takes the bubble's place", () => {
    expect(look(cafe, MONEY_POSE)).toEqual({ bubble: "", pose: MONEY_POSE });
  });

  it("finds icons by class and subclass, subclass, then class", () => {
    expect(placeIcon({ class: "shop", subclass: "newsagent" })).toBe("🗞");
    expect(placeIcon({ class: "bar", subclass: "nightclub" })).toBe("🪩");
    expect(placeIcon({ class: "museum", subclass: "" })).toBe("🏛");
    expect(placeIcon({ class: "nothing", subclass: "" })).toBe("📍");
  });
});
