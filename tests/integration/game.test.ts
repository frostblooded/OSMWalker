// The game loop with real Sofia streets, fake servers and fixed dice.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { distanceM, type Tile } from "../../src/core/geo";
import { cellKey, type Cell } from "../../src/core/graph";
import { fromPbf } from "../../src/core/ofm";
import { Rng } from "../../src/core/rng";
import type { Place } from "../../src/core/stats";
import { parseAirports, parseCities } from "../../src/core/trips";
import { Game, SAVE_KEY, type GameDeps } from "../../src/game/game";
import { doing, facts, hud } from "../../src/game/hud";
import { Api } from "../../src/net/api";
import type { LoadFn } from "../../src/streets/client";
import { dataFile } from "../support/data";

const WEST: Tile = { x: 9253, y: 6039 };
const START: [number, number] = [42.687, 23.319];
const CAFE: Place = { name: "Cafe Near", class: "cafe", subclass: "cafe", rank: 1, lat: 42.6885, lon: 23.3215 };
const BUS: Place = { name: "Central Bus", class: "bus", subclass: "bus_station", rank: 1, lat: 42.6862, lon: 23.3172 };
const CITIES = "Sofia\tBGR\tBulgaria\t42.6975\t23.3241\t1200000\nPlovdiv\tBGR\tBulgaria\t42.15\t24.75\t340000\nParis\tFRA\tFrance\t48.85\t2.35\t2100000\n";

