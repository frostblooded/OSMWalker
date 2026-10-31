// The catch-up on reopen when his elder stage runs out while away, with real Sofia streets, fake servers and fixed dice.
import { describe, expect, it } from "vitest";
import { distanceM } from "../../src/core/geo";
import { ELDER, LIFE_S } from "../../src/core/life";
import { TRUST_START } from "../../src/core/bond";
import { streets, run, HOUR, reopen } from "../support/game";

describe("game", () => {
  describe("catch-up", () => {
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

    it("when his elder stage runs out while away, the catch-up stops there and the heir carries on", async () => {
      const { again } = await reopen(6 * HOUR, {}, (g) => {
        g.stats.life.stage = ELDER;
        g.stats.life.born = Date.UTC(2026, 9, 29, 8) / 1000 - LIFE_S + 2 * 3600;
      });
      const lines = again.away!.lines;
      const ready = lines.findIndex((l) => l.text.startsWith("🌅 Ready to retire"));
      expect(ready).toBeGreaterThan(-1);
      expect(lines[ready]!.t).toBeLessThan(Date.UTC(2026, 9, 29, 8) / 1000 + 2 * 3600 + 15 * 60);
      expect(lines.at(-1)!.t).toBeLessThan(Date.UTC(2026, 9, 29, 8) / 1000 + 3 * 3600);
      expect(again.retired?.by).toBe("age");
      expect(again.stats.life.gen).toBe(2);
      expect(again.dilemma).toBeNull();
      // The card says he lived only until then, and that he retired.
      expect(again.away!.retire).toBe("done");
      expect(again.away!.coveredS).toBeLessThan(3 * 3600);
    });

    it("asked to retire on a ride and closed, he retires on reopen without living the time away", async () => {
      const { again } = await reopen(6 * HOUR, {}, (g) => {
        g.setAlwaysDilemma(true);
        g.stats.life.stage = ELDER;
        g.stats.life.born = Date.UTC(2026, 9, 29, 8) / 1000 - LIFE_S + 10 * 86400;
        g.stats.life.asked = true;
      });
      expect(again.retired?.by).toBe("you");
      expect(again.stats.life.gen).toBe(2);
      expect(again.away!.retire).toBe("done");
      expect(again.away!.coveredS).toBe(0);
      expect(again.away!.stops).toBe(0);
      expect(again.dilemma).toBeNull();
    });

    it("when he is due to retire but no streets load, the card says so and he retires later, with no dilemma", async () => {
      let down = false;
      const ok = streets().load;
      const { again } = await reopen(6 * HOUR, { load: (t, o) => (down ? Promise.resolve({ error: "HTTP 503" }) : ok(t, o)) }, (g) => {
        g.setAlwaysDilemma(true);
        g.stats.life.stage = ELDER;
        g.stats.life.born = Date.UTC(2026, 9, 29, 8) / 1000 - LIFE_S + 2 * 3600;
        down = true;
      });
      expect(again.retired).toBeNull();
      expect(again.stats.life.gen).toBe(1);
      expect(again.away!.retire).toBe("soon");
      expect(again.away!.coveredS).toBeLessThan(3 * 3600);
      expect(again.dilemma).toBeNull();
    });

    it("the heir's bond with you doesn't fade for days away before he set out", async () => {
      const { again } = await reopen(96 * HOUR, {}, (g) => {
        g.stats.life.stage = ELDER;
        g.stats.life.born = Date.UTC(2026, 9, 29, 8) / 1000 - LIFE_S + 2 * 3600;
      });
      expect(again.stats.life.gen).toBe(2);
      expect(again.stats.bond.trust).toBe(TRUST_START);
    });

    it("due to retire only past the catch-up's limit, with no streets, the card still says he stopped to retire and brings no dilemma", async () => {
      let down = false;
      const ok = streets().load;
      const { again } = await reopen(30 * HOUR, { load: (t, o) => (down ? Promise.resolve({ error: "HTTP 503" }) : ok(t, o)) }, (g) => {
        g.setAlwaysDilemma(true);
        g.stats.life.stage = ELDER;
        g.stats.life.born = Date.UTC(2026, 9, 29, 8) / 1000 - LIFE_S + 26 * 3600;
        down = true;
      });
      expect(again.stats.life.gen).toBe(1);
      expect(again.away!.retire).toBe("soon");
      expect(again.dilemma).toBeNull();
    });

    it("when his elder stage runs out past the catch-up's limit, he still retires on reopen, with no dilemma", async () => {
      const { again } = await reopen(30 * HOUR, {}, (g) => {
        g.setAlwaysDilemma(true);
        g.stats.life.stage = ELDER;
        g.stats.life.born = Date.UTC(2026, 9, 29, 8) / 1000 - LIFE_S + 26 * 3600;
      });
      expect(again.retired?.by).toBe("age");
      expect(again.stats.life.gen).toBe(2);
      expect(again.dilemma).toBeNull();
    });

  });
});
