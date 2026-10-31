import { describe, expect, it } from "vitest";
import { URGENT_AT } from "../../src/core/activities";
import { Rng } from "../../src/core/rng";
import * as Items from "../../src/core/items";
import { ON_THE_TRAIL, Stats, type Place } from "../../src/core/stats";
import { HITCH_BELOW, parseAirports, parseCities, type LatLon, type Plan } from "../../src/core/trips";
import { Trips } from "../../src/core/trips";
import { Journey, type Where } from "../../src/game/journey";

const NEAR = "Bigtown\tAAA\tA-land\t0.0\t0.0\t1000000\nNeartown\tAAA\tA-land\t0.2\t0.0\t500000\n";
const CITIES = "Bigtown\tAAA\tA-land\t0.0\t0.0\t1000000\nNexttown\tAAA\tA-land\t1.0\t0.0\t500000\nFarcity\tBBB\tB-land\t10.0\t10.0\t3000\n";
const AIRPORTS = "Big Intl\tBIG\tAA\t0.1\t0.1\nFar Field\tFAR\tBB\t10.05\t10.0\n";
const BUS: Place = { name: "Central Bus", class: "bus", subclass: "bus_station", rank: 5, lat: 0.01, lon: 0 };

const where = (o: Partial<Where> = {}): Where => ({ here: [0, 0], city: "Bigtown", country: "AAA", places: [BUS], noPlaces: false, ...o });

function journey(roll: number, route: (a: LatLon, b: LatLon) => Promise<LatLon[]> = async () => []) {
  const problems: string[] = [];
  const j = new Journey({ trips: new Trips(parseCities(CITIES), parseAirports(AIRPORTS)), rng: new Rng(1), roll: () => roll, route, problem: (t) => problems.push(t) });
  const stats = new Stats();
  stats.cents = 100_000;
  return { j, stats, problems };
}

