import { describe, expect, it } from "vitest";
import { Activities } from "../../src/core/activities";
import * as C from "../../src/core/cityCheck";

const BUS = { name: "Central", class: "bus", subclass: "bus_station" };
const STOP = { name: "Stop", class: "bus", subclass: "bus_stop" };
const AIRPORT = { name: "Airport", class: "aerodrome", subclass: "international" };
const AIRBASE = { name: "Base", class: "aerodrome", subclass: "military" };
const GAS = { name: "Shell", class: "fuel", subclass: "fuel" };
const CHARGER = { name: "Charger", class: "fuel", subclass: "charging_station" };
const DEALER = { name: "Cars", class: "car", subclass: "car" };
const CAFE = { name: "Cafe", class: "cafe", subclass: "cafe" };
const acts = () => new Activities({ cafe: [{ name: "Wait tables", min: 5, earn: 20 }], _generic: [{ name: "Look around", min: 5 }] });
const titles = (places: object[]) => C.problems(C.summary(places, acts()), "Sofia").map((p) => p.title);

describe("city check", () => {
  it("knows the kinds of places", () => {
    expect(C.isBusStation(BUS)).toBe(true);
    expect(C.isBusStation(STOP)).toBe(false);
    expect(C.isAirport(AIRPORT)).toBe(true);
    expect(C.isAirport(AIRBASE)).toBe(false);
    expect(C.isGasStation(GAS)).toBe(true);
    expect(C.isGasStation(CHARGER)).toBe(false);
    expect(C.isCarDealer(DEALER)).toBe(true);
    expect(C.canEarnAt(CAFE, acts())).toBe(true);
    expect(C.canEarnAt(BUS, acts())).toBe(false);
  });

  it("counts each kind", () => {
    expect(C.summary([BUS, BUS, AIRPORT, GAS, DEALER, CAFE, STOP], acts())).toEqual({ bus: 2, airport: 1, gas: 1, dealer: 1, earn: 1 });
  });

  it("finds no problems in a city with everything", () => {
    expect(titles([BUS, GAS, CAFE])).toEqual([]);
  });

  it("keeps no way out and no work apart", () => {
    expect(titles([STOP])).toEqual(["Can't leave Sofia", "No gas station in Sofia", "No way to earn money in Sofia"]);
  });

  it("counts a bus station as a way out even without gas", () => {
    expect(titles([BUS, CAFE])).toEqual(["No gas station in Sofia"]);
  });
});