const pbf = (t: Tile) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../fixtures/ofm/14_${t.x}_${t.y}.pbf`, import.meta.url))));
const empty = (): Cell => ({ ids: new Float64Array(), coords: new Float64Array(), ways: [], places: [] });

/** Real streets for the two Sofia tiles, nothing elsewhere. */
function streets(places: Place[] = [CAFE, BUS], fail = false): { load: LoadFn; asked: Tile[] } {
  const asked: Tile[] = [];
  const load: LoadFn = async (tile) => {
    asked.push(tile);
    if (fail) return { error: "HTTP 503 (server overloaded)" };
    if (tile.y === 6039 && (tile.x === 9253 || tile.x === 9254)) {
      const cell = fromPbf(pbf(tile), tile);
      return { cell: { ...cell, places: tile.x === 9253 ? places : [] }, from: "tile", stale: false };
    }
    return { cell: empty(), from: "tile", stale: false };
  };
  return { load, asked };
}

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

function game(opts: Partial<GameDeps> & { places?: Place[]; fail?: boolean; roll?: number } = {}) {
  const api = new Api(async () => new Response("", { status: 503 }));
  const data = {
    actions: JSON.parse(dataFile("actions.json")),
    flavour: {},
    cities: parseCities(CITIES),
    airports: parseAirports("Sofia Airport\tSOF\tBG\t42.6967\t23.4114\nParis Airport\tCDG\tFR\t49.0097\t2.5479\n"),
  };
  const storage = new MemStorage();
  const g = new Game({ api, load: streets(opts.places, opts.fail).load, data, storage, rng: new Rng(3), rollSource: () => opts.roll ?? 0.99, hour: () => 12, ...opts });
  g.problems.quiet = true;
  return { g, storage };
}

/** Steps a second at a time. */
function run(g: Game, seconds: number): void {
  for (let i = 0; i < seconds; i++) g.step(1);
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("game", () => {
  it("starts walking in a city once the streets there load", async () => {
    const { g } = game();
    expect(await g.startCity("Sofia, Bulgaria", ...START, null)).toBe("");
    expect(g.walker).not.toBeNull();
    expect(g.country).toBe("BGR");
    expect(g.walker!.graph.cells.has(cellKey(WEST))).toBe(true);
    await tick();
    run(g, 30);
    expect(g.walker!.totalM).toBeCloseTo(30 * (5 / 3.6), 3); // 5 km/h on foot
  });

  it("says when the streets can't load", async () => {
    const { g } = game({ fail: true });
    expect(await g.startCity("Sofia, Bulgaria", ...START, null)).toBe("Couldn't load streets. Check your connection and try again.");
    expect(g.problems.warnings.map((w) => w.text)).toContain("Couldn't load the streets where he starts in Sofia, Bulgaria");
  });

  it("walks to a place, does something there and rests", async () => {
    const { g } = game({ places: [CAFE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    run(g, 400);
    expect(g.stats.visited.size).toBeGreaterThan(0);
    expect(g.stats.history.entries.some((e) => e.text.startsWith("Reached Cafe Near"))).toBe(true);
    expect(g.debugLog.entries.some((e) => e.place === "Cafe Near")).toBe(true);
  });

  it("keeps the walk across a save", async () => {
    const { g, storage } = game();
    await g.startCity("Sofia, Bulgaria", ...START, null);
    run(g, 20);
    g.save();
    const again = new Game({ ...(g as unknown as { deps: GameDeps }).deps, storage });
    again.problems.quiet = true;
    expect(again.load()).toBe(true);
    expect(again.city).toBe("Sofia, Bulgaria");
    expect(again.walker!.totalM).toBeCloseTo(g.walker!.totalM, 6);
    expect(again.walker!.position()[0]).toBeCloseTo(g.walker!.position()[0], 9);
    expect(again.stats.history.entries.length).toBe(g.stats.history.entries.length);
  });

  it("starts with the route line off and remembers the switch", () => {
    const { g, storage } = game();
    expect(g.showRoute).toBe(false);
    g.setShowRoute(true);
    const again = new Game({ ...(g as unknown as { deps: GameDeps }).deps, storage });
    expect(again.showRoute).toBe(true);
  });

  it("starts with the camera following him and remembers the switch", () => {
    const { g, storage } = game();
    expect(g.cameraFollows).toBe(true);
    g.setCameraFollows(false);
    const again = new Game({ ...(g as unknown as { deps: GameDeps }).deps, storage });
    expect(again.cameraFollows).toBe(false);
  });

  it("starts over on reset but keeps the problem log", async () => {
    const { g, storage } = game();
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.problems.warn("kept");
    g.save();
    g.reset();
    expect(g.walker).toBeNull();
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    const again = new Game({ ...(g as unknown as { deps: GameDeps }).deps, storage });
    expect(again.load()).toBe(false);
    expect(again.problems.warnings.map((w) => w.text)).toContain("kept");
  });

  it("skips the trip dice on the first pick, then rolls", async () => {
    const { g } = game({ roll: 0.99 });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    run(g, 2);
    expect(g.debugLog.entries[0]!.skipped).toBe("first pick in a new city");
    g.debugNewGoal();
    expect(g.debugLog.entries.at(-1)).toMatchObject({ roll: 0.99, outcome: "stay", forced: "goal" });
  });

  it("walks to the bus station for a trip, pays and rides", async () => {
    const { g } = game({ roll: 0.1 });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.cents = 50_000;
    g.skipRoll = false;
    g.debugNewGoal();
    const w = g.walker!;
    expect(w.isDeparting()).toBe(true);
    expect(w.departing!.station.name).toBe("Central Bus");
    expect(g.stats.history.latest()).toContain("Heading to Central Bus for the bus to Plovdiv");
    const fare = w.departing!.fare;
    for (let i = 0; i < 600 && !w.isTraveling(); i++) g.step(1);
    expect(w.isTraveling()).toBe(true);
    expect(g.stats.cents).toBe(50_000 - fare);
    expect(g.stats.history.entries.some((e) => e.text.startsWith("Took the bus to Plovdiv"))).toBe(true);
  });

  it("saves up when he can't afford a trip", async () => {
    const { g } = game({ roll: 0.1 });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.cents = 1;
    g.skipRoll = false;
    g.debugNewGoal();
    expect(g.walker!.isDeparting()).toBe(false);
    expect(g.stats.savingFor).toBeGreaterThan(1);
    expect(g.debugLog.entries.at(-1)!.no_trip).toContain("can't afford the bus to Plovdiv");
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

  it("wakes in hospital after fainting", async () => {
    const hospital: Place = { name: "St Anna", class: "hospital", subclass: "hospital", rank: 1, lat: 42.688, lon: 23.316 };
    const { g } = game({ places: [hospital, CAFE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.meters.health = 0;
    const coins = g.stats.cents;
    g.step(1);
    expect(g.walker!.place).toEqual(hospital);
    expect(g.walker!.isResting()).toBe(true);
    expect(g.stats.cents).toBeLessThan(coins);
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

  it("flags a city with no way out once the area is loaded", async () => {
    const { g } = game({ places: [CAFE] });
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

  describe("catch-up", () => {
    const HOUR = 3600_000;
    /** A game saved `agoMs` before a reopen, and the reopened game. */
    async function reopen(agoMs: number, o: Partial<GameDeps> & { places?: Place[]; roll?: number } = {}, before: (g: Game) => void = () => {}) {
      let now = Date.UTC(2026, 9, 29, 8);
      const { g, storage } = game({ ...o, clock: () => now });
      await g.startCity("Sofia, Bulgaria", ...START, null);
      before(g);
      g.save();
      now += agoMs;
      const again = new Game({ ...(g as unknown as { deps: GameDeps }).deps, storage });
      again.problems.quiet = true;
      again.load();
      await again.wake();
      return { g, again, setNow: (t: number) => (now = t), now: () => now };
    }

    it("lets the time away pass on reopen, without walking the map", async () => {
      const { again } = await reopen(2 * HOUR);
      const s = again.away!;
      expect(s.coveredS).toBe(7200);
      expect(s.stops).toBeGreaterThan(3);
      expect(again.stats.history.entries.some((e) => e.text.startsWith("Reached Cafe Near"))).toBe(true);
      expect(again.city).toBe("Sofia, Bulgaria");
      // He stands where the catch-up left him, on the nearest loaded corner.
      const [lat, lon] = again.walker!.position();
      expect(distanceM(lat, lon, s.end.at[0], s.end.at[1])).toBeLessThan(100);
      expect(again.walker!.goal).toBeNull();
      run(again, 30);
      expect(again.walker!.totalM).toBeGreaterThan(0);
    });

    it("has nothing to catch up after a short break or from an old save", async () => {
      expect((await reopen(30_000)).again.away).toBeNull();
      const { g, storage } = game();
      await g.startCity("Sofia, Bulgaria", ...START, null);
      g.save();
      const d = JSON.parse(storage.getItem(SAVE_KEY)!);
      delete d.saved_at;
      storage.setItem(SAVE_KEY, JSON.stringify(d));
      const old = new Game({ ...(g as unknown as { deps: GameDeps }).deps, storage });
      old.load();
      await old.wake();
      expect(old.away).toBeNull();
    });

    it("catches up after the tab was hidden, and the card can be closed", async () => {
      let now = Date.UTC(2026, 9, 29, 8);
      const { g } = game({ clock: () => now });
      await g.startCity("Sofia, Bulgaria", ...START, null);
      g.save();
      now += HOUR;
      await g.wake();
      expect(g.away!.coveredS).toBe(3600);
      g.dismissAway();
      expect(g.away).toBeNull();
      // Caught up: waking again right away has nothing more to do.
      await g.wake();
      expect(g.away).toBeNull();
    });

    it("finishes the ride he was on first, then lives in the new city", async () => {
      const { again } = await reopen(10 * HOUR, { roll: 0.1 }, (g) => {
        g.stats.cents = 50_000;
        g.skipRoll = false;
        g.debugNewGoal();
        for (let i = 0; i < 600 && !g.walker!.isTraveling(); i++) g.step(1);
      });
      const s = again.away!;
      expect(s.cities[0]).toBe("Plovdiv, Bulgaria");
      expect(s.coveredS).toBe(10 * 3600);
      expect(again.walker!.isTraveling()).toBe(false);
      expect(again.loader.graph).toBe(again.walker!.graph);
      expect(again.city).toBe(s.end.city.name);
    });

    it("goes on trips while away and lands him in the new city", async () => {
      const { again } = await reopen(24 * HOUR, { roll: 0.1 }, (g) => {
        g.stats.cents = 500_000;
      });
      const s = again.away!;
      expect(s.cities.length).toBeGreaterThan(0);
      expect(again.city).toBe(s.end.city.name);
      expect(again.city).not.toBe("Sofia, Bulgaria");
      expect(again.walker!.position()).toEqual(s.end.at);
      expect(again.loader.graph).toBe(again.walker!.graph);
    });
  });

  describe("the sky", () => {
    const NOW = Date.UTC(2026, 9, 29, 10);
    const SHOP: Place = { name: "Shoe Shop", class: "shop", subclass: "shoes", rank: 1, lat: 42.6885, lon: 23.3215 };
    /** An Open-Meteo answer with `code` weather at `tempC` around NOW, counting the requests. */
    function weatherApi(code: number, tempC: number) {
      const calls: string[] = [];
      const hours = Array.from({ length: 72 }, (_, i) => Math.floor(NOW / 1000) - 24 * 3600 + i * 3600);
      const api = new Api(async (url) => {
        calls.push(url);
        if (!url.startsWith("https://api.open-meteo.com/")) return new Response("", { status: 503 });
        return Response.json({ utc_offset_seconds: 7200, hourly: { time: hours, temperature_2m: hours.map(() => tempC), weather_code: hours.map(() => code) } });
      });
      return { api, weatherCalls: () => calls.filter((u) => u.includes("open-meteo")).length };
    }

    it("fetches the city's weather once an hour, keeps it on the device and lives by it", async () => {
      let now = NOW;
      const { api, weatherCalls } = weatherApi(63, 9);
      const { g, storage } = game({ api, clock: () => now });
      await g.startCity("Sofia, Bulgaria", ...START, null);
      run(g, 3);
      await tick();
      run(g, 3);
      expect(weatherCalls()).toBe(1);
      expect(g.stats.sky).toMatchObject({ offsetS: 7200, weather: { kind: "rain", tempC: 9 }, season: "autumn" });
      expect(JSON.parse(storage.getItem("osmwalker.weather")!).city).toBe("Sofia, Bulgaria");
      now += 30 * 60_000;
      run(g, 2);
      expect(weatherCalls()).toBe(1);
      now += 31 * 60_000;
      run(g, 2);
      await tick();
      expect(weatherCalls()).toBe(2);
    });

    it("finds shops closed at night and does nothing there", async () => {
      const { g } = game({ places: [SHOP], hour: () => 23 });
      await g.startCity("Sofia, Bulgaria", ...START, null);
      // Closed places don't pull him, so he only gets there on a goal picked by day.
      g.walker!.needWeight = () => 1;
      run(g, 400);
      const lines = g.stats.history.entries.map((e) => e.text);
      expect(lines).toContain("Found Shoe Shop closed");
      expect(lines.some((l) => l.endsWith("at Shoe Shop"))).toBe(false);
    });

    it("doesn't head for closed places", async () => {
      const { g } = game({ places: [SHOP], hour: () => 23 });
      await g.startCity("Sofia, Bulgaria", ...START, null);
      run(g, 2);
      g.debugNewGoal();
      expect(g.walker!.place).toBeNull();
      expect(g.debugLog.entries.at(-1)?.fallback).toBe("every place near enough is closed");
    });
  });
});
