// The game loop with real Sofia streets, fake servers and fixed dice: wandering, orders, deliveries, the Shop and saves.
import { describe, expect, it } from "vitest";
import { distanceM } from "../../src/core/geo";
import { cellKey } from "../../src/core/graph";
import { MONEY_POSE } from "../../src/core/look";
import { ORDER_WAIT_S, payOf } from "../../src/core/orders";
import { OPENS_AFTER, upgradeOf } from "../../src/core/upgrades";
import { BIKE_MPS } from "../../src/core/walker";
import { Game, MAX_CELLS, POSE_S, RETRY_S, SAVE_KEY, type GameDeps } from "../../src/game/game";
import { hud, look } from "../../src/game/hud";
import { CAFE, empty, game, HOME, PARK, run, START, tick, WEST } from "../support/game";

const reopened = (g: Game, storage: GameDeps["storage"]) => {
  const again = new Game({ ...(g as unknown as { deps: GameDeps }).deps, storage });
  again.problems.quiet = true;
  return again;
};

/** Steps until `done`, a second at a time, letting streets load; false if it never happens. */
async function until(g: Game, done: () => boolean, maxS = 600): Promise<boolean> {
  for (let i = 0; i < maxS && !done(); i++) {
    g.step(1);
    await tick();
  }
  return done();
}

async function started(opts: Parameters<typeof game>[0] = {}) {
  const t = game(opts);
  expect(await t.g.startCity("Sofia, Bulgaria", ...START, null)).toBe("");
  await tick();
  return t;
}

