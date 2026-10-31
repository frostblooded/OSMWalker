// The game's retirement with real Sofia streets, fake servers and fixed dice: the elder retires and his heir sets out.
import { describe, expect, it, vi } from "vitest";
import { cellKey } from "../../src/core/graph";
import { ELDER, LIFE_S, PERK_CENTS } from "../../src/core/life";
import * as R from "../../src/core/repute";
import { type Game, RETIRE_RETRY_MS, SAVE_KEY, type GameDeps } from "../../src/game/game";
import { WEST, START, streets, game, run } from "../support/game";

describe("game", () => {
  describe("retiring", () => {
    /** A game in Sofia with him an elder who spent most time in Sofia, wearing a sword. */
    async function elder(dueInS: number, o: Partial<GameDeps> = {}) {
      const { g, storage } = game(o);
      await g.startCity("Sofia, Bulgaria", ...START, null);
      const l = g.stats.life;
      l.stage = ELDER;
      l.cityMin = { "Plovdiv, Bulgaria": 5, "Sofia, Bulgaria": 500 };
      l.born = Math.floor(Date.now() / 1000) - LIFE_S + dueInS;
      g.stats.level = 9;
      g.stats.equip({ name: "Bronze Sword", slot: "weapon", stats: { str: 2 }, rarity: "Common", price: 4000 });
      return { g, storage };
    }
    const settled = async (g: Game) => {
      for (let i = 0; i < 100 && !g.retired; i++) await new Promise((r) => setTimeout(r, 20));
    };

    it("at the end of elder he retires by himself and his heir sets out from his favourite city", async () => {
      const { g, storage } = await elder(-1);
      // A chase after the old walker doesn't follow his heir.
      g.chase = { place: "Cafe", ends: Date.now() + R.CHASE_S * 1000, trail: [g.walker!.position()] };
      run(g, 1);
      await settled(g);
      expect(g.retired).toMatchObject({ gen: 1, by: "age", home: "Sofia, Bulgaria", heirloom: "Bronze Sword", level: 9 });
      expect(g.stats.life.gen).toBe(2);
      expect(g.stats.level).toBe(1);
      expect(g.stats.cents).toBe(20000 + PERK_CENTS);
      expect(g.stats.gear.weapon?.name).toBe("Bronze Sword");
      expect(g.city).toBe("Sofia, Bulgaria");
      expect(g.chase).toBeNull();
      expect(g.stats.history.entries.some((e) => e.text.includes("police"))).toBe(false);
      expect(g.walker!.graph.cells.has(cellKey(WEST))).toBe(true);
      expect(JSON.parse(storage.getItem(SAVE_KEY)!).stats.life.gen).toBe(2);
      run(g, 30);
      expect(g.walker!.totalM).toBeGreaterThan(0);
      g.dismissRetired();
      expect(g.retired).toBeNull();
    });

    it("where his favourite city has no streets, the heir sets out where he is", async () => {
      const { g } = await elder(-1);
      g.stats.life.cityMin = { "Paris, France": 900 };
      g.stats.life.cityAt["Paris, France"] = [48.85, 2.35];
      run(g, 1);
      await settled(g);
      expect(g.retired?.home).toBe("Sofia, Bulgaria");
      expect(g.retired?.letter).toContain("Sofia felt most like home");
      expect(g.retired?.chronicle.at(-1)?.text).toBe("Retired in Sofia");
      expect(g.city).toBe("Sofia, Bulgaria");
      expect(g.stats.life.gen).toBe(2);
      expect(g.stats.history.entries.filter((l) => l.text.includes("takes over"))).toHaveLength(1);
      // The fallback worked, so no street warning for Paris.
      expect(g.problems.warnings.filter((w) => w.text.includes("streets"))).toEqual([]);
    });

    it("when no streets load, he walks on and tries again later", async () => {
      const ok = streets().load;
      let down = false;
      let now = Date.now();
      const { g } = await elder(-1, { load: (t, o) => (down ? Promise.resolve({ error: "HTTP 503" }) : ok(t, o)), clock: () => now });
      g.stats.life.cityMin = { "Paris, France": 900 };
      g.stats.life.cityAt["Paris, France"] = [48.85, 2.35];
      // His own streets are loaded; nothing new comes in.
      down = true;
      const before = g.walker;
      run(g, 1);
      for (let i = 0; i < 40; i++) await new Promise((r) => setTimeout(r, 20));
      expect(g.retired).toBeNull();
      expect(g.walker).toBe(before);
      expect(g.stats.life.gen).toBe(1);
      expect(g.stats.history.entries.filter((l) => l.text === "🌅 Retiring in Paris…")).toHaveLength(1);
      expect(g.problems.warnings.map((w) => w.text).filter((t) => t.includes("heir"))).toEqual(["Couldn't load the streets for his heir; he tries again every 1 min"]);
      run(g, 5);
      expect(g.walker!.totalM).toBeGreaterThan(0);
      down = false;
      now += RETIRE_RETRY_MS;
      run(g, 1);
      await settled(g);
      expect(g.stats.life.gen).toBe(2);
    });

    it("a reopen while he is retiring waits for the heir, so the old walker's catch-up never lands on him", async () => {
      const ok = streets().load;
      let open: () => void = () => {};
      let gate: Promise<void> | null = null;
      let now = Date.now();
      const { g } = await elder(-1, { load: (t, o) => (gate ? gate.then(() => ok(t, o)) : ok(t, o)), clock: () => now });
      g.save();
      gate = new Promise((r) => (open = r));
      run(g, 1);
      expect(g.stats.life.gen).toBe(1);
      now += 2 * 3600 * 1000;
      await g.wake();
      expect(g.away).toBeNull();
      open();
      await settled(g);
      expect(g.stats.life.gen).toBe(2);
      expect(g.away).toBeNull();
    });

    it("a later reopen still rolls a dilemma while the farewell letter waits to be read", async () => {
      let now = Date.now();
      const { g } = await elder(-1, { clock: () => now });
      run(g, 1);
      await settled(g);
      expect(g.retired).not.toBeNull();
      g.setAlwaysDilemma(true);
      g.save();
      now += 5 * 3600 * 1000;
      await g.wake();
      expect(g.dilemma).not.toBeNull();
    });

    it("a choice still open on the away card is decided before the heir takes over", async () => {
      let now = Date.now();
      const { g } = await elder(86400, { clock: () => now });
      g.setAlwaysDilemma(true);
      g.save();
      now += 5 * 3600 * 1000;
      await g.wake();
      expect(g.dilemma).not.toBeNull();
      const old = g.stats;
      await g.retire("you");
      expect(g.stats.life.gen).toBe(2);
      expect(old.history.entries.some((l) => l.text.includes("Decided by himself"))).toBe(true);
      expect(g.stats.history.entries.some((l) => l.text.includes("Decided by himself"))).toBe(false);
    });

    it("a Retire from the menu that can't load streets is kept and done on a later try", async () => {
      const ok = streets().load;
      let down = false;
      let now = Date.now();
      const { g } = await elder(3600, { load: (t, o) => (down ? Promise.resolve({ error: "HTTP 503" }) : ok(t, o)), clock: () => now });
      g.stats.life.cityMin = { "Paris, France": 900 };
      g.stats.life.cityAt["Paris, France"] = [48.85, 2.35];
      down = true;
      await g.retire("you");
      expect(g.stats.life.gen).toBe(1);
      expect(g.stats.life.asked).toBe(true);
      expect(g.stats.history.entries.some((l) => l.text.includes("takes over"))).toBe(false);
      down = false;
      now += RETIRE_RETRY_MS;
      run(g, 1);
      await settled(g);
      expect(g.stats.life.gen).toBe(2);
      expect(g.retired?.by).toBe("you");
    });

    it("the debug button makes him a stage older, and an elder due to retire", async () => {
      const { g } = game();
      await g.startCity("Sofia, Bulgaria", ...START, null);
      g.debugAge();
      expect(g.stats.life.title()).toContain("Settled");
      g.debugAge();
      g.debugAge();
      expect(g.stats.life.stage).toBe(ELDER);
      expect(g.stats.life.retireDue).toBe(false);
      g.debugAge();
      expect(g.stats.life.retireDue).toBe(true);
    });

    it("you can retire him from the menu only once he is an elder", async () => {
      const { g } = await elder(3600);
      g.stats.life.stage = ELDER - 1;
      await g.retire("you");
      expect(g.retired).toBeNull();
      g.stats.life.stage = ELDER;
      await g.retire("you");
      expect(g.retired?.by).toBe("you");
      expect(g.stats.life.gen).toBe(2);
    });

    it("asked to retire on a ride, he says he will and retires once he lands", async () => {
      const { g } = await elder(3600);
      const riding = vi.spyOn(g.walker!, "isTraveling").mockReturnValue(true);
      await g.retire("you");
      expect(g.retired).toBeNull();
      expect(g.stats.life.asked).toBe(true);
      expect(g.stats.history.latest()).toContain("Will retire");
      riding.mockRestore();
      g.step(1);
      await settled(g);
      expect(g.retired?.by).toBe("you");
      expect(g.stats.life.gen).toBe(2);
    });
  });
});