describe("journey", () => {
  it("skips the dice on the first pick in a new city", () => {
    const { j, stats } = journey(0.1);
    j.skipRoll = true;
    expect(j.consider(where(), stats)).toBeNull();
    expect(j.skipRoll).toBe(false);
    expect(j.takeLog()).toEqual({ skipped: "first pick in a new city" });
    expect(j.takeLog()).toEqual({});
  });

  it("stays put while a need is urgent", () => {
    const { j, stats } = journey(0.1);
    stats.meters.energy = URGENT_AT - 1;
    expect(j.consider(where(), stats)).toBeNull();
    expect(j.takeLog()).toEqual({ skipped: "an urgent need comes first" });
    stats.meters.energy = URGENT_AT;
    expect(j.consider(where(), stats)).not.toBeNull();
  });

  it("stays on a high roll and notes the roll", () => {
    const { j, stats } = journey(0.99);
    expect(j.consider(where(), stats)).toBeNull();
    expect(j.takeLog()).toEqual({ roll: 0.99, boost: 1, outcome: "stay" });
  });

  it("doubles the odds where there are no places", () => {
    const { j, stats } = journey(0.2);
    j.consider(where({ noPlaces: true }), stats);
    expect(j.takeLog()).toMatchObject({ boost: 2, outcome: "city" });
  });

  it("leans abroad on the last day of his visa", () => {
    const { j, stats } = journey(0.05);
    j.consider(where(), stats);
    expect(j.takeLog()).toMatchObject({ outcome: "city" });
    stats.visas.enter("AAA");
    stats.visas.stay = 3;
    j.consider(where(), stats);
    expect(j.takeLog()).toMatchObject({ abroad: 4, outcome: "country" });
  });

  it("plans a bus to another city of the country and says so", () => {
    const { j, stats } = journey(0.1);
    const plan = j.consider(where(), stats)!;
    expect(plan).toMatchObject({ mode: "bus", station: BUS, city: { name: "Nexttown" } });
    expect(stats.history.latest()).toContain("Heading to Central Bus for the bus to Nexttown");
    expect(j.takeLog()).toMatchObject({ outcome: "city", options: 1, chance: 1 });
  });

  it("saves up when the trip costs too much", () => {
    const { j, stats } = journey(0);
    stats.cents = HITCH_BELOW;
    expect(j.consider(where(), stats)).toBeNull();
    expect(stats.savingFor).toBeGreaterThan(HITCH_BELOW);
    expect(j.takeLog().no_trip).toContain("can't afford the plane to Farcity");
  });

  it("cycles to a near town on his bike, and asks for the road", async () => {
    const asked: LatLon[][] = [];
    const j = new Journey({ trips: new Trips(parseCities(NEAR), parseAirports(AIRPORTS)), rng: new Rng(1), roll: () => 0.1, route: async (a, b) => (asked.push([a, b]), []), problem: () => {} });
    const stats = new Stats();
    stats.equip(Items.build(Items.KINDS.bicycles[0]!, Items.MATERIALS[0]!, []));
    expect(j.consider(where(), stats)).toMatchObject({ mode: "bike", fare: 0 });
    expect(stats.history.latest()).toBe("Setting off on his bike for Neartown");
    await Promise.resolve();
    expect(asked).toHaveLength(1);
  });

  it("on foot, now and then sets off on a long walk to a near town", () => {
    let plan: Plan | null = null;
    let stats = new Stats();
    let j: Journey | null = null;
    for (let seed = 1; seed < 60 && plan?.mode !== "walk"; seed++) {
      stats = new Stats();
      j = new Journey({ trips: new Trips(parseCities(NEAR), parseAirports(AIRPORTS)), rng: new Rng(seed), roll: () => 0.1, route: async () => [], problem: () => {} });
      plan = j.consider(where(), stats);
    }
    expect(plan?.mode).toBe("walk");
    expect(stats.history.latest()).toMatch(/^Setting off on foot for Neartown: a long walk/);
    const cents = stats.cents;
    expect(j!.board(plan!, stats)).toBe("");
    expect(stats.cents).toBeLessThanOrEqual(cents - plan!.fare);
    expect(plan!.fare).toBeGreaterThan(0);
    expect(stats.buffNames()).toContain(ON_THE_TRAIL);
  });

  it("asks for no road for a ferry, which sails straight", async () => {
    const asked: LatLon[][] = [];
    const ferry: Place = { ...BUS, name: "Harbour", class: "ferry_terminal", subclass: "ferry_terminal" };
    const stats = new Stats();
    stats.cents = 100_000;
    // The ferry draw comes from the journey's own dice, so find a seed that sails.
    let plan: Plan | null = null;
    for (let seed = 1; seed < 50 && plan?.mode !== "ferry"; seed++) {
      asked.length = 0;
      const j = new Journey({ trips: new Trips(parseCities(CITIES), parseAirports(AIRPORTS)), rng: new Rng(seed), roll: () => 0.1, route: async (a, b) => (asked.push([a, b]), []), problem: () => {} });
      plan = j.consider(where({ places: [BUS, ferry] }), stats);
    }
    expect(plan?.mode).toBe("ferry");
    await Promise.resolve();
    expect(asked).toHaveLength(0);
  });

  it("hitchhikes for free instead when broke", () => {
    const { j, stats } = journey(0.1);
    stats.cents = 1;
    const plan = j.consider(where(), stats)!;
    expect(plan).toMatchObject({ mode: "hitch", fare: 0 });
    expect(j.board(plan, stats)).toBe("");
    expect(stats.history.latest()).toBe("Hitchhiked to Nexttown, A-land");
  });

  it("warns when a trip rolls but there is nowhere to go", () => {
    const { j, stats, problems } = journey(0.1);
    expect(j.consider(where({ city: "Farcity", country: "BBB", here: [10, 10] }), stats)).toBeNull();
    expect(problems[0]).toContain("no city to go to from Farcity");
  });

  it("packs what he needs as he boards", () => {
    const { j, stats } = journey(0.1);
    stats.meters.fullness = 60;
    const plan = j.consider(where(), stats)!;
    expect(j.board(plan, stats)).toBe("");
    expect(stats.history.latest()).toMatch(/^Packed snacks for the trip/);
    expect(stats.buffNames()).toContain("Packed snacks");
  });

  it("pays the fare at the station and sets off", () => {
    const { j, stats } = journey(0.1);
    const plan = j.consider(where(), stats)!;
    expect(j.board(plan, stats)).toBe("");
    expect(stats.cents).toBe(100_000 - plan.fare);
    expect(stats.history.latest()).toContain("Took the bus to Nexttown, A-land from Central Bus");
  });

  it("stays and saves up when he spent the fare on the way", () => {
    const { j, stats } = journey(0.1);
    const plan = j.consider(where(), stats)!;
    stats.cents = 1;
    expect(j.board(plan, stats)).toContain("can't afford the bus");
    expect(stats.cents).toBe(1);
    expect(stats.savingFor).toBe(plan.fare);
  });

  it("gives the plan the road once it is known, while it is still the plan", async () => {
    const road: LatLon[] = [[0, 0], [0.5, 0.1], [1, 0]];
    const { j, stats } = journey(0.1, async () => road);
    const plan: Plan = j.consider(where(), stats)!;
    await Promise.resolve();
    await Promise.resolve();
    expect(plan.path).toEqual(road);
  });

  it("drops a late road for a plan that was given up", async () => {
    let answer: (p: LatLon[]) => void = () => {};
    const { j, stats } = journey(0.1, () => new Promise((ok) => (answer = ok)));
    const old = j.consider(where(), stats)!;
    j.consider(where(), stats);
    answer([[0, 0], [1, 0]]);
    await Promise.resolve();
    expect(old.path).toBeUndefined();
  });

  it("picks a city to land in at once for Debug", () => {
    const { j, stats } = journey(0.99);
    const dest = j.pickNow("country", where(), stats)!;
    expect(dest.name).toBe("Farcity");
    expect(stats.history.latest()).toBe("Set off for Farcity, B-land");
    expect(j.takeLog()).toMatchObject({ options: 1, chance: 1 });
  });
});
