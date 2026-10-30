// Which soundscape plays: by the kind of place he stays at, the street while he walks, none on a trip.
import { describe, expect, it } from "vitest";
import { soundscape } from "../../src/core/soundscape";

describe("soundscape", () => {
  it("is cafe chatter at places to eat and drink", () => {
    for (const c of ["cafe", "restaurant", "bar", "beer", "fast_food", "bakery", "ice_cream"]) expect(soundscape(c, true, false)).toBe("cafe");
  });

  it("is birdsong in parks and gardens", () => {
    for (const c of ["park", "garden", "playground", "picnic_site", "cemetery"]) expect(soundscape(c, true, false)).toBe("park");
  });

  it("is the street while he walks or stays anywhere else", () => {
    expect(soundscape("cafe", false, false)).toBe("street");
    expect(soundscape(null, false, false)).toBe("street");
    expect(soundscape("museum", true, false)).toBe("street");
  });

  it("is quiet on a trip", () => {
    expect(soundscape("cafe", true, true)).toBe("");
  });
});
