import { describe, expect, it } from "vitest";
import * as F from "../../src/ui/format";
import { BIKE_MPS } from "../../src/core/walker";

describe("texts", () => {
  it("show distances", () => {
    expect(F.dist(850.4)).toBe("850 m");
    expect(F.dist(1234)).toBe("1.2 km");
  });

  it("show riding times at his speed", () => {
    expect(F.rideTime(20, BIKE_MPS)).toBe("<1 min");
    expect(F.rideTime(3000, BIKE_MPS)).toBe("~4 min");
    expect(F.rideTime(60_000, BIKE_MPS)).toBe("~1 h 20 min");
  });

  it("describe his street", () => {
    expect(F.streetLine("Vitosha")).toBe("Riding along Vitosha");
    expect(F.streetLine("")).toBe("Riding along an unnamed path");
  });

  it("only unlock reset on the exact word", () => {
    expect(F.isResetWord(" RESET ")).toBe(true);
    expect(F.isResetWord("reset")).toBe(false);
  });

  it("split typed text from the suggestion", () => {
    expect(F.typedSplit("Sofia, Bulgaria", "sof")).toEqual(["Sof", "ia, Bulgaria"]);
    expect(F.typedSplit("Plovdiv", "sof")).toEqual(["", "Plovdiv"]);
  });
});
