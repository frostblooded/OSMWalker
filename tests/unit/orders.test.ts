import { describe, expect, it } from "vitest";
import { moved } from "../../src/core/geo";
import * as O from "../../src/core/orders";
import { Rng } from "../../src/core/rng";
import { UPGRADES } from "../../src/core/upgrades";

const at = (east: number, north: number) => moved(42.7, 23.3, [east, north]);
const place = (name: string, cls: string, east: number, north: number) => {
  const [lat, lon] = at(east, north);
  return { name, class: cls, subclass: cls, rank: 1, lat, lon };
};
const home = (number: string, east: number, north: number) => {
  const [lat, lon] = at(east, north);
  return { street: "", number, lat, lon };
};

describe("orders", () => {
  it("pay a base fee plus a rate per km of the drop, and two of the shortest pay for the first upgrade", () => {
    expect(O.payOf(0)).toBe(O.BASE_CENTS);
    expect(O.payOf(1000)).toBe(Math.round((O.BASE_CENTS + O.CENTS_PER_KM * O.ROUTE_FACTOR) / 10) * 10);
    expect(O.payOf(1500)).toBeGreaterThan(O.payOf(500));
    expect(2 * O.payOf(O.DROP_MIN_M)).toBeGreaterThanOrEqual(UPGRADES[0]!.cents);
  });

  it("pick up at a food place near him and drop at a house number in the ring around it", () => {
    const places = [place("Bridge", "bridge", 10, 0), place("Pizza", "pizza", 50, 0), place("Far Cafe", "cafe", 20_000, 0)];
    const homes = [home("1", 60, 0), home("12", 800, 0), home("99", 5000, 0)];
    for (let seed = 1; seed < 20; seed++) {
      const o = O.makeOrder(new Rng(seed), at(0, 0), places, homes)!;
      expect(["Pizza", "Far Cafe"]).toContain(o.from.name);
      if (o.from.name === "Pizza") expect(o.to.number).toBe("12");
      expect(o.cents).toBe(O.payOf(o.dropM));
      expect(o.picked).toBe(false);
    }
  });

  it("use any place where nothing cooks, the nearest door past the ring's start when none is in it, and none with nothing loaded", () => {
    const o = O.makeOrder(new Rng(1), at(0, 0), [place("Bridge", "bridge", 10, 0)], [home("1", 50, 0), home("7", 3000, 0)])!;
    expect(o.from.name).toBe("Bridge");
    expect(o.to.number).toBe("7");
    expect(O.makeOrder(new Rng(1), at(0, 0), [], [home("1", 500, 0)])).toBeNull();
    expect(O.makeOrder(new Rng(1), at(0, 0), [place("Pizza", "pizza", 0, 0)], [])).toBeNull();
  });

  it("wait a fixed minute, shorter with upgrades, never under the floor", () => {
    expect(O.waitS()).toBe(O.ORDER_WAIT_S);
    expect(O.waitS(0.5)).toBe(O.ORDER_WAIT_S * 0.5);
    expect(O.waitS(0.01)).toBe(O.MIN_WAIT_S);
  });

  it("tell how much of the wait has passed", () => {
    const j = new O.Job();
    expect(j.waitShare()).toBe(0);
    j.startWait(40);
    j.waitLeftS = 10;
    expect(j.waitShare()).toBe(0.75);
    j.waitLeftS = -1;
    expect(j.waitShare()).toBe(1);
  });

  it("name the door by its street and number", () => {
    expect(O.addressOf({ street: "Vitosha", number: "12", lat: 0, lon: 0 })).toBe("Vitosha 12");
    expect(O.addressOf({ street: "", number: "12", lat: 0, lon: 0 })).toBe("No. 12");
    expect(O.addressOf({ street: "Vitosha", number: "", lat: 0, lon: 0 })).toBe("a door on Vitosha");
    expect(O.addressOf({ street: "", number: "", lat: 0, lon: 0 })).toBe("a door nearby");
  });

  it("keep the job through a save, dropping a broken order", () => {
    const j = new O.Job();
    j.order = O.makeOrder(new Rng(1), at(0, 0), [place("Pizza", "pizza", 0, 0)], [home("5", 400, 0)]);
    j.startWait(30);
    j.waitLeftS = 12;
    const back = O.Job.fromJSON(JSON.parse(JSON.stringify(j.toJSON())));
    expect(back.order).toEqual(j.order);
    expect(back.waitLeftS).toBe(12);
    expect(back.waitShare()).toBeCloseTo(0.6);
    // An old save has no full wait: it is at least what is left, so the bar never runs backwards.
    expect(O.Job.fromJSON({ wait_left_s: 90 }).waitShare()).toBe(0);
    expect(O.Job.fromJSON({ order: { from: 1 }, wait_left_s: -1 }).order).toBeNull();
    expect(O.Job.fromJSON(undefined).waitLeftS).toBe(O.ORDER_WAIT_S);
  });
});
