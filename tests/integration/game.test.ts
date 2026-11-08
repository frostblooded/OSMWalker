// The game loop with real Sofia streets, fake servers and fixed dice: walking, rewards, levels and saves.
import { describe, expect, it } from "vitest";
import { cellKey } from "../../src/core/graph";
import { MONEY_POSE, XP_POSE } from "../../src/core/look";
import { xpToNext } from "../../src/core/stats";
import { GREEN_XP, NEW_PLACE_XP, WORK_CENTS } from "../../src/core/places";
import { Game, POSE_S, SAVE_KEY, type GameDeps } from "../../src/game/game";
import { look } from "../../src/game/hud";
import { CAFE, game, PARK, run, START, tick, WEST } from "../support/game";

const reopened = (g: Game, storage: GameDeps["storage"]) => {
  const again = new Game({ ...(g as unknown as { deps: GameDeps }).deps, storage });
  again.problems.quiet = true;
  return again;
};

describe("game", () => {
  it("starts walking in a city once the streets there load", async () => {
    const { g } = game();
    expect(await g.startCity("Sofia, Bulgaria", ...START, null)).toBe("");
    expect(g.walker).not.toBeNull();
    expect(g.walker!.graph.cells.has(cellKey(WEST))).toBe(true);
    expect(g.stats.history.latest()).toBe("Set off in Sofia");
    await tick();
    run(g, 30);
    expect(g.walker!.totalM).toBeCloseTo(30 * (5 / 3.6), 3); // 5 km/h on foot
  });

  it("says when the streets can't load", async () => {
    const { g } = game({ fail: true });
    expect(await g.startCity("Sofia, Bulgaria", ...START, null)).toBe("Couldn't load streets. Check your connection and try again.");
    expect(g.problems.warnings.map((w) => w.text)).toContain("Couldn't load the streets where he starts in Sofia, Bulgaria");
  });

  it("walks to a work place and is paid, with a money pop over him", async () => {
    const { g } = game({ places: [CAFE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    let popped = false;
    for (let i = 0; i < 400 && !popped; i++) {
      g.step(1);
      popped = g.pose() === MONEY_POSE;
    }
    expect(popped).toBe(true);
    expect(g.stats.cents).toBe(WORK_CENTS);
    expect(g.stats.xp).toBe(NEW_PLACE_XP);
    expect(g.stats.history.latest()).toBe("Found Cafe Near (+€3, +20 XP)");
    expect(g.debugLog.entries.some((e) => e.place === "Cafe Near")).toBe(true);
    expect(look(g).pose).toBe(MONEY_POSE);
    run(g, POSE_S);
    expect(g.pose()).toBeNull();
  });

  it("gets XP at a green space, and the bonus only the first time", async () => {
    const { g } = game({ places: [PARK] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    run(g, 900);
    expect(g.stats.visited.size).toBe(1);
    expect(g.stats.cents).toBe(0);
    const found = g.stats.history.entries.filter((e) => e.text.startsWith("Found City Garden")).length;
    const reached = g.stats.history.entries.filter((e) => e.text.startsWith("Reached City Garden")).length;
    expect(found).toBe(1);
    let total = g.stats.xp;
    for (let l = 1; l < g.stats.level; l++) total += xpToNext(l);
    expect(total).toBe(NEW_PLACE_XP + GREEN_XP * (found + reached));
    expect(g.pose() === null || g.pose() === XP_POSE).toBe(true);
  });

  it("never heads for a place that gives nothing", async () => {
    const bench = { ...CAFE, name: "A Bench", class: "bench", subclass: "" };
    const { g } = game({ places: [bench] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    run(g, 60);
    expect(g.walker!.place).toBeNull();
    expect(g.debugLog.entries.every((e) => e.place !== "A Bench")).toBe(true);
  });

  it("keeps the walk, money and places across a save", async () => {
    const { g, storage } = game({ places: [CAFE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    run(g, 400);
    g.save();
    const again = reopened(g, storage);
    expect(again.load()).toBe(true);
    expect(again.city).toBe("Sofia, Bulgaria");
    expect(again.walker!.totalM).toBeCloseTo(g.walker!.totalM, 6);
    expect(again.walker!.position()[0]).toBeCloseTo(g.walker!.position()[0], 9);
    expect(again.stats.cents).toBe(g.stats.cents);
    expect(again.stats.visited).toEqual(g.stats.visited);
    expect(again.stats.history.entries.length).toBe(g.stats.history.entries.length);
  });

  it("starts with the route line off and remembers the switch", () => {
    const { g, storage } = game();
    expect(g.showRoute).toBe(false);
    g.setShowRoute(true);
    expect(reopened(g, storage).showRoute).toBe(true);
  });

  it("starts with the camera following him and remembers the switch", () => {
    const { g, storage } = game();
    expect(g.cameraFollows).toBe(true);
    g.setCameraFollows(false);
    expect(reopened(g, storage).cameraFollows).toBe(false);
  });

  it("starts over on reset but keeps the problem log", async () => {
    const { g, storage } = game();
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.problems.warn("kept");
    g.save();
    g.reset();
    expect(g.walker).toBeNull();
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    const again = reopened(g, storage);
    expect(again.load()).toBe(false);
    expect(again.problems.warnings.map((w) => w.text)).toContain("kept");
  });
});
