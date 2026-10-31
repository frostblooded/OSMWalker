// A reopen with real Sofia streets, fake servers and fixed dice: the boost, clovers, the welcome-back card and dilemmas.
import { describe, expect, it, vi } from "vitest";
import { FULLNESS_PER_H } from "../../src/core/stats";
import { cityBounds, LONG_WALK_MAX_S, SLEEPER_FROM_M } from "../../src/core/trips";
import { MOMENT_S } from "../../src/core/moments";
import { BOOST } from "../../src/core/boost";
import * as R from "../../src/core/repute";
import { Game, SAVE_KEY, type GameDeps } from "../../src/game/game";
import { START, game, HOUR, reopen, reopenDilemma, run } from "../support/game";

describe("game", () => {
  describe("time away", () => {
    it("earns BOOST x speed for away ÷ (BOOST - 1), shown in a note, with nothing lived while closed", async () => {
      const { g, again } = await reopen(9 * HOUR, {}, (g) => (g.stats.meters.fullness = 80));
      expect(again.boostS).toBeCloseTo(3600);
      expect(again.welcome).toMatchObject({ awayS: 9 * 3600, card: false, n: 1 });
      expect(again.welcome!.boostS).toBeCloseTo(3600);
      // Nothing happened to him while the game was closed.
      expect(again.stats.meters.fullness).toBe(80);
      expect(again.walker!.totalM).toBe(g.walker!.totalM);
    });

    it("runs BOOST x while the boost lasts, then 1x, counting the boost down in real seconds", async () => {
      const { again } = await reopen(9 * 60_000, {}, (g) => (g.stats.meters.fullness = 90));
      expect(again.boostS).toBeCloseTo(60);
      const before = again.stats.meters.fullness;
      run(again, 30);
      expect(again.boostS).toBeCloseTo(30);
      expect(before - again.stats.meters.fullness).toBeCloseTo((FULLNESS_PER_H * 300) / 3600, 3);
      run(again, 40);
      expect(again.boostS).toBe(0);
      // 30 more boosted seconds, then 10 at 1x.
      expect(before - again.stats.meters.fullness).toBeCloseTo((FULLNESS_PER_H * 610) / 3600, 3);
    });

    it("keeps a boost left over when you leave again, adds the next one, and saves it", async () => {
      const r = await reopen(9 * 60_000);
      run(r.again, 20);
      expect(r.again.boostS).toBeCloseTo(40);
      r.again.leave();
      r.setNow(r.now() + 9 * 60_000);
      await r.again.wake();
      expect(r.again.boostS).toBeCloseTo(100);
      expect(r.again.welcome).toMatchObject({ n: 2 });
      const back = new Game({ ...(r.g as unknown as { deps: GameDeps }).deps, storage: r.storage });
      back.load();
      expect(back.boostS).toBeCloseTo(100);
    });

    it("keeps the boost while a timed moment holds him, as the moment counts your seconds", async () => {
      const { again } = await reopen(9 * 60_000);
      void again.ask({ id: "x", icon: "", ask: "", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], default: "b" });
      expect(again.moment).not.toBeNull();
      run(again, 3);
      expect(again.boostS).toBeCloseTo(60);
      expect(again.moment!.left).toBeCloseTo(again.moment!.total - 3);
    });

    it("uses up only the boost he lived when a moment opens mid-step", async () => {
      const { again } = await reopen(9 * 60_000);
      const g = again as unknown as { live: (s: number) => void };
      const live = g.live.bind(again);
      g.live = (s) => {
        live(s);
        if (!again.moment) void again.ask({ id: "x", icon: "", ask: "", options: [{ id: "a", label: "A" }], default: "a" });
      };
      again.step(1);
      // One sub-step (a tenth of a real second at 10x) ran before the moment held him.
      expect(again.boostS).toBeCloseTo(60 - 1 / BOOST);
    });

    it("gives no boost after a short break or from an old save", async () => {
      const short = (await reopen(30_000)).again;
      expect(short.boostS).toBe(0);
      expect(short.welcome).toBeNull();
      const { g, storage } = game();
      await g.startCity("Sofia, Bulgaria", ...START, null);
      g.save();
      const d = JSON.parse(storage.getItem(SAVE_KEY)!);
      delete d.saved_at;
      storage.setItem(SAVE_KEY, JSON.stringify(d));
      const old = new Game({ ...(g as unknown as { deps: GameDeps }).deps, storage });
      old.load();
      await old.wake();
      expect(old.boostS).toBe(0);
      expect(old.welcome).toBeNull();
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

    it("a ride he was on waits while the game is closed, and goes on BOOST x as fast after", async () => {
      const { again } = await reopen(LONG_WALK_MAX_S * 1000, {}, (g) => {
        const vidin = g.trips.cities.find((c) => c.name === "Vidin")!;
        g.stats.meters.fullness = 100;
        g.stats.ride(0, "walk", "the road out of town", "Vidin, Bulgaria");
        g.walker!.startTravel({ ...vidin, bounds: cityBounds(vidin) }, "walk");
      });
      expect(again.walker!.isTraveling()).toBe(true);
      expect(again.city).toBe("Sofia, Bulgaria");
      // The whole walk fits in the boost the time away earned, so it takes a tenth of its real time.
      let s = 0;
      for (; s < LONG_WALK_MAX_S && again.walker!.isTraveling(); s++) again.step(1);
      expect(s).toBeLessThanOrEqual(Math.ceil(LONG_WALK_MAX_S / BOOST) + 1);
      expect(again.city).toBe("Vidin, Bulgaria");
      expect(again.stats.history.entries.some((e) => /^Walked \d+ km to Vidin, Bulgaria/.test(e.text))).toBe(true);
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
      expect(again.lastDeed()?.text ?? "").not.toMatch(/^✉/);
    });

    it("earns a clover for a reopen after an hour, shown in the note; a care package sent before you left waits for his next stop", async () => {
      const { again } = await reopen(2 * HOUR, {}, (g) => {
        g.stats.care.clovers = 1;
        g.sendGift("snack");
      });
      expect(again.welcome!.clover).toBe(true);
      expect(again.stats.care.clovers).toBe(1);
      expect(again.stats.care.parcel).toBe("snack");
      expect((await reopen(30 * 60_000)).again.welcome!.clover).toBe(false);
    });

    it("opens the welcome-back card only for a dilemma or last week's recap, and closing it keeps the boost", async () => {
      const { again } = await reopenDilemma("bread");
      expect(again.welcome!.card).toBe(true);
      const boost = again.boostS;
      again.dismissWelcome();
      expect(again.welcome).toBeNull();
      expect(again.dilemma).toBeNull();
      expect(again.boostS).toBe(boost);
      expect((await reopen(2 * HOUR)).again.welcome!.card).toBe(false);
    });

    it("settles a dilemma by your tap, or by himself when the card closes", async () => {
      const { again } = await reopenDilemma("wallet");
      const cents = again.stats.cents;
      again.chooseDilemma(1);
      again.chooseDilemma(0);
      expect(again.dilemma).toMatchObject({ picked: 1, by: "you" });
      expect(again.stats.cents).toBe(cents + 4000);
      again.dismissWelcome();
      expect(again.dilemma).toBeNull();

      const other = (await reopenDilemma("musician")).again;
      other.dismissWelcome();
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

    it("says when the first wake has run, so a postcard from a link waits for the welcome-back card", async () => {
      const short = await reopen(10_000);
      expect(short.again.woke).toBe(true);
      expect(short.again.welcome).toBeNull();
      const long = await reopen(2 * HOUR);
      expect(long.again.woke).toBe(true);
      expect(long.again.welcome).not.toBeNull();
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
        expect(again.welcome).not.toBeNull();
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
  });
});
