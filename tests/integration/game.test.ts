// The game loop with real Sofia streets, fake servers and fixed dice: cards, walking, rewards, levels and saves.
import { describe, expect, it } from "vitest";
import { offerFor } from "../../src/core/cards";
import { distanceM } from "../../src/core/geo";
import { cellKey } from "../../src/core/graph";
import { MONEY_POSE, XP_POSE } from "../../src/core/look";
import { NEW_PLACE_XP } from "../../src/core/places";
import type { Place } from "../../src/core/stats";
import { BIKE_SPEED_X, upgradeOf } from "../../src/core/upgrades";
import { WALK_MPS } from "../../src/core/walker";
import { Game, POSE_S, SAVE_KEY, type GameDeps } from "../../src/game/game";
import { hud, look } from "../../src/game/hud";
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
    run(g, 2);
    g.pick(0);
    run(g, 30);
    expect(g.walker!.totalM).toBeCloseTo(30 * (5 / 3.6), 3); // 5 km/h on foot
  });

  it("deals cards where he stands and waits for your pick", async () => {
    const { g } = game();
    await g.startCity("Sofia, Bulgaria", ...START, null);
    run(g, 60);
    expect(g.walker!.totalM).toBe(0);
    expect(g.choice.offer.map((o) => o.place.name).sort()).toEqual(["Cafe Near", "City Garden"]);
    expect(hud(g)!.waiting).toBe("pick");
    const dealt = g.debugLog.entries.filter((e) => Array.isArray(e.dealt));
    expect(dealt).toHaveLength(1);
  });

  it("says when the streets can't load", async () => {
    const { g } = game({ fail: true });
    expect(await g.startCity("Sofia, Bulgaria", ...START, null)).toBe("Couldn't load streets. Check your connection and try again.");
    expect(g.problems.warnings.map((w) => w.text)).toContain("Couldn't load the streets where he starts in Sofia, Bulgaria");
  });

  it("walks to the picked work place and is paid what its card said, with a money pop", async () => {
    const { g } = game({ places: [CAFE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    run(g, 1);
    const card = g.choice.offer[0]!;
    expect(card.reward.cents).toBeGreaterThan(0);
    expect(card.reward.xp).toBe(NEW_PLACE_XP);
    g.pick(0);
    expect(g.choice.offer).toEqual([]);
    expect(g.walker!.place?.name).toBe("Cafe Near");
    let popped = false;
    for (let i = 0; i < 400 && !popped; i++) {
      g.step(1);
      popped = g.pose() === MONEY_POSE;
    }
    expect(popped).toBe(true);
    expect(g.stats.cents).toBe(card.reward.cents);
    expect(g.stats.xp).toBe(NEW_PLACE_XP);
    expect(g.stats.history.latest()).toMatch(/^Found Cafe Near \(\+€[\d.]+, \+20 XP\)$/);
    expect(g.debugLog.entries.some((e) => e.picked === 1 && e.place === "Cafe Near")).toBe(true);
    expect(look(g).pose).toBe(MONEY_POSE);
    run(g, POSE_S);
    expect(g.pose()).toBeNull();
  });

  it("gets XP at a green space, the bonus only the first time", async () => {
    const { g } = game({ places: [PARK] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    const visit = () => {
      for (let i = 0; i < 120 && !g.choice.offer.length; i++) g.step(1);
      const card = g.choice.offer[0]!;
      g.pick(0);
      for (let i = 0; i < 600 && g.walker!.place; i++) g.step(1);
      return card;
    };
    const first = visit();
    expect(first.isNew).toBe(true);
    expect(g.stats.xp).toBe(first.reward.xp);
    expect(g.stats.cents).toBe(0);
    expect(g.pose() === XP_POSE).toBe(true);
    // A recent pick isn't dealt again; forget it, as after a few other picks.
    g.choice.recent = [];
    g.debugNewCards();
    const second = visit();
    expect(second.isNew).toBe(false);
    expect(first.reward.xp - second.reward.xp).toBeGreaterThanOrEqual(NEW_PLACE_XP - 5);
    expect(g.stats.visited.size).toBe(1);
  });

  it("deals no card for a place that gives nothing, and walks to a random spot", async () => {
    const bench = { ...CAFE, name: "A Bench", class: "bench", subclass: "" };
    const { g } = game({ places: [bench] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    run(g, 60);
    expect(g.choice.offer).toEqual([]);
    expect(g.walker!.place).toBeNull();
    expect(g.walker!.totalM).toBeGreaterThan(0);
    expect(g.debugLog.entries.some((e) => "fallback" in e)).toBe(true);
  });

  it("says so when he can't get to a picked place, pays nothing and deals again", async () => {
    const { g } = game({ places: [CAFE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    run(g, 1);
    g.pick(0);
    run(g, 2);
    // As if the way round dragged on past the limit: he gives up at the next corner.
    g.walker!.tripM = 1e9;
    g.walker!.route = [];
    g.walker!.routeArrives = false;
    run(g, 60);
    expect(g.stats.history.entries.some((e) => e.text === "Couldn't get to Cafe Near, so nothing there")).toBe(true);
    expect(g.stats.cents).toBe(0);
    expect(g.choice.going).toBeNull();
  });

  it("deals new cards at the next corner on the Debug button, even mid-walk", async () => {
    const { g } = game();
    await g.startCity("Sofia, Bulgaria", ...START, null);
    run(g, 1);
    g.pick(0);
    run(g, 3);
    g.debugNewCards();
    expect(g.walker!.goal).toBeNull();
    expect(g.choice.offer).toEqual([]);
    run(g, 60);
    expect(g.walker!.toNode).toBeNull();
    expect(g.choice.offer.length).toBeGreaterThan(0);
    expect(g.debugLog.entries.at(-1)).toMatchObject({ forced: "cards" });
  });

  it("pays a walk from an older save, with no card, for what he walked", async () => {
    const { g } = game({ places: [CAFE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    run(g, 1);
    g.pick(0);
    g.choice.going = null;
    for (let i = 0; i < 400 && g.walker!.place; i++) g.step(1);
    expect(g.stats.cents).toBeGreaterThan(0);
    expect(g.stats.xp).toBe(NEW_PLACE_XP);
  });

  it("keeps the cards on offer across a save, so a reload doesn't deal new ones", async () => {
    const { g, storage } = game();
    await g.startCity("Sofia, Bulgaria", ...START, null);
    run(g, 1);
    g.save();
    const again = reopened(g, storage);
    again.load();
    expect(again.choice.offer).toEqual(g.choice.offer);
    run(again, 5);
    expect(again.debugLog.entries.filter((e) => Array.isArray(e.dealt))).toHaveLength(1);
  });

  it("keeps the walk, money and places across a save", async () => {
    const { g, storage } = game({ places: [CAFE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    run(g, 1);
    g.pick(0);
    run(g, 60);
    g.save();
    const again = reopened(g, storage);
    expect(again.load()).toBe(true);
    expect(again.city).toBe("Sofia, Bulgaria");
    expect(again.walker!.totalM).toBeCloseTo(g.walker!.totalM, 6);
    expect(again.walker!.position()[0]).toBeCloseTo(g.walker!.position()[0], 9);
    expect(again.stats.cents).toBe(g.stats.cents);
    expect(again.stats.visited).toEqual(g.stats.visited);
    expect(again.stats.history.entries.length).toBe(g.stats.history.entries.length);
    expect(again.choice.going).toEqual(g.choice.going);
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

describe("upgrades", () => {
  const BIKES: Place = { name: "Bike Shop", class: "bicycle", subclass: "bicycle", rank: 1, lat: 42.6878, lon: 23.3205 };
  const STATION: Place = { name: "Serdika", class: "railway", subclass: "subway", rank: 1, lat: 42.6878, lon: 23.3205 };
  const BAKERY: Place = { name: "Bakery Far", class: "bakery", subclass: "bakery", rank: 1, lat: 42.6905, lon: 23.3262 };
  /** Walks until he has no goal left. */
  const walk = (g: Game) => {
    for (let i = 0; i < 900 && (g.walker!.place || g.walker!.toNode !== null); i++) g.step(1);
  };

  it("deals the bike shop once he has the level and money, buys the bike there and rides faster", async () => {
    const { g, storage } = game({ places: [CAFE, PARK, BIKES] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    const bike = upgradeOf("bike")!;
    g.stats.upgrades.add("map");
    g.stats.level = bike.level;
    g.stats.cents = bike.cents + 100;
    run(g, 1);
    const i = g.choice.offer.findIndex((o) => o.upgrade === "bike");
    expect(g.choice.offer[i]!.place.name).toBe("Bike Shop");
    g.pick(i);
    walk(g);
    expect(g.stats.upgrades.has("bike")).toBe(true);
    expect(g.stats.cents).toBe(100);
    expect(g.walker!.speedMps).toBeCloseTo(WALK_MPS * BIKE_SPEED_X, 9);
    expect(g.stats.history.latest()).toMatch(/^Bought a 🚲 Bike at Bike Shop/);
    // A reload keeps the bike.
    g.save();
    const again = reopened(g, storage);
    again.load();
    expect(again.walker!.speedMps).toBeCloseTo(WALK_MPS * BIKE_SPEED_X, 9);
  });

  it("takes a parcel from its pick-up on to its drop-off and is paid there", async () => {
    const { g } = game({ places: [CAFE, BAKERY] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    run(g, 1);
    g.choice.offer = [{ ...offerFor(CAFE, g.walker!.position(), "parcel", true), reward: { cents: 900, xp: 40 }, to: BAKERY }];
    g.pick(0);
    for (let i = 0; i < 900 && g.walker!.place?.name !== "Bakery Far"; i++) g.step(1);
    expect(g.stats.history.latest()).toBe("Picked up a parcel for Bakery Far");
    expect(g.stats.cents).toBe(0);
    expect(g.stats.xp).toBe(0);
    walk(g);
    expect(g.stats.cents).toBe(900);
    expect(g.stats.xp).toBe(40);
    expect(g.stats.visited.size).toBe(2);
  });

  it("rides the metro from the station to the far side and deals cards there", async () => {
    const { g } = game({ places: [CAFE, PARK, STATION] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    // The streets east load too, as the city's places do.
    for (let i = 0; i < 5; i++) {
      run(g, 1);
      await tick();
    }
    expect(g.walker!.graph.cells.has(cellKey({ x: 9254, y: 6039 }))).toBe(true);
    const far: Place = { ...PARK, name: "Far Park", lat: 42.69, lon: 23.345 };
    g.choice.offer = [{ ...offerFor(STATION, g.walker!.position(), "metro", true), reward: { cents: 0, xp: 0 }, to: far }];
    g.pick(0);
    walk(g);
    const here = g.walker!.position();
    expect(distanceM(here[0], here[1], far.lat, far.lon)).toBeLessThan(300);
    expect(g.stats.history.latest()).toBe("Rode the metro to Far Park");
  });

  it("takes the train to another city, keeping all he has, or stays", async () => {
    const { g } = game({ places: [CAFE, PARK, STATION] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    run(g, 1);
    g.choice.offer = [{ ...offerFor(STATION, g.walker!.position(), "train", true), reward: { cents: 0, xp: 0 } }];
    g.stats.cents = 1234;
    g.pick(0);
    walk(g);
    run(g, 5);
    expect(g.choice.train).toBe(true);
    expect(hud(g)!.waiting).toBe("train");
    expect(g.choice.offer).toEqual([]);
    // Nowhere to walk there: he stays at the station.
    const old = g.walker;
    expect(await g.travel("Nowhere", 10, 10, null)).not.toBe("");
    expect(g.walker).toBe(old);
    expect(g.choice.train).toBe(true);
    expect(await g.travel("Sofia East, Bulgaria", 42.69, 23.345, null)).toBe("");
    expect(g.city).toBe("Sofia East, Bulgaria");
    expect(g.stats.cents).toBe(1234);
    expect(g.choice.train).toBe(false);
    expect(g.stats.history.latest()).toBe("Took the train to Sofia East");
    // New city while the train's streets load: the new game wins.
    const riding = g.travel("Sofia, Bulgaria", ...START, null);
    g.reset();
    expect(await riding).toBe("");
    expect(g.walker).toBeNull();
    expect(g.stats.cents).toBe(0);
    await g.startCity("Sofia, Bulgaria", ...START, null);
    // At a station again, he can stay instead.
    g.choice.train = true;
    g.stayHere();
    expect(g.choice.train).toBe(false);
  });
});

