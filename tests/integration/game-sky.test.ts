// The weather, day and night in the game with real Sofia streets, fake servers and fixed dice.
import { describe, expect, it } from "vitest";
import * as DebugLog from "../../src/core/debugLog";
import { NO_NEED } from "../../src/core/goals";
import type { Sky } from "../../src/core/sky";
import type { Place } from "../../src/core/stats";
import { Game, type GameDeps } from "../../src/game/game";
import { Api } from "../../src/net/api";
import { START, game, run, tick } from "../support/game";

describe("game", () => {
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

    it("doesn't wait for the weather on reopen", async () => {
      let now = NOW;
      const { weatherCalls, api } = weatherApi(71, -2);
      // A slow answer, which the reopen must not wait for.
      const fetchFn = (api as unknown as { fetchFn: (u: string) => Promise<Response> }).fetchFn;
      const slow = new Api((u) => new Promise((ok) => setTimeout(() => ok(fetchFn(u)), 600)));
      const { g, storage } = game({ api: slow, clock: () => now });
      await g.startCity("Sofia, Bulgaria", ...START, null);
      run(g, 2);
      await new Promise((r) => setTimeout(r, 700));
      expect(g.weather?.city).toBe("Sofia, Bulgaria");
      g.save();
      now += 2 * 3600_000;
      const again = new Game({ ...(g as unknown as { deps: GameDeps }).deps, storage });
      again.problems.quiet = true;
      again.load();
      const t0 = performance.now();
      await again.wake();
      expect(performance.now() - t0).toBeLessThan(600);
      expect(again.welcome).not.toBeNull();
      expect(weatherCalls()).toBeGreaterThanOrEqual(1);
    });

    it("keeps the weather off him while he rides", async () => {
      const { api } = weatherApi(63, 35);
      const { g } = game({ api, clock: () => NOW, roll: 0.1 });
      await g.startCity("Sofia, Bulgaria", ...START, null);
      run(g, 2);
      await tick();
      run(g, 2);
      expect(g.stats.sky?.weather?.kind).toBe("rain");
      g.stats.cents = 50_000;
      g.skipRoll = false;
      g.debugNewGoal();
      for (let i = 0; i < 600 && !g.walker!.isTraveling(); i++) g.step(1);
      run(g, 2);
      expect(g.walker!.isTraveling()).toBe(true);
      expect(g.stats.sky?.weather).toBeNull();
    });

    it("keeps the weather off the rest of a ride on reopen", async () => {
      let now = NOW;
      const { api } = weatherApi(0, 35);
      const { g, storage } = game({ api, clock: () => now, roll: 0.1 });
      await g.startCity("Sofia, Bulgaria", ...START, null);
      run(g, 2);
      await tick();
      g.stats.cents = 50_000;
      g.skipRoll = false;
      g.debugNewGoal();
      for (let i = 0; i < 600 && !g.walker!.isTraveling(); i++) g.step(1);
      expect(g.walker!.isTraveling()).toBe(true);
      g.save();
      now += 3 * 60_000;
      const again = new Game({ ...(g as unknown as { deps: GameDeps }).deps, storage });
      again.problems.quiet = true;
      again.load();
      const weather: unknown[] = [];
      const pass = again.stats.passTime.bind(again.stats);
      again.stats.passTime = (m, w) => (weather.push(again.stats.sky?.weather ?? null), pass(m, w));
      await again.wake();
      expect(weather[0]).toBeNull();
    });

    it("looks up under the sky of now when the tab shows again, not the sky it was hidden under", async () => {
      let now = NOW;
      const { api } = weatherApi(0, 15);
      const { g } = game({ api, clock: () => now });
      await g.startCity("Sofia, Bulgaria", ...START, null);
      run(g, 2);
      await tick();
      // Hidden at night; shown again by day.
      g.stats.sky = { ...g.sky(), dark: 1 };
      g.save();
      // Within the hour, so no weather fetch sets the sky first.
      now += 30 * 60_000;
      const skies: Sky[] = [];
      const pass = g.stats.passTime.bind(g.stats);
      g.stats.passTime = (m, w) => (skies.push(g.stats.sky!), pass(m, w));
      await g.wake();
      expect(skies[0]?.dark).toBe(g.sky().dark);
      expect(g.stats.stars.night).toBe("");
    });

    it("goes on by the forecast kept on the device, and retries a failed fetch later", async () => {
      let now = NOW;
      const { api, weatherCalls } = weatherApi(71, -2);
      const first = game({ api, clock: () => now });
      await first.g.startCity("Sofia, Bulgaria", ...START, null);
      run(first.g, 2);
      await tick();
      expect(weatherCalls()).toBe(1);
      // The network is gone: a new game reads the kept forecast and keeps using it.
      let down = 0;
      const offline = new Api(async (u) => (u.includes("open-meteo") && down++, new Response("", { status: 503 })));
      now += 2 * 3600_000;
      const again = new Game({ ...(first.g as unknown as { deps: GameDeps }).deps, api: offline, storage: first.storage });
      again.problems.quiet = true;
      expect(again.weather?.city).toBe("Sofia, Bulgaria");
      again.load();
      expect(again.stats.sky?.weather).toEqual({ kind: "snow", tempC: -2 });
      run(again, 2);
      await tick();
      // The failed request is logged once by the Api, with no second line about the weather.
      const weatherRows = () => again.problems.warnings.map((w) => w.text).filter((t) => /open-meteo|weather/.test(t));
      expect(weatherRows()).toEqual(["Request to api.open-meteo.com failed: HTTP 503 (server overloaded)"]);
      const tries = down;
      run(again, 5);
      await tick();
      expect(down).toBe(tries);
      now += 11 * 60_000;
      run(again, 2);
      await tick();
      expect(down).toBeGreaterThan(tries);
      expect(again.stats.sky?.weather?.kind).toBe("snow");
    });

    it("finds shops closed at night and does nothing there", async () => {
      const { g } = game({ places: [SHOP], hour: () => 23 });
      await g.startCity("Sofia, Bulgaria", ...START, null);
      // Closed places don't pull him, so he only gets there on a goal picked by day.
      g.walker!.need = () => NO_NEED;
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
      // Closed at night is normal: no warning in Problems, and the pick isn't one either.
      expect(g.problems.warnings.filter((w) => w.text.startsWith("Picked a random spot"))).toEqual([]);
      expect(DebugLog.isWarning(g.debugLog.entries.at(-1)!)).toBe(false);
      expect(DebugLog.title(g.debugLog.entries.at(-1)!)).toBe("🌙 Random spot: everything near is closed (button)");
    });

    it("lets a quest step at a closed shop wait for morning instead of heading there", async () => {
      const { g } = game({ places: [SHOP], hour: () => 23 });
      await g.startCity("Sofia, Bulgaria", ...START, null);
      run(g, 2);
      const at = { name: SHOP.name, class: SHOP.class, subclass: SHOP.subclass, lat: SHOP.lat, lon: SHOP.lon };
      g.stats.quests.active = { key: "q:Ana:0", kind: "q", giver: "Ana", item: 0, twist: -1, at, step: 0, target: at };
      g.debugNewGoal();
      expect(g.walker!.place?.name).not.toBe("Shoe Shop");
      expect(g.stats.quests.active?.key).toBe("q:Ana:0");
    });
  });
});
