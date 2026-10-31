// A reopen when his elder stage ran out while the game was closed, with real Sofia streets, fake servers and fixed dice.
import { describe, expect, it } from "vitest";
import { ELDER, LIFE_S } from "../../src/core/life";
import { TRUST_START } from "../../src/core/bond";
import { streets, HOUR, reopen } from "../support/game";

const T0 = Date.UTC(2026, 9, 29, 8) / 1000;

describe("game", () => {
  describe("retiring on reopen", () => {
    it("when his elder stage ran out while closed, he retires on reopen and the heir carries on, with no dilemma", async () => {
      const { again } = await reopen(6 * HOUR, {}, (g) => {
        g.setAlwaysDilemma(true);
        g.stats.life.stage = ELDER;
        g.stats.life.born = T0 - LIFE_S + 2 * 3600;
      });
      expect(again.retired?.by).toBe("age");
      expect(again.stats.life.gen).toBe(2);
      expect(again.dilemma).toBeNull();
      expect(again.welcome?.card).toBe(false);
    });

    it("asked to retire on a ride and closed, he retires on reopen", async () => {
      const { again } = await reopen(6 * HOUR, {}, (g) => {
        g.setAlwaysDilemma(true);
        g.stats.life.stage = ELDER;
        g.stats.life.born = T0 - LIFE_S + 10 * 86400;
        g.stats.life.asked = true;
      });
      expect(again.retired?.by).toBe("you");
      expect(again.stats.life.gen).toBe(2);
      expect(again.dilemma).toBeNull();
    });

    it("when he is due to retire but no streets load, he retires later, with no dilemma", async () => {
      let down = false;
      const ok = streets().load;
      const { again } = await reopen(6 * HOUR, { load: (t, o) => (down ? Promise.resolve({ error: "HTTP 503" }) : ok(t, o)) }, (g) => {
        g.setAlwaysDilemma(true);
        g.stats.life.stage = ELDER;
        g.stats.life.born = T0 - LIFE_S + 2 * 3600;
        down = true;
      });
      expect(again.retired).toBeNull();
      expect(again.stats.life.gen).toBe(1);
      expect(again.dilemma).toBeNull();
    });

    it("the heir's bond with you doesn't fade for days away before he set out", async () => {
      const { again } = await reopen(96 * HOUR, {}, (g) => {
        g.stats.life.stage = ELDER;
        g.stats.life.born = T0 - LIFE_S + 2 * 3600;
      });
      expect(again.stats.life.gen).toBe(2);
      expect(again.stats.bond.trust).toBe(TRUST_START);
    });
  });
});
