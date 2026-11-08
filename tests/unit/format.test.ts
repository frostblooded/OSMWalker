import { describe, expect, it } from "vitest";
import * as F from "../../src/ui/format";
import { WALK_MPS as WALK } from "../../src/core/walker";

describe("texts", () => {
  it("show distances", () => {
    expect(F.dist(850.4)).toBe("850 m");
    expect(F.dist(1234)).toBe("1.2 km");
  });

  it("show walking times at his speed", () => {
    expect(F.walkTime(20, WALK)).toBe("<1 min");
    expect(F.walkTime(1000, WALK)).toBe("~12 min");
    expect(F.walkTime(6000, WALK)).toBe("~1 h 12 min");
  });

  it("describe his street", () => {
    expect(F.streetLine("Vitosha")).toBe("Walking along Vitosha");
    expect(F.streetLine("")).toBe("Wandering along an unnamed path");
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
