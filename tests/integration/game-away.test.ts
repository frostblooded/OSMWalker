// The catch-up on reopen with real Sofia streets, fake servers and fixed dice: time away, clovers, rides and dilemmas.
import { describe, expect, it, vi } from "vitest";
import { distanceM } from "../../src/core/geo";
import { FULLNESS_PER_H, type Place } from "../../src/core/stats";
import { cityBounds, LONG_WALK_MAX_S, SLEEPER_FROM_M } from "../../src/core/trips";
import { MOMENT_S } from "../../src/core/moments";
import * as R from "../../src/core/repute";
import { getCrawler, setCrawler } from "../../src/core/ruins";
import { Game, SAVE_KEY, type GameDeps } from "../../src/game/game";
import { HOLIDAYS_KEY } from "../../src/game/saveFile";
import { dataFile } from "../support/data";
import { START, CAFE, MemStorage, game, HOUR, reopen, reopenDilemma, run } from "../support/game";

describe("game", () => {
  describe("catch-up", () => {
    it("takes his own pick at each place's moment while away, and says so in his History", async () => {
      const { again } = await reopen(2 * HOUR, { moments: true } as Parameters<typeof game>[0]);
      expect(again.moment).toBeNull();
      expect(again.stats.history.entries.some((e) => / Decided by himself: /.test(e.text))).toBe(true);
    });

    it("knows the holiday kept on the device on reopen, so time away on a holiday has holiday actions", async () => {
      // The list was fetched on an earlier day; Nager.Date is down now.
      const storage = new MemStorage();
      storage.setItem(HOLIDAYS_KEY, JSON.stringify({ lists: { "BG:2026": [{ date: "2026-10-29", name: "Test Day", localName: "" }] }, said: "" }));
      // A park stays open on a holiday, so he has somewhere to celebrate.
      const park: Place = { name: "Holiday Park", class: "park", subclass: "park", rank: 1, lat: CAFE.lat, lon: CAFE.lon };
      const { again } = await reopen(6 * HOUR, { storage, places: [park] });
      const names: string[] = JSON.parse(dataFile("actions.json"))._holiday.map((a: { name: string }) => a.name);
      expect(again.away!.lines.some((l) => names.some((n) => l.text.includes(n)))).toBe(true);
    });

    it("picks up local words while away, at the places they fit", async () => {
      const { again } = await reopen(8 * HOUR, { places: [CAFE] });
      const learned = again.away!.lines.filter((l) => l.text.startsWith("🗣 Learned a Bulgarian word"));
      expect(learned.length).toBeGreaterThan(0);
      // A word learned at a café is coffee (his wants may take him elsewhere first).
      expect(learned.find((l) => / at .*[Cc]afe/.test(l.text))?.text).toMatch(/: "кафе \(kafe\)" means coffee$/);
      expect(again.stats.words.known.bg).toContain("coffee");
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

    it("drops a chase that was under way when the tab was hidden", async () => {
      let now = Date.UTC(2026, 9, 29, 8);
      const { g } = game({ clock: () => now });
      await g.startCity("Sofia, Bulgaria", ...START, null);
      g.chase = { place: "Cafe", ends: now + R.CHASE_S * 1000, trail: [g.walker!.position()] };
      g.save();
      now += HOUR;
      await g.wake();
      expect(g.chase).toBeNull();
      expect(g.policeAt()).toBeNull();
    });

    it("a reopen loads the ruin crawls before the catch-up", async () => {
      setCrawler(null);
      let now = Date.UTC(2026, 9, 29, 8);
      const { g } = game({ clock: () => now });
      await g.startCity("Sofia, Bulgaria", ...START, null);
      g.save();
      now += HOUR;
      await g.wake();
      expect(getCrawler()).not.toBeNull();
      setCrawler(null);
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

    it("a long walk that outlasts the time away goes on when you are back, and lands with its reward", async () => {
      const walk = (g: Game) => {
        const vidin = g.trips.cities.find((c) => c.name === "Vidin")!;
        g.stats.meters.fullness = 100;
        g.stats.ride(0, "walk", "the road out of town", "Vidin, Bulgaria");
        g.walker!.startTravel({ ...vidin, bounds: cityBounds(vidin) }, "walk");
      };
      const { again } = await reopen(HOUR, {}, walk);
      expect(again.away!.coveredS).toBe(HOUR / 1000);
      expect(again.walker!.isTraveling()).toBe(true);
      expect(again.walker!.travel!.mode).toBe("walk");
      expect(again.city).toBe("Sofia, Bulgaria");
      again.dismissAway();
      for (let i = 0; i < LONG_WALK_MAX_S && again.walker!.isTraveling(); i++) again.step(1);
      expect(again.city).toBe("Vidin, Bulgaria");
      expect(again.stats.history.entries.some((e) => /^Walked \d+ km to Vidin, Bulgaria/.test(e.text))).toBe(true);

      // Away for longer than the walk: he lands first, then lives in the new town.
      const long = (await reopen(LONG_WALK_MAX_S * 1000 + 60_000, {}, walk)).again;
      expect(long.walker!.isTraveling()).toBe(false);
      // Fed by the hostels the whole way: only the minute after landing drains him.
      expect(long.stats.meters.fullness).toBeGreaterThan(100 - FULLNESS_PER_H / 10);
      expect(long.away!.cities[0]).toBe("Vidin, Bulgaria");
      expect(long.away!.lines.some((l) => /^Walked \d+ km to Vidin, Bulgaria/.test(l.text))).toBe(true);
    });

    it("a reopen that earns a clover adds trust, and he writes when it passes a letter step", async () => {
      const { again } = await reopen(
        2 * HOUR,
        {},
        (g) => (g.stats.bond.trust = 28),
        (a) => (a.stats.letters = { tiers: [["First letter."]], thanks: {} }),
      );
      expect(again.stats.bond.trust).toBe(32);
      expect(again.stats.history.entries.some((e) => e.text === "✉ First letter.")).toBe(true);
      expect(again.lastDeed()!.text).not.toMatch(/^✉/);
    });

    it("earns a clover for a reopen after an hour, and he opens a care package sent before you left", async () => {
      const { again } = await reopen(2 * HOUR, {}, (g) => {
        g.stats.care.clovers = 1;
        g.sendGift("snack");
      });
      expect(again.awayClover).toBe(true);
      expect(again.stats.care.clovers).toBe(1);
      expect(again.stats.care.parcel).toBe("");
      expect(again.away!.lines.some((l) => l.text.startsWith("Opened your care package: 🥪 Snack"))).toBe(true);
      again.dismissAway();
      expect(again.awayClover).toBe(false);
      expect((await reopen(30 * 60_000)).again.awayClover).toBe(false);
    });


    it("settles a dilemma by your tap, or by himself when the card closes", async () => {
      const { again } = await reopenDilemma("wallet");
      const cents = again.stats.cents;
      again.chooseDilemma(1);
      again.chooseDilemma(0);
      expect(again.dilemma).toMatchObject({ picked: 1, by: "you" });
      expect(again.stats.cents).toBe(cents + 4000);
      again.dismissAway();
      expect(again.dilemma).toBeNull();

      const other = (await reopenDilemma("musician")).again;
      other.dismissAway();
      expect(other.stats.history.latest()).toMatch(/^Decided by himself: /);
    });

    it("never waits for you: leaving the page, or another reopen, lets him decide", async () => {
      const { again } = await reopenDilemma("bread");
      again.leave();
      expect(again.dilemma).toMatchObject({ by: "him" });
      expect(again.stats.history.latest()).toMatch(/^Decided by himself: /);
      expect(again.leaveDilemma()).toBe(false);

      const r = await reopenDilemma("helper");
      const open = r.again.dilemma!;
      r.setNow(r.now() + 5 * HOUR);
      await r.again.wake();
      expect(open).toMatchObject({ by: "him" });
      expect(r.again.stats.history.entries.some((e) => e.text.startsWith("Decided by himself: "))).toBe(true);
    });

    it("decides by himself once the moment timer runs out after the card shows, or at once with it Off", async () => {
      const { again } = await reopenDilemma("bread");
      // Behind another sheet the card isn't seen yet, so its time hasn't started.
      run(again, 60);
      expect(again.dilemma).toMatchObject({ picked: null });
      again.dilemmaShown();
      run(again, 1);
      // Shown again (the card reopened), it keeps counting down.
      again.dilemmaShown();
      expect(again.dilemmaLeft).toBe(MOMENT_S - 1);
      run(again, MOMENT_S - 2);
      expect(again.dilemma).toMatchObject({ picked: null });
      run(again, 1);
      expect(again.dilemma).toMatchObject({ by: "him" });

      const off = await reopen(5 * HOUR, {}, (g) => {
        g.setAlwaysDilemma(true);
        while (g.momentS) g.nextMomentTimer();
      });
      expect(off.again.dilemma).toMatchObject({ by: "him" });
    });

    it("takes him to the offered city when he hops on a free ride", async () => {
      const r = await reopenDilemma("trucker");
      const again = r.again;
      const plovdiv = again.trips.cities.find((c) => c.name === "Plovdiv")!;
      again.dilemma!.city = plovdiv;
      const cents = again.stats.cents;
      again.chooseDilemma(0);
      expect(again.city).toBe("Plovdiv, Bulgaria");
      expect(again.stats.cents).toBe(cents);
      expect(again.stats.history.entries.some((e) => e.text === "Hopped on a trucker's free ride to Plovdiv")).toBe(true);
    });

    it("a free ride is by road, so even a long one brings no jet lag", async () => {
      const { again } = await reopenDilemma("trucker");
      again.dilemma!.city = again.trips.cities.find((c) => c.name === "Paris")!;
      again.chooseDilemma(0);
      expect(again.city).toBe("Paris, France");
      expect(again.stats.buffNames()).not.toContain("Jet-lagged");
    });

    it("lands by the trip plan's road distance: a night train counted from where he planned it", async () => {
      const { g } = game();
      await g.startCity("Sofia, Bulgaria", ...START, null);
      g.stats.meters.energy = 20;
      const plovdiv = g.trips.cities.find((c) => c.name === "Plovdiv")!;
      g.walker!.startTravel({ ...plovdiv, bounds: cityBounds(plovdiv) }, "train");
      g.walker!.travel!.road_m = SLEEPER_FROM_M;
      for (let i = 0; i < 3600 && g.walker!.isTraveling(); i++) g.step(1);
      expect(g.stats.history.entries.some((e) => e.text === "Slept in a berth on the night train and woke up rested")).toBe(true);
    });

    it("turns a free ride down while he is on a paid one", async () => {
      const { again } = await reopenDilemma("trucker");
      const [plovdiv, vidin] = ["Plovdiv", "Vidin"].map((n) => again.trips.cities.find((c) => c.name === n)!);
      again.dilemma!.city = plovdiv!;
      again.walker!.startTravel({ ...vidin!, bounds: cityBounds(vidin!) }, "bus");
      again.chooseDilemma(0);
      expect(again.dilemma).toMatchObject({ picked: 1, by: "him" });
      expect(again.stats.history.latest()).toBe("Decided by himself: Thanked the trucker and stayed");
    });

    it("keeps your own Stay as yours while he is on a paid ride", async () => {
      const { again } = await reopenDilemma("trucker");
      const [plovdiv, vidin] = ["Plovdiv", "Vidin"].map((n) => again.trips.cities.find((c) => c.name === n)!);
      again.dilemma!.city = plovdiv!;
      again.walker!.startTravel({ ...vidin!, bounds: cityBounds(vidin!) }, "bus");
      again.chooseDilemma(1);
      expect(again.dilemma).toMatchObject({ picked: 1, by: "you" });
    });

    it("says when the first wake has run, so a postcard from a link waits for the away card", async () => {
      const short = await reopen(10_000);
      expect(short.again.woke).toBe(true);
      expect(short.again.away).toBeNull();
      const long = await reopen(2 * HOUR);
      expect(long.again.woke).toBe(true);
      expect(long.again.away).not.toBeNull();
      expect(new Game({ ...(long.g as unknown as { deps: GameDeps }).deps }).woke).toBe(false);
    });

    it("lets a free ride replace a trip he is walking to", async () => {
      const { again } = await reopenDilemma("trucker");
      const [plovdiv, vidin] = ["Plovdiv", "Vidin"].map((n) => again.trips.cities.find((c) => c.name === n)!);
      again.dilemma!.city = vidin!;
      const w = again.walker!;
      w.departing = { city: { ...plovdiv!, bounds: cityBounds(plovdiv!) }, mode: "bus", station: null, fare: 1248, arrive: [plovdiv!.lat, plovdiv!.lon], distance_m: 120000 } as unknown as typeof w.departing;
      again.chooseDilemma(0);
      expect(again.city).toBe("Vidin, Bulgaria");
      expect(w.departing).toBeNull();
    });

    it("still finishes a reopen when the dilemma code can't load", async () => {
      // Mocked once the game's other lazy code is in, so only the dilemma code fails to load.
      const offline = () =>
        vi.doMock("../../src/core/dilemmas", () => {
          throw new Error("offline");
        });
      try {
        const { again } = await reopen(5 * HOUR, {}, (g) => g.setAlwaysDilemma(true), offline);
        expect(again.away).not.toBeNull();
        expect(again.dilemma).toBeNull();
      } finally {
        vi.doUnmock("../../src/core/dilemmas");
      }
    });

    it("hands out badges at saves once he is awake", async () => {
      const { again } = await reopen(2 * HOUR, {}, (g) => (g.stats.level = 5));
      await vi.waitFor(() => {
        again.save();
        expect(again.stats.history.entries.some((e) => e.text === "🥉 Bronze badge: Growing up (level 5)")).toBe(true);
      });
    });

    it("goes on trips while away and lands him in the new city", async () => {
      const { again } = await reopen(24 * HOUR, { roll: 0.1 }, (g) => {
        g.stats.cents = 500_000;
      });
      const s = again.away!;
      expect(s.cities.length).toBeGreaterThan(0);
      expect(again.city).toBe(s.end.city.name);
      // He may ride back and forth; he ends in the last city he reached.
      expect(again.city).toBe(s.cities.at(-1));
      // Back in Sofia, whose streets are loaded, he steps onto the nearest corner.
      const [lat, lon] = again.walker!.position();
      expect(distanceM(lat, lon, s.end.at[0], s.end.at[1])).toBeLessThan(100);
      expect(again.loader.graph).toBe(again.walker!.graph);
    });
  });
});
