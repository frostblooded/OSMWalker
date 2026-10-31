import { describe, expect, it } from "vitest";
import * as F from "../../src/ui/format";
import { WALK, BIKE } from "../../src/core/speeds";

describe("texts", () => {
  it("shares explored: whole percent, a decimal under 10, never 0 once he walked one", () => {
    expect(F.share(0, 2500)).toBe("0%");
    expect(F.share(1, 25_000)).toBe("0.1%");
    expect(F.share(37, 2500)).toBe("1.5%");
    expect(F.share(355, 2500)).toBe("14%");
    expect(F.share(2500, 2500)).toBe("100%");
    expect(F.share(3, 0)).toBe("0%");
  });

  it("say how long he was away", () => {
    expect(F.duration(45)).toBe("<1 min");
    expect(F.duration(25 * 60)).toBe("25 min");
    expect(F.duration(2 * 3600 + 5 * 60 + 20)).toBe("2 h 5 min");
    expect(F.duration(24 * 3600)).toBe("24 h");
    expect(F.duration(3 * 86400 + 3600)).toBe("3 days 1 h");
  });

  it("show distances", () => {
    expect(F.dist(850.4)).toBe("850 m");
    expect(F.dist(1234)).toBe("1.2 km");
  });

  it("show walking times at his speed", () => {
    expect(F.walkTime(20, WALK)).toBe("<1 min");
    expect(F.walkTime(1000, WALK)).toBe("~12 min");
    expect(F.walkTime(6000, WALK)).toBe("~1 h 12 min");
    expect(F.walkTime(1000, BIKE)).toBe("~4 min");
  });

  it("count down to the next move", () => {
    expect(F.countdown(60)).toBe("1:00");
    expect(F.countdown(59.2)).toBe("1:00");
    expect(F.countdown(0.5)).toBe("0:01");
    // clock: m:ss under an hour, then h:mm:ss.
    expect(F.clock(59.2)).toBe("1:00");
    expect(F.clock(3599.5)).toBe("1:00:00");
    expect(F.clock(3661)).toBe("1:01:01");
    expect(F.countdown(0)).toBe("0:00");
  });

  it("show speeds in km/h", () => {
    expect(F.speed(WALK)).toBe("5 km/h");
    expect(F.speed(BIKE * 1.1)).toBe("16.5 km/h");
  });

  it("describe his street", () => {
    expect(F.streetLine("Vitosha", false)).toBe("Walking along Vitosha");
    expect(F.streetLine("", false)).toBe("Wandering along an unnamed path");
    expect(F.streetLine("", true)).toBe("Stopped on an unnamed path");
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
