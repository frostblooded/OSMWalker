import { describe, expect, it } from "vitest";
import * as F from "../../src/ui/format";
import { offerFor } from "../../src/core/cards";
import { euro } from "../../src/core/money";
import type { Place } from "../../src/core/stats";
import { LADDER } from "../../src/core/upgrades";
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

describe("cards and the ladder", () => {
  const cafe: Place = { name: "Cafe Rila", class: "cafe", subclass: "cafe", rank: 1, lat: 42.69, lon: 23.32 };
  const bakery: Place = { ...cafe, name: "Bakery", class: "bakery", subclass: "bakery", lat: 42.7 };
  const station: Place = { ...cafe, name: "Serdika", class: "railway", subclass: "subway" };
  const card = offerFor(cafe, [42.69, 23.31], "close", false);

  it("say what each kind of card gives", () => {
    expect(F.cardText(card)).toEqual({ name: "☕ Cafe Rila", gets: F.rewardText(card.reward) });
    expect(F.cardText({ ...card, slot: "shop", upgrade: "bike" }).gets).toBe(`🚲 Buy a Bike · ${euro(LADDER[1]!.cents)}`);
    expect(F.cardText({ ...card, slot: "parcel", to: bakery }).name).toBe("📦 Cafe Rila → Bakery");
    expect(F.cardText({ ...card, place: station, slot: "metro", to: bakery }).gets).toBe("Ride to Bakery, 1.1 km off");
    expect(F.cardText({ ...card, place: station, slot: "train" })).toEqual({ name: "🚆 Serdika", gets: "Train to another city" });
    expect(F.cardText({ ...card, slot: "guide" }).gets).toMatch(/^📕 /);
  });
});