describe("game", () => {
  it("starts riding in a city once the streets there load, at his bike's speed", async () => {
    const { g } = await started();
    expect(g.walker!.graph.cells.has(cellKey(WEST))).toBe(true);
    expect(g.stats.history.latest()).toBe("Set off on his bike in Sofia");
    run(g, 10);
    expect(g.walker!.totalM).toBeCloseTo(10 * BIKE_MPS, 3);
  });

  it("wanders with no order, then an order comes: a food place near him, then a house number", async () => {
    const { g } = await started({ places: [CAFE, PARK] });
    expect(g.job.order).toBeNull();
    expect(hud(g)!.order).toBeNull();
    expect(await until(g, () => !!g.job.order)).toBe(true);
    const o = g.job.order!;
    expect(o.from.name).toBe("Cafe Near");
    expect(o.to.number).toBe("12");
    expect(o.to.street).not.toBe("");
    expect(o.cents).toBe(payOf(o.dropM));
    expect(g.walker!.place?.name).toBe("Cafe Near");
    expect(g.stats.history.latest()).toMatch(/^New order: pick up at Cafe Near for .+ 12 \(€[\d.]+\)$/);
    expect(g.debugLog.entries.at(-1)).toMatchObject({ order: true, from: "Cafe Near", food: 1, doors: 1 });
    expect(look(g).bubble).toBe("☕");
  });

  it("picks up at the restaurant, delivers to the door and is paid there, with a money pop", async () => {
    const { g } = await started({ places: [CAFE] });
    await until(g, () => !!g.job.order);
    const o = g.job.order!;
    expect(await until(g, () => !!g.job.order?.picked)).toBe(true);
    expect(g.stats.history.latest()).toBe("Picked up the food at Cafe Near");
    expect(look(g).bubble).toBe("🏠");
    expect(await until(g, () => g.stats.deliveries === 1)).toBe(true);
    expect(g.stats.cents).toBe(o.cents);
    expect(g.pose()).toBe(MONEY_POSE);
    expect(g.stats.history.latest()).toMatch(/^Delivered to .+ 12: \+€[\d.]+$/);
    expect(g.stats.visited.size).toBe(2);
    expect(g.job.order).toBeNull();
    expect(g.job.waitLeftS).toBeGreaterThan(0);
    run(g, POSE_S);
    expect(g.pose()).toBeNull();
  });

  it("delivers to a street corner where the map has no house numbers", async () => {
    const { g } = await started({ places: [CAFE], homes: [] });
    await until(g, () => !!g.job.order);
    expect(g.job.order!.to.number).toBe("");
    expect(g.debugLog.entries.at(-1)).toMatchObject({ street_doors: true });
  });

  it("gets no order with no place of note loaded, and tries again soon", async () => {
    const { g } = await started({ places: [] });
    g.job.waitLeftS = 0.5;
    run(g, 1);
    expect(g.job.order).toBeNull();
    expect(g.job.waitLeftS).toBe(RETRY_S);
  });

  it("cancels an order he can't get to, unpaid, and waits for the next", async () => {
    const { g } = await started({ places: [CAFE] });
    await until(g, () => !!g.job.order);
    // The customer is across water, as it were: the trip limit runs out first.
    g.job.order!.picked = true;
    g.job.order!.to = { ...HOME, lat: 42.6935, lon: 23.3215 };
    g.walker!.goTo({ name: "Island", class: "home", subclass: "", rank: 99, lat: 42.6935, lon: 23.3215 });
    g.walker!.tripM = 1e9;
    expect(await until(g, () => !g.job.order, 5)).toBe(true);
    expect(g.stats.cents).toBe(0);
    expect(g.stats.history.latest()).toMatch(/^Couldn't get to .+, so the order was cancelled$/);
    expect(g.debugLog.entries.at(-1)).toMatchObject({ cancelled: true });
  });

  it("brings a new order at once on the Debug button", async () => {
    const { g } = await started({ places: [CAFE] });
    g.debugNewOrder();
    expect(g.job.order?.from.name).toBe("Cafe Near");
    expect(g.debugLog.entries.at(-1)).toMatchObject({ forced: "order" });
  });

  it("says when the streets can't load", async () => {
    const { g } = game({ fail: true });
    expect(await g.startCity("Sofia, Bulgaria", ...START, null)).toBe("Couldn't load streets. Check your connection and try again.");
    expect(g.problems.warnings.map((w) => w.text)).toContain("Couldn't load the streets where he starts in Sofia, Bulgaria");
  });

  it("gets a fresh street map around him past MAX_CELLS cells, still on the same order", async () => {
    const { g } = await started({ places: [CAFE] });
    await until(g, () => !!g.job.order);
    const here = g.walker!.position();
    const far = (i: number) => ({ x: 9000 + i, y: 6000 });
    for (let i = 0; i <= MAX_CELLS; i++) g.walker!.graph.addCell(far(i), empty());
    run(g, 1);
    const w = g.walker!;
    expect(w.graph.cells.has(cellKey(far(0)))).toBe(false);
    expect(w.graph.cells.size).toBeLessThanOrEqual(9);
    expect(distanceM(...w.position(), ...here)).toBeLessThan(20);
    expect(w.place?.name).toBe("Cafe Near");
    expect(await until(g, () => g.stats.deliveries === 1)).toBe(true);
  });

  it("keeps the order, money, upgrades and places across a save, and delivers after a reload", async () => {
    const { g, storage } = await started({ places: [CAFE] });
    await until(g, () => !!g.job.order?.picked);
    g.stats.cents = 1000;
    g.buy("speed");
    g.save();
    const again = reopened(g, storage);
    expect(again.load()).toBe(true);
    expect(again.job.order).toEqual(g.job.order);
    expect(again.stats.upgrades).toEqual({ speed: 1 });
    expect(again.walker!.speedMps).toBeCloseTo(BIKE_MPS * 1.1, 6);
    expect(again.walker!.position()[0]).toBeCloseTo(g.walker!.position()[0], 9);
    expect(again.stats.visited).toEqual(g.stats.visited);
    expect(await until(again, () => again.stats.deliveries === 1)).toBe(true);
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
    const { g, storage } = await started();
    g.problems.warn("kept");
    g.save();
    g.reset();
    expect(g.walker).toBeNull();
    expect(g.job.order).toBeNull();
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    const again = reopened(g, storage);
    expect(again.load()).toBe(false);
    expect(again.problems.warnings.map((w) => w.text)).toContain("kept");
  });
});

describe("the Shop", () => {
  it("sells a 10% faster bike for money, and nothing he can't afford or hasn't opened", async () => {
    const { g } = await started();
    const speed = upgradeOf("speed")!;
    expect(g.buy("speed")).toBe(false);
    g.stats.cents = speed.cents;
    expect(g.buy("speed")).toBe(true);
    expect(g.stats.cents).toBe(0);
    expect(g.walker!.speedMps).toBeCloseTo(BIKE_MPS * 1.1, 6);
    g.stats.cents = 1e6;
    expect(g.buy("orders")).toBe(false);
  });

  it("opens the order upgrade after 10 speed upgrades, and it brings orders sooner", async () => {
    const { g } = await started();
    g.stats.cents = 1e6;
    for (let i = 0; i < OPENS_AFTER; i++) g.buy("speed");
    expect(g.walker!.speedMps).toBeCloseTo(BIKE_MPS * 1.1 ** OPENS_AFTER, 6);
    g.job.waitLeftS = ORDER_WAIT_S * 100;
    expect(g.buy("orders")).toBe(true);
    expect(g.job.waitLeftS).toBeCloseTo(ORDER_WAIT_S * 90, 6);
    expect(g.stats.history.latest()).toMatch(/^Bought 📱 Delivery app boost #1 for €[\d.]+: orders come 10% sooner$/);
  });

  it("two deliveries of the shortest drop pay for the first upgrade", () => {
    expect(2 * payOf(300)).toBeGreaterThanOrEqual(upgradeOf("speed")!.cents);
  });
});
