// Getting across town to a trip's station: how, how long and what it costs.
import { describe, expect, it } from "vitest";
import { CAR, FOR_VEHICLE, METRO } from "../../src/core/speeds";
import { Stats } from "../../src/core/stats";
import { HOP_MAX_S, hopBy, hopFare, hopS, METRO_POP } from "../../src/core/trips";

describe("the ride to the station", () => {
  it("is his own vehicle, else the metro in a big city, else a taxi", () => {
    expect(hopBy("bike", 5_000_000)).toBe("bike");
    expect(hopBy("dragon", 0)).toBe("dragon");
    expect(hopBy("", METRO_POP)).toBe("metro");
    expect(hopBy("", METRO_POP - 1)).toBe("taxi");
  });

  it("takes the time the distance takes at its speed, at most HOP_MAX_S", () => {
    expect(hopS("taxi", 3000)).toBeCloseTo(3000 / CAR, 9);
    expect(hopS("metro", 3000)).toBeCloseTo(3000 / METRO, 9);
    expect(hopS("car", 3000)).toBeCloseTo(3000 / FOR_VEHICLE.car, 9);
    expect(hopS("taxi", 1_000_000)).toBe(HOP_MAX_S);
    expect(HOP_MAX_S).toBe(15 * 60);
  });

  it("costs a flat metro fare, a taxi by the km, and nothing on his own", () => {
    expect(hopFare("metro", 20_000)).toBe(200);
    expect(hopFare("taxi", 10_000)).toBe(1800);
    expect(hopFare("bike", 10_000)).toBe(0);
  });

  it("is paid only when he can still pay the ticket, with a History line", () => {
    const s = new Stats();
    s.cents = 3000;
    expect(s.hop("taxi", 10_000, "Sofia Airport", 1500)).toBe("");
    expect(s.cents).toBe(3000);
    expect(s.hop("taxi", 10_000, "Sofia Airport", 1000)).toBe("🚕 Took a taxi to Sofia Airport (-€18)");
    expect(s.cents).toBe(1200);
    expect(s.hop("metro", 10_000, "Central Station", 0)).toBe("🚇 Took the metro to Central Station (-€2)");
    expect(s.hop("car", 10_000, "Shell", 0)).toBe("🚗 Drove to Shell");
    expect(s.hop("broom", 10_000, "Sofia Airport", 0)).toBe("Flew his broom to Sofia Airport");
    expect(s.hop("bike", 10_000, "Sofia Airport", 0)).toBe("Rode his bike to Sofia Airport");
  });
});
