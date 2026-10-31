// The game's trips with real Sofia streets, fake servers and fixed dice: buses, trains, flights, walks, guesses and the city check.
import { kindOf } from "../../src/core/business";
import { describe, expect, it, vi } from "vitest";
import * as Items from "../../src/core/items";
import { ON_THE_TRAIL, type Place } from "../../src/core/stats";
import { cityBounds, HITCH_BELOW, LONG_WALK_MAX_S } from "../../src/core/trips";
import { EXTRAS } from "../../src/core/poiGen";
import { Game, MADE_CITIES, type GameDeps } from "../../src/game/game";
import { doing, facts, hud, look } from "../../src/game/hud";
import { START, CAFE, BUS, streets, game, run, tick } from "../support/game";

describe("game", () => {
  it("skips the trip dice on the first pick, then rolls", async () => {
    const { g } = game({ roll: 0.99 });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    run(g, 2);
    expect(g.debugLog.entries[0]!.skipped).toBe("first pick in a new city");
    g.debugNewGoal();
    expect(g.debugLog.entries.at(-1)).toMatchObject({ roll: 0.99, outcome: "stay", forced: "goal" });
  });

  it("lands jet-lagged after a flight across time zones", async () => {
    const { g } = game();
    await g.startCity("Sofia, Bulgaria", ...START, null);
    const paris = g.trips.cities.find((c) => c.name === "Paris")!;
    g.walker!.startTravel({ ...paris, bounds: cityBounds(paris) }, "plane");
    for (let i = 0; i < 3600 && g.walker!.isTraveling(); i++) g.step(1);
    expect(g.stats.history.entries.some((e) => e.text === "Jet-lagged after flying across 1 time zone")).toBe(true);
    expect(g.stats.buffNames()).toContain("Jet-lagged");
  });

  it("rides a night train with a berth and lands rested, shown as a train ride", async () => {
    const { g } = game();
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.meters.energy = 20;
    const paris = g.trips.cities.find((c) => c.name === "Paris")!;
    g.walker!.startTravel({ ...paris, bounds: cityBounds(paris) }, "train");
    g.step(1);
    expect(hud(g)).toMatchObject({ doing: "riding", ride: { mode: "train", to: "Paris" } });
    expect(doing(g)).toMatch(/^travelling to Paris by train, \d+ km left$/);
    for (let i = 0; i < 3600 && g.walker!.isTraveling(); i++) g.step(1);
    expect(g.stats.history.entries.some((e) => e.text === "Slept in a berth on the night train and woke up rested")).toBe(true);
    expect(g.stats.meters.energy).toBeGreaterThan(99);
  });

  it("walks to a near town on the zoomed-out map, fed by hostels, with no street downloads, and lands with the walk's reward", async () => {
    const sofia = streets();
    let asked = 0;
    const { g } = game({ load: (t, o) => (asked++, sofia.load(t, o)) });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    const vidin = g.trips.cities.find((c) => c.name === "Vidin")!;
    g.stats.cents = 10_000;
    g.stats.ride(4000, "walk", "the road out of town", "Vidin, Bulgaria");
    expect(g.stats.cents).toBe(6000);
    expect(g.stats.buffNames()).toContain(ON_THE_TRAIL);
    g.walker!.startTravel({ ...vidin, bounds: cityBounds(vidin) }, "walk");
    g.step(1);
    expect(hud(g)).toMatchObject({ doing: "walking", ride: { mode: "walk", to: "Vidin" } });
    expect(doing(g)).toMatch(/^travelling to Vidin on foot, \d+ km left$/);
    const askedBefore = asked;
    for (let i = 0; i < LONG_WALK_MAX_S - 60 && g.walker!.isTraveling(); i++) g.step(1);
    expect(asked).toBe(askedBefore);
    g.stats.meters.mood = 50;
    for (let i = 0; i < 3600 && g.walker!.isTraveling(); i++) g.step(1);
    expect(g.stats.history.entries.some((e) => /^Walked \d+ km to Vidin, Bulgaria/.test(e.text))).toBe(true);
    expect(g.stats.buffNames()).not.toContain(ON_THE_TRAIL);
    expect(g.stats.meters.mood).toBeGreaterThan(50);
  });

  it("lands fresh after a bus across the same time zones", async () => {
    const { g } = game();
    await g.startCity("Sofia, Bulgaria", ...START, null);
    const paris = g.trips.cities.find((c) => c.name === "Paris")!;
    g.walker!.startTravel({ ...paris, bounds: cityBounds(paris) }, "bus");
    for (let i = 0; i < 3600 && g.walker!.isTraveling(); i++) g.step(1);
    expect(g.stats.where.city).toBe("Paris, France");
    expect(g.stats.buffNames()).not.toContain("Jet-lagged");
  });

  it("doesn't set off on a trip while he is on a quest", async () => {
    const { g } = game({ roll: 0.1 });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.cents = 50_000;
    g.stats.meters.fullness = g.stats.meters.thirst = 100;
    g.skipRoll = false;
    const at = { name: "Cafe Near", class: "cafe", subclass: "cafe", lat: CAFE.lat, lon: CAFE.lon };
    g.stats.quests.active = { key: "q:Ana:0", kind: "q", giver: "Ana", item: 0, twist: -1, at, step: 0, target: at };
    g.debugNewGoal();
    expect(g.walker!.isDeparting()).toBe(false);
  });

  it("walks to the bus station for a trip, pays and rides", async () => {
    const { g } = game({ roll: 0.1 });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.cents = 50_000;
    // Full, so he packs nothing and pays only the fare.
    g.stats.meters.fullness = g.stats.meters.thirst = 100;
    g.skipRoll = false;
    g.debugNewGoal();
    const w = g.walker!;
    expect(w.isDeparting()).toBe(true);
    expect(w.departing!.station.name).toBe("Central Bus");
    expect(g.stats.history.latest()).toContain("Heading to Central Bus for the bus to somewhere in Bulgaria");
    const fare = w.departing!.fare;
    for (let i = 0; i < 600 && !w.isTraveling(); i++) g.step(1);
    expect(w.isTraveling()).toBe(true);
    // With money to spare, his first morning may buy a business (see business.ts).
    const invested = g.stats.business.owned.reduce((sum, o) => sum + kindOf(o.id)!.cents, 0);
    expect(g.stats.cents).toBe(50_000 - fare - invested);
    expect(g.stats.history.entries.some((e) => e.text.startsWith("Took the bus to Plovdiv"))).toBe(true);
  });

  it("lets you guess where he is going until he boards, and pays a clover for a right guess", async () => {
    const { g } = game({ roll: 0.1 });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.cents = 50_000;
    g.skipRoll = false;
    g.debugNewGoal();
    const guess = g.stats.care.guess!;
    expect(guess.abroad).toBe(false);
    expect([...guess.choices].sort()).toEqual(["Plovdiv", "Vidin"]);
    g.pickGuess("Plovdiv");
    g.pickGuess("Vidin");
    expect(guess.pick).toBe("Plovdiv");
    for (let i = 0; i < 600 && !g.walker!.isTraveling(); i++) g.step(1);
    expect(g.stats.care.clovers).toBe(1);
    expect(g.stats.care.guess).toBeNull();
    expect(g.stats.history.entries.some((e) => e.text === "You guessed it: Plovdiv! (+1 ☘)")).toBe(true);
  });

  it("drops the guess when the trip is called off, and he goes on without one", async () => {
    const { g } = game({ roll: 0.1 });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.cents = 50_000;
    g.skipRoll = false;
    g.debugNewGoal();
    expect(g.stats.care.guess).not.toBeNull();
    g.walker!.departing = null;
    g.step(1);
    expect(g.stats.care.guess).toBeNull();
  });

  it("drops the guess, with no clover, when he can't pay at the station", async () => {
    const { g } = game({ roll: 0.1 });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.cents = 50_000;
    g.skipRoll = false;
    g.debugNewGoal();
    g.pickGuess("Plovdiv");
    expect(g.stats.care.guess!.pick).toBe("Plovdiv");
    g.stats.cents = 0;
    // Stops at the station: broke, his next pick may send him hitchhiking instead.
    const stuck = () => g.stats.history.entries.some((e) => e.text.startsWith("Can't afford"));
    for (let i = 0; i < 600 && !stuck(); i++) g.step(1);
    expect(g.stats.history.entries.some((e) => e.text.startsWith("Took the bus"))).toBe(false);
    expect(g.stats.history.entries.some((e) => e.text.startsWith("Can't afford the bus to Plovdiv"))).toBe(true);
    expect(g.stats.care.guess).toBeNull();
    expect(g.stats.care.clovers).toBe(0);
    expect(g.stats.history.entries.some((e) => /guessed it|^Not /.test(e.text))).toBe(false);
  });

  it("saves up when he can't afford a trip", async () => {
    const { g } = game({ roll: 0 });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.cents = HITCH_BELOW;
    g.skipRoll = false;
    g.debugNewGoal();
    expect(g.walker!.isDeparting()).toBe(false);
    expect(g.stats.savingFor).toBeGreaterThan(HITCH_BELOW);
    expect(g.debugLog.entries.at(-1)!.no_trip).toContain("can't afford the plane to Paris");
  });

  it("hitchhikes for free when broke, and lands with a story", async () => {
    const { g } = game({ roll: 0.1 });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.cents = 1;
    g.skipRoll = false;
    g.debugNewGoal();
    expect(g.walker!.departing!.mode).toBe("hitch");
    expect(g.stats.history.latest()).toBe("Broke, so he sticks his thumb out to hitchhike to somewhere in Bulgaria");
    for (let i = 0; i < 3600 && !g.stats.where.city.startsWith("Plovdiv"); i++) g.step(1);
    const lines = g.stats.history.entries.map((e) => e.text);
    expect(lines).toContain("Hitchhiked to Plovdiv, Bulgaria");
    expect(lines.some((l) => /driver|lift/.test(l))).toBe(true);
    expect(g.stats.cents).toBe(1);
  });

  it("lands in another country on the debug button, with a fresh graph", async () => {
    const { g } = game();
    await g.startCity("Sofia, Bulgaria", ...START, null);
    const old = g.walker!.graph;
    g.debugTrip("country");
    expect(g.city).toBe("Paris, France");
    expect(g.country).toBe("FRA");
    expect(g.walker!.graph).not.toBe(old);
    expect(g.loader.graph).toBe(g.walker!.graph);
    expect(g.debugLog.entries.at(-1)).toMatchObject({ forced: "country", trip: "Paris, France" });
  });

  it("shows last week's recap once: closing the away sheet marks it seen", async () => {
    const { g } = game({ places: [CAFE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.week.roll(1, 0, 1, 0);
    g.stats.week.stop("cafe");
    g.stats.week.roll(8 * 86400, 0, 1, 0);
    expect(g.stats.week.pending()).not.toBeNull();
    g.dismissAway();
    expect(g.stats.week.pending()).toBeNull();
  });

  it("wakes in hospital after fainting", async () => {
    const hospital: Place = { name: "St Anna", class: "hospital", subclass: "hospital", rank: 1, lat: 42.688, lon: 23.316 };
    const { g } = game({ places: [hospital, CAFE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.meters.health = 0;
    g.doing = { name: "Nap on a bench", min: 1, fx: { energy: 20 } };
    const coins = g.stats.cents;
    g.step(1);
    expect(g.walker!.place).toEqual(hospital);
    expect(g.walker!.isResting()).toBe(true);
    expect(g.stats.cents).toBeLessThan(coins);
    // He rests at the hospital, but did nothing there to strike a pose for.
    expect(g.doing).toBeNull();
    expect(look(g).pose).toBeNull();
  });

  it("on a broomstick he flies to a park near a far goal, then walks the rest at walking pace", async () => {
    const far: Place = { ...CAFE, name: "Far Cafe", lat: 42.687, lon: 23.33 };
    const park: Place = { name: "Little Park", class: "park", subclass: "park", rank: 1, lat: 42.687, lon: 23.3292 };
    const { g } = game({ places: [far, park] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.equip(Items.build(Items.KINDS.brooms[0]!, Items.MATERIALS[0]!, []));
    await tick();
    const w = g.walker!;
    for (let i = 0; i < 60 && !w.flight; i++) run(g, 1);
    expect(w.flight).not.toBeNull();
    expect(w.flies).toBe(true);
    for (let i = 0; i < 600 && w.flight; i++) run(g, 1);
    expect(w.flight).toBeNull();
    expect(w.afoot).toBe(true);
    run(g, 1);
    expect(w.speedMps).toBeCloseTo(g.stats.speedMps(true), 6);
    expect(w.speedMps).toBeLessThan(g.stats.speedMps() / 2);
  });

  it("a dragon he can't feed sulks: it doesn't show at his side and he walks", async () => {
    const { g } = game();
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.equip(Items.build(Items.KINDS.dragons[0]!, Items.MATERIALS[0]!, []));
    g.stats.cents = 0;
    await tick();
    run(g, 1);
    expect(look(g).mount).toBe("");
    expect(g.walker!.flies).toBe(false);
    g.stats.cents = 100_000;
    run(g, 1);
    expect(look(g).mount).toBe("🐉");
    expect(g.walker!.flies).toBe(true);
  });

  it("once he has saved up, he heads for a bike shop over nearer places and rides off on a bike", async () => {
    const shop: Place = { name: "Velo", class: "bicycle", subclass: "bicycle", rank: 1, lat: 42.6875, lon: 23.3135 };
    const near = Array.from({ length: 10 }, (_, i): Place => ({ ...CAFE, name: `Cafe ${i}`, lat: 42.687 + i * 0.0003, lon: 23.3195 }));
    const { g } = game({ places: [...near, shop] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.cents = 100_000;
    for (let i = 0; i < 30 * 60 && !g.stats.vehicle(); i += 10) {
      run(g, 10);
      await tick();
    }
    expect(g.stats.vehicle()).toBe("bike");
    expect(g.stats.vehicleGoal()!.name).toBe("Scooter");
  });

  it("makes up the must-haves a city lacks once the area is loaded, and keeps them in the save", async () => {
    const { g, storage } = game({ places: [CAFE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    await tick();
    for (let i = 0; i < 5; i++) {
      run(g, 1);
      await tick();
    }
    expect(g.severeNow).toEqual([]);
    expect(g.problems.severe).toEqual([]);
    const made = g.walker!.graph.placesIn(g.walker!.bounds!).filter((p) => p.made);
    // The cafe feeds him and pays; Sofia is capital-sized, so it gets the most extras.
    expect(made.filter((p) => p.must).map((p) => p.subclass)).toEqual(["bus_station", "fuel", "guest_house"]);
    expect(made.filter((p) => p.extra)).toHaveLength(EXTRAS.capital);
    g.save();
    const back = new Game({ ...(g as unknown as { deps: GameDeps }).deps, storage });
    back.problems.quiet = true;
    expect(back.load()).toBe(true);
    expect(back.made["Sofia, Bulgaria"]).toEqual(g.made["Sofia, Bulgaria"]);
  });

  it("keeps the made-up places of the cities he was in most recently", async () => {
    for (const before of [["Sofia, Bulgaria"], []]) {
      const { g } = game({ places: [CAFE] });
      for (const c of before) g.made[c] = [];
      for (let i = 1; Object.keys(g.made).length < MADE_CITIES; i++) g.made[`Town ${i}`] = [];
      await g.startCity("Sofia, Bulgaria", ...START, null);
      for (let i = 0; i < 5; i++) {
        run(g, 1);
        await tick();
      }
      // A city he is back in moves to the end; a new one pushes out the one he left longest ago.
      expect(Object.keys(g.made).at(-1)).toBe("Sofia, Bulgaria");
      expect(Object.keys(g.made)).toHaveLength(MADE_CITIES);
      expect("Town 1" in g.made).toBe(before.length > 0);
    }
  });

  it("still checks the city when its made-up places can't load", async () => {
    vi.resetModules();
    vi.doMock("../../src/core/poiGen", () => {
      throw new Error("offline");
    });
    try {
      const { g } = game({ places: [CAFE] });
      await g.startCity("Sofia, Bulgaria", ...START, null);
      for (let i = 0; i < 30 && !g.severeNow.length; i++) {
        run(g, 1);
        await tick();
      }
      expect(g.made).toEqual({});
      expect(g.severeNow.map((p) => p.title)).toContain("Can't leave Sofia, Bulgaria");
    } finally {
      vi.doUnmock("../../src/core/poiGen");
    }
  });

  it("flags a city with no way out once the area is loaded", async () => {
    const { g } = game({ places: [CAFE] });
    g.made["Sofia, Bulgaria"] = [];
    await g.startCity("Sofia, Bulgaria", ...START, null);
    await tick();
    for (let i = 0; i < 5; i++) {
      run(g, 1);
      await tick();
    }
    expect(g.areaLoaded()).toBe(true);
    expect(g.severeNow.map((p) => p.title)).toContain("Can't leave Sofia, Bulgaria");
    expect(g.problems.severe[0]!.details.at(-1)).toContain("0 bus stations");
  });

  it("lists what looks wrong with the city for Debug", async () => {
    const { g } = game({ places: [] });
    g.made["Sofia, Bulgaria"] = [];
    await g.startCity("Sofia, Bulgaria", ...START, null);
    for (let i = 0; i < 5; i++) {
      run(g, 1);
      await tick();
    }
    const alerts = g.cityAlerts();
    expect(alerts.filter((a) => a.level === "error").map((a) => a.text)).toContain("⛔ Can't leave Sofia, Bulgaria");
    expect(alerts.map((a) => a.text)).toContain("No places of note in the city box: he walks to random spots");
    expect(alerts.map((a) => a.text)).toContain("No trivia for this city");
    expect(alerts[0]!.level).toBe("error");
  });

  it("has no alerts for a fine city", async () => {
    const { g } = game({ places: [CAFE, BUS, { ...BUS, name: "Fuel", class: "fuel", subclass: "fuel" }] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    for (let i = 0; i < 5; i++) {
      run(g, 1);
      await tick();
    }
    expect(g.cityAlerts().filter((a) => a.text !== "No trivia for this city")).toEqual([]);
  });

  it("tells listeners about changes", async () => {
    const { g } = game();
    let n = 0;
    g.subscribe(() => n++);
    await g.startCity("Sofia, Bulgaria", ...START, null);
    expect(n).toBeGreaterThan(0);
  });

  it("sums up what he is doing for the top card and Debug", async () => {
    const { g } = game({ places: [CAFE] });
    expect(hud(g)).toBeNull();
    expect(doing(g)).toBe("not started");
    await g.startCity("Sofia, Bulgaria", ...START, null);
    run(g, 2);
    const h = hud(g)!;
    expect(h).toMatchObject({ doing: "walking", city: "Sofia", ride: null, restShare: null, waiting: "" });
    expect(h.goal).toMatchObject({ kind: "going", name: "Cafe Near", departing: false });
    if (h.goal?.kind !== "going") throw new Error("not going");
    expect(h.goal.distM).toBeGreaterThan(0);
    expect(h.goal.walkLeftM).toBeGreaterThanOrEqual(h.goal.distM - 1);
    expect(doing(g)).toMatch(/^heading for Cafe Near \d+ m away/);
    const f = facts(g)!;
    expect(f.placesInBox).toBe(1);
    expect(f.boxKm![0]).toBeGreaterThan(2);
  });

  it("shows the rest left while he stays at a place", async () => {
    const { g } = game({ places: [CAFE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    for (let i = 0; i < 600 && !g.walker!.isResting(); i++) g.step(1);
    g.step(1);
    const h = hud(g)!;
    expect(h.doing).toBe("resting");
    expect(h.goal).toMatchObject({ kind: "resting", name: "Cafe Near" });
    expect(h.restShare).toBeGreaterThan(0);
  });

  it("shows the ride while he travels", async () => {
    const { g } = game({ roll: 0.1 });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.cents = 50_000;
    g.skipRoll = false;
    g.debugNewGoal();
    for (let i = 0; i < 600 && !g.walker!.isTraveling(); i++) g.step(1);
    expect(hud(g)).toMatchObject({ doing: "riding", ride: { mode: "bus", to: "Plovdiv" }, goal: null });
    expect(doing(g)).toMatch(/^travelling to Plovdiv by bus, \d+ km left$/);
  });
});
