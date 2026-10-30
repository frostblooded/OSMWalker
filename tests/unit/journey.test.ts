import { describe, expect, it } from "vitest";
import { Rng } from "../../src/core/rng";
import { Stats, type Place } from "../../src/core/stats";
import { parseAirports, parseCities, type LatLon, type Plan } from "../../src/core/trips";
import { Trips } from "../../src/core/trips";
import { Journey, type Where } from "../../src/game/journey";

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

  it("plans a bus to another city of the country and says so", () => {
    const { j, stats } = journey(0.1);
    const plan = j.consider(where(), stats)!;
    expect(plan).toMatchObject({ mode: "bus", station: BUS, city: { name: "Nexttown" } });
    expect(stats.history.latest()).toContain("Heading to Central Bus for the bus to Nexttown");
    expect(j.takeLog()).toMatchObject({ outcome: "city", options: 1, chance: 1 });
  });

  it("saves up when the trip costs too much", () => {
    const { j, stats } = journey(0.1);
    stats.cents = 1;
    expect(j.consider(where(), stats)).toBeNull();
    expect(stats.savingFor).toBeGreaterThan(1);
    expect(j.takeLog().no_trip).toContain("can't afford the bus to Nexttown");
  });

  it("warns when a trip rolls but there is nowhere to go", () => {
    const { j, stats, problems } = journey(0.1);
    expect(j.consider(where({ city: "Farcity", country: "BBB", here: [10, 10] }), stats)).toBeNull();
    expect(problems[0]).toContain("no city to go to from Farcity");
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
