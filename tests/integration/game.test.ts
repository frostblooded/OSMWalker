// The game loop with real Sofia streets, fake servers and fixed dice.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
// Loaded up front, so the game's own import() of it is instant and never runs past DILEMMA_WAIT_MS on a slow machine.
import "../../src/core/dilemmas";
import { distanceM, type Tile } from "../../src/core/geo";
import { cellKey, type Cell } from "../../src/core/graph";
import { fromPbf } from "../../src/core/ofm";
import { decode, encode } from "../../src/core/postcard";
import type { Forecast } from "../../src/core/forecast";
import { EXPLORE_PULL } from "../../src/core/activities";
import * as Items from "../../src/core/items";
import { Rng } from "../../src/core/rng";
import type { Place } from "../../src/core/stats";
import { cityBounds, parseAirports, parseCities, type City } from "../../src/core/trips";
import { EXTRAS } from "../../src/core/poiGen";
import { Game, MADE_CITIES, RIVAL_OFFSET_DEG, SAVE_KEY, type GameDeps } from "../../src/game/game";
import { doing, facts, hud, look } from "../../src/game/hud";
import { Api } from "../../src/net/api";
import type { LoadFn } from "../../src/streets/client";
import { dataFile } from "../support/data";

const WEST: Tile = { x: 9253, y: 6039 };
const START: [number, number] = [42.687, 23.319];
const CAFE: Place = { name: "Cafe Near", class: "cafe", subclass: "cafe", rank: 1, lat: 42.6885, lon: 23.3215 };
const BUS: Place = { name: "Central Bus", class: "bus", subclass: "bus_station", rank: 1, lat: 42.6862, lon: 23.3172 };
const CITIES = "Sofia\tBGR\tBulgaria\t42.6975\t23.3241\t1200000\nPlovdiv\tBGR\tBulgaria\t42.15\t24.75\t340000\nParis\tFRA\tFrance\t48.85\t2.35\t2100000\nVidin\tBGR\tBulgaria\t43.99\t22.88\t1\n";

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
  const g = new Game({ api, load: streets(opts.places, opts.fail).load, data, storage, rng: new Rng(3), cardRng: new Rng(4), rollSource: () => opts.roll ?? 0.99, hour: () => 12, ...opts });
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

  it("opens a care package at the place he reaches next", async () => {
    const { g } = game({ places: [CAFE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.care.clovers = 2;
    g.sendGift("guide");
    expect(g.stats.care.clovers).toBe(0);
    run(g, 400);
    const texts = g.stats.history.entries.map((e) => e.text);
    const reached = texts.findIndex((t) => t.startsWith("Reached Cafe Near"));
    expect(texts[reached + 1]).toBe("Opened your care package: 📖 City guide! Thank you! (+2 Wits for 4 h)");
    expect(g.stats.buffNames()).toContain("City guide");
  });

  it("writes a postcard of where he is, signed with a name that is remembered", async () => {
    const { g, storage } = game({ places: [CAFE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    run(g, 400);
    g.setPostcardName("Ivan");
    const card = g.postcard();
    expect(card).toMatchObject({ from: "Ivan", city: "Sofia, Bulgaria", level: g.stats.level, line: g.stats.history.latest() });
    expect(card.place).toBe(g.walker!.place?.name ?? g.walker!.streetName());
    expect(decode(encode(card))).toEqual(card);
    const again = new Game({ ...(g as unknown as { deps: GameDeps }).deps, storage });
    expect(again.postcardName).toBe("Ivan");
  });

  it("says when the streets can't load", async () => {
    const { g } = game({ fail: true });
    expect(await g.startCity("Sofia, Bulgaria", ...START, null)).toBe("Couldn't load streets. Check your connection and try again.");
    expect(g.problems.warnings.map((w) => w.text)).toContain("Couldn't load the streets where he starts in Sofia, Bulgaria");
  });

  it("a strong need picks his goal and the feed says so", async () => {
    const { g } = game({ places: [CAFE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.meters.thirst = 5;
    g.walker!.forceNewGoal();
    expect(g.stats.history.entries.some((e) => e.text === "Thirsty, heading for Cafe Near")).toBe(true);
  });

  it("hands his stats the jokes and forecasts, and jokes fit the kind of place", async () => {
    const { g } = game({ places: [CAFE] });
    const forecasts: Forecast[] = [{ id: "cafe", icon: "☕", text: "Cafés feel {n} as good today", effect: "mood", kind: "cafe", mult: 2 }];
    Object.assign(g.data, { jokes: { cafe: ["Cafe joke."], _generic: ["Other joke."] }, forecasts });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    expect(g.stats.forecast().id).toBe("cafe");
    run(g, 3 * 3600);
    const texts = g.stats.history.entries.map((e) => e.text);
    expect(texts.some((t) => / at Cafe Near.* Cafe joke\.$/.test(t))).toBe(true);
    expect(texts.some((t) => / at Cafe Near.* Other joke\.$/.test(t))).toBe(false);
  });

  it("hands his stats the incident deck, and the storyteller brings one at a place he reaches, on its own dice", async () => {
    const plain = game({ places: [CAFE] }).g;
    await plain.startCity("Sofia, Bulgaria", ...START, null);
    const { g } = game({ places: [CAFE] });
    Object.assign(g.data, { incidents: [{ id: "dog", icon: "🐕", tone: "good", text: "A dog at {PLACE}.", say: "It wags." }, { id: "mime", icon: "🤡", tone: "odd", text: "A mime at {PLACE}.", say: "He copies him." }] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    expect(g.stats.incidents).toHaveLength(2);
    plain.stats.story.tension = g.stats.story.tension = 100;
    run(plain, 3 * 3600);
    run(g, 3 * 3600);
    const texts = g.stats.history.entries.map((e) => e.text);
    expect(texts.some((t) => /^(🐕 A dog|🤡 A mime) at Cafe Near/.test(t))).toBe(true);
    // His walk is the same as without incidents.
    expect(g.walker!.totalM).toBeCloseTo(plain.walker!.totalM, 6);
  });

  it("rolls the city's quest board, shows it on the map, takes a quest on and walks its steps", async () => {
    const cafes = Array.from({ length: 20 }, (_, i): Place => ({ ...CAFE, name: `Cafe ${i}`, lat: CAFE.lat + (i % 5) * 0.0004, lon: CAFE.lon - Math.floor(i / 5) * 0.0005 }));
    const { g, storage } = game({ places: [...cafes, BUS] });
    const quest = { id: "q", icon: "🧪", title: "Test quest", items: ["a box"], lean: "wit", twists: [], good: ["Good."], worse: ["Worse."], reward: { eur: 10 }, steps: [{ at: ["cafe"], say: ["{GIVER} at {PLACE} has {ITEM}."] }, { at: ["bus"], say: ["He takes {ITEM} to {PLACE}."] }] };
    Object.assign(g.data, { quests: { names: ["Ana"], quests: [quest], events: [] } });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    run(g, 2 * 3600);
    const texts = g.stats.history.entries.map((e) => e.text);
    expect(texts).toContain("❗ New quest: Test quest, for Ana at " + texts.find((t) => t.startsWith("❗ New quest"))!.split(" at ").at(-1));
    expect(texts.some((t) => t === "🧪 He takes a box to Central Bus.")).toBe(true);
    expect(g.stats.quests.log.at(-1)?.title).toBe("Test quest");
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).stats.quests.done).toContain("q:Ana:0");
  });

  it("a tapped quest icon tells its story, and Go help sends him to it next", async () => {
    const cafes = Array.from({ length: 20 }, (_, i): Place => ({ ...CAFE, name: `Cafe ${i}`, lat: CAFE.lat + (i % 5) * 0.0004, lon: CAFE.lon - Math.floor(i / 5) * 0.0005 }));
    const { g } = game({ places: [...cafes, BUS] });
    const q = (id: string) => ({ id, icon: "🧪", title: `Quest ${id}`, items: ["a box"], lean: "wit", twists: [], good: ["Good."], worse: ["Worse."], reward: {}, steps: [{ at: ["cafe"], say: ["{GIVER} at {PLACE} has {ITEM}."] }, { at: ["bus"], say: ["At {PLACE}."] }] });
    Object.assign(g.data, { quests: { names: ["Ana"], quests: [q("a"), q("b")], events: [] } });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    run(g, 60);
    g.walker!.forceNewGoal();
    expect(g.stats.quests.board.length).toBe(2);
    const icon = g.questIcons().find((i) => i.icon === "quest")!;
    expect(g.placeIcons()).toContainEqual(icon);
    const card = g.storyCard(icon.id)!;
    expect(card.text).toMatch(/^Ana at Cafe \d+ has a box\.$/);
    expect(card.state).toBe("open");
    g.nudge(icon.id);
    expect(g.storyCard(icon.id)!.state).toBe("nudged");
    g.walker!.forceNewGoal();
    expect(`quest:${g.stats.quests.active?.key}`).toBe(icon.id);
    expect(g.questIcons().some((i) => i.pulse)).toBe(true);
    const on = g.storyCard(icon.id)!;
    expect(on.state).toBe("on");
    expect(on.rows[0]).toEqual(["👣 Step", `1 / 2`]);
  });

  it("hands his stats the contests, and gives Viktor his chance at each stop with no incident", async () => {
    const { g } = game({ places: [CAFE] });
    Object.assign(g.data, { incidents: [{ id: "dog", icon: "🐕", tone: "good", text: "A dog at {PLACE}.", say: "It wags." }], contests: JSON.parse(dataFile("rival.json")) });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    expect(g.stats.contests.length).toBeGreaterThan(0);
    const meet = vi.spyOn(g.stats.rival, "meet");
    run(g, 400);
    // He reached the cafe with no incident (no tension yet), so Viktor got his chance there, with the contests.
    expect(meet).toHaveBeenCalledWith(g.stats, g.stats.contests, "Cafe Near", "cafe", [CAFE.lat, CAFE.lon], expect.anything());
  });

  it("hands his stats the friends data, and gives a friend a chance at each stop with no incident or Viktor", async () => {
    const { g } = game({ places: [CAFE] });
    Object.assign(g.data, { incidents: [{ id: "dog", icon: "🐕", tone: "good", text: "A dog at {PLACE}.", say: "It wags." }], friends: JSON.parse(dataFile("friends.json")) });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    expect(g.stats.friendData.names.length).toBeGreaterThan(0);
    const stop = vi.spyOn(g.stats.friends, "stop");
    run(g, 400);
    expect(stop).toHaveBeenCalledWith(expect.objectContaining({ city: g.stats.where.city, place: "Cafe Near", kind: "cafe" }), g.stats.friendData, expect.anything());
  });

  it("shows Viktor beside him for a while after they meet, only in that city", async () => {
    const { g } = game({ places: [CAFE], clock: () => 2_000_000_000_000 });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    expect(g.rivalAt()).toBeNull();
    const r = g.stats.rival;
    Object.assign(r, { town: g.stats.where.city, inTown: true, seenUntil: 2_000_000_000 + 60, seenAt: [42.7, 23.3] });
    expect(g.rivalAt()).toEqual([42.7, 23.3 + RIVAL_OFFSET_DEG]);
    r.seenUntil = 2_000_000_000;
    expect(g.rivalAt()).toBeNull();
  });

  it("switches the storyteller from the menu and keeps it in the save", async () => {
    const { g, storage } = game({ places: [CAFE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    expect(g.stats.story.style).toBe("classic");
    g.nextStoryteller();
    expect(g.stats.story.style).toBe("chaotic");
    g.nextStoryteller();
    expect(g.stats.story.style).toBe("calm");
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).stats.story.style).toBe("calm");
  });

  it("an Explore whisper pulls each place he has never been to, not its whole kind", async () => {
    const OLD: Place = { ...CAFE, name: "Cafe Old", lat: 42.6875, lon: 23.3205 };
    const { g } = game({ places: [OLD, CAFE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.visit(OLD);
    const w = g.walker!;
    const ratio = () => w.weigh(CAFE).weight / w.weigh(OLD).weight;
    const before = ratio();
    [g.stats.bond.nudge, g.stats.bond.nudgeLeft] = ["explore", 600];
    expect(ratio()).toBeCloseTo(before * EXPLORE_PULL);
  });

  it("builds his bench at the park he reaches with enough golden bricks, and marks it on the map", async () => {
    const PARK: Place = { ...CAFE, name: "Park Near", class: "park", subclass: "park" };
    const { g } = game({ places: [PARK] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.bricks.count = 100;
    run(g, 400);
    expect(g.stats.bricks.built).toMatchObject([{ kind: 0, park: "Park Near", city: "Sofia, Bulgaria" }]);
    expect(g.stats.chronicle.lines.map((l) => l.text)).toContain("Built a bench with his name in Park Near, Sofia, Bulgaria");
    expect(g.placeIcons().some((i) => i.icon === "plaque")).toBe(true);
  });

  it("takes whispers and praise from you without touching his walk dice", async () => {
    const { g } = game({ places: [CAFE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    run(g, 400);
    expect(g.lastDeed()).not.toBeNull();
    const walkDice = (g as unknown as { rng: Rng }).rng;
    const next = new Rng(0);
    Object.assign(next, walkDice);
    for (let i = 0; i < 4; i++) g.whisper("eat");
    const whispers = g.stats.history.entries.filter((e) => e.text.startsWith("Heard a whisper"));
    expect(whispers).toHaveLength(3);
    expect(walkDice.randf()).toBe(next.randf());
    g.judge(1);
    g.judge(1);
    expect(g.stats.bond.lean).toBe(10);
  });

  it("walks to a place, does something there and rests", async () => {
    const { g } = game({ places: [CAFE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    run(g, 400);
    expect(g.stats.visited.size).toBeGreaterThan(0);
    expect(g.stats.history.entries.some((e) => e.text.startsWith("Reached Cafe Near"))).toBe(true);
    expect(g.debugLog.entries.some((e) => e.place === "Cafe Near")).toBe(true);
  });

  it("collects keepsakes where he is: a card and a Placedex entry at a landmark", async () => {
    const MUSEUM: Place = { ...CAFE, name: "Museum Near", class: "museum", subclass: "museum", rank: 1 };
    const { g } = game({ places: [MUSEUM] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    expect(g.stats.where).toEqual({ city: "Sofia, Bulgaria", code: "BGR", country: "Bulgaria" });
    run(g, 400);
    expect([...g.stats.keepsakes.cards.values()]).toMatchObject([{ name: "Museum Near", rarity: "Rare", city: "Sofia, Bulgaria" }]);
    expect(g.stats.keepsakes.dex.has("museum/museum")).toBe(true);
  });

  it("strikes a pose for what he does at a place", async () => {
    const { g } = game({ places: [CAFE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    for (let i = 0; i < 400 && !g.walker!.isResting(); i++) run(g, 1);
    expect(g.walker!.isResting()).toBe(true);
    expect(g.doing).not.toBeNull();
    expect(look(g).pose).not.toBeNull();
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

  it("lands jet-lagged after a flight across time zones", async () => {
    const { g } = game();
    await g.startCity("Sofia, Bulgaria", ...START, null);
    const paris = g.trips.cities.find((c) => c.name === "Paris")!;
    g.walker!.startTravel({ ...paris, bounds: cityBounds(paris) }, "plane");
    for (let i = 0; i < 3600 && g.walker!.isTraveling(); i++) g.step(1);
    expect(g.stats.history.entries.some((e) => e.text === "Jet-lagged after flying across 1 time zone")).toBe(true);
    expect(g.stats.buffNames()).toContain("Jet-lagged");
  });

  it("lands fresh after a bus across the same time zones", async () => {
    const { g } = game();
    await g.startCity("Sofia, Bulgaria", ...START, null);
    const paris = g.trips.cities.find((c) => c.name === "Paris")!;
    g.walker!.startTravel({ ...paris, bounds: cityBounds(paris) }, "bus");
    for (let i = 0; i < 3600 && g.walker!.isTraveling(); i++) g.step(1);
    expect(g.stats.where.city).toBe("Paris, France");
    expect(g.stats.buffNames()).not.toContain("Jet-lagged");
  });

  it("doesn't set off on a trip while he is on a quest", async () => {
    const { g } = game({ roll: 0.1 });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.cents = 50_000;
    g.stats.meters.fullness = g.stats.meters.thirst = 100;
    g.skipRoll = false;
    const at = { name: "Cafe Near", class: "cafe", subclass: "cafe", lat: CAFE.lat, lon: CAFE.lon };
    g.stats.quests.active = { key: "q:Ana:0", kind: "q", giver: "Ana", item: 0, twist: -1, at, step: 0, target: at };
    g.debugNewGoal();
    expect(g.walker!.isDeparting()).toBe(false);
  });

  it("walks to the bus station for a trip, pays and rides", async () => {
    const { g } = game({ roll: 0.1 });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.cents = 50_000;
    // Full, so he packs nothing and pays only the fare.
    g.stats.meters.fullness = g.stats.meters.thirst = 100;
    g.skipRoll = false;
    g.debugNewGoal();
    const w = g.walker!;
    expect(w.isDeparting()).toBe(true);
    expect(w.departing!.station.name).toBe("Central Bus");
    expect(g.stats.history.latest()).toContain("Heading to Central Bus for the bus to somewhere in Bulgaria");
    const fare = w.departing!.fare;
    for (let i = 0; i < 600 && !w.isTraveling(); i++) g.step(1);
    expect(w.isTraveling()).toBe(true);
    expect(g.stats.cents).toBe(50_000 - fare);
    expect(g.stats.history.entries.some((e) => e.text.startsWith("Took the bus to Plovdiv"))).toBe(true);
  });

  it("lets you guess where he is going until he boards, and pays a clover for a right guess", async () => {
    const { g } = game({ roll: 0.1 });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.cents = 50_000;
    g.skipRoll = false;
    g.debugNewGoal();
    const guess = g.stats.care.guess!;
    expect(guess.abroad).toBe(false);
    expect([...guess.choices].sort()).toEqual(["Plovdiv", "Vidin"]);
    g.pickGuess("Plovdiv");
    g.pickGuess("Vidin");
    expect(guess.pick).toBe("Plovdiv");
    for (let i = 0; i < 600 && !g.walker!.isTraveling(); i++) g.step(1);
    expect(g.stats.care.clovers).toBe(1);
    expect(g.stats.care.guess).toBeNull();
    expect(g.stats.history.entries.some((e) => e.text === "You guessed it: Plovdiv! (+1 ☘)")).toBe(true);
  });

  it("drops the guess when the trip is called off, and he goes on without one", async () => {
    const { g } = game({ roll: 0.1 });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.cents = 50_000;
    g.skipRoll = false;
    g.debugNewGoal();
    expect(g.stats.care.guess).not.toBeNull();
    g.walker!.departing = null;
    g.step(1);
    expect(g.stats.care.guess).toBeNull();
  });

  it("drops the guess, with no clover, when he can't pay at the station", async () => {
    const { g } = game({ roll: 0.1 });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.cents = 50_000;
    g.skipRoll = false;
    g.debugNewGoal();
    g.pickGuess("Plovdiv");
    expect(g.stats.care.guess!.pick).toBe("Plovdiv");
    g.stats.cents = 0;
    for (let i = 0; i < 600 && g.walker!.isDeparting(); i++) g.step(1);
    expect(g.walker!.isTraveling()).toBe(false);
    expect(g.stats.history.entries.some((e) => e.text.startsWith("Can't afford the bus to Plovdiv"))).toBe(true);
    expect(g.stats.care.guess).toBeNull();
    expect(g.stats.care.clovers).toBe(0);
    expect(g.stats.history.entries.some((e) => /guessed it|^Not /.test(e.text))).toBe(false);
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

  it("shows last week's recap once: closing the away sheet marks it seen", async () => {
    const { g } = game({ places: [CAFE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.week.roll(1, 0, 1, 0);
    g.stats.week.stop("cafe");
    g.stats.week.roll(8 * 86400, 0, 1, 0);
    expect(g.stats.week.pending()).not.toBeNull();
    g.dismissAway();
    expect(g.stats.week.pending()).toBeNull();
  });

  it("wakes in hospital after fainting", async () => {
    const hospital: Place = { name: "St Anna", class: "hospital", subclass: "hospital", rank: 1, lat: 42.688, lon: 23.316 };
    const { g } = game({ places: [hospital, CAFE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.meters.health = 0;
    g.doing = { name: "Nap on a bench", min: 1, fx: { energy: 20 } };
    const coins = g.stats.cents;
    g.step(1);
    expect(g.walker!.place).toEqual(hospital);
    expect(g.walker!.isResting()).toBe(true);
    expect(g.stats.cents).toBeLessThan(coins);
    // He rests at the hospital, but did nothing there to strike a pose for.
    expect(g.doing).toBeNull();
    expect(look(g).pose).toBeNull();
  });

  it("on a broomstick he flies to a park near a far goal, then walks the rest at walking pace", async () => {
    const far: Place = { ...CAFE, name: "Far Cafe", lat: 42.687, lon: 23.33 };
    const park: Place = { name: "Little Park", class: "park", subclass: "park", rank: 1, lat: 42.687, lon: 23.3292 };
    const { g } = game({ places: [far, park] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.equip(Items.build(Items.KINDS.brooms[0]!, Items.MATERIALS[0]!, []));
    await tick();
    const w = g.walker!;
    for (let i = 0; i < 60 && !w.flight; i++) run(g, 1);
    expect(w.flight).not.toBeNull();
    expect(w.flies).toBe(true);
    for (let i = 0; i < 600 && w.flight; i++) run(g, 1);
    expect(w.flight).toBeNull();
    expect(w.afoot).toBe(true);
    run(g, 1);
    expect(w.speedMps).toBeCloseTo(g.stats.speedMps(true), 6);
    expect(w.speedMps).toBeLessThan(g.stats.speedMps() / 2);
  });

  it("a dragon he can't feed sulks: it doesn't show at his side and he walks", async () => {
    const { g } = game();
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.equip(Items.build(Items.KINDS.dragons[0]!, Items.MATERIALS[0]!, []));
    g.stats.cents = 0;
    await tick();
    run(g, 1);
    expect(look(g).mount).toBe("");
    expect(g.walker!.flies).toBe(false);
    g.stats.cents = 100_000;
    run(g, 1);
    expect(look(g).mount).toBe("🐉");
    expect(g.walker!.flies).toBe(true);
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

  it("makes up the must-haves a city lacks once the area is loaded, and keeps them in the save", async () => {
    const { g, storage } = game({ places: [CAFE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    await tick();
    for (let i = 0; i < 5; i++) {
      run(g, 1);
      await tick();
    }
    expect(g.severeNow).toEqual([]);
    expect(g.problems.severe).toEqual([]);
    const made = g.walker!.graph.placesIn(g.walker!.bounds!).filter((p) => p.made);
    // The cafe feeds him and pays; Sofia is capital-sized, so it gets the most extras.
    expect(made.filter((p) => p.must).map((p) => p.subclass)).toEqual(["bus_station", "fuel", "guest_house"]);
    expect(made.filter((p) => p.extra)).toHaveLength(EXTRAS.capital);
    g.save();
    const back = new Game({ ...(g as unknown as { deps: GameDeps }).deps, storage });
    back.problems.quiet = true;
    expect(back.load()).toBe(true);
    expect(back.made["Sofia, Bulgaria"]).toEqual(g.made["Sofia, Bulgaria"]);
  });

  it("keeps the made-up places of the cities he was in most recently", async () => {
    for (const before of [["Sofia, Bulgaria"], []]) {
      const { g } = game({ places: [CAFE] });
      for (const c of before) g.made[c] = [];
      for (let i = 1; Object.keys(g.made).length < MADE_CITIES; i++) g.made[`Town ${i}`] = [];
      await g.startCity("Sofia, Bulgaria", ...START, null);
      for (let i = 0; i < 5; i++) {
        run(g, 1);
        await tick();
      }
      // A city he is back in moves to the end; a new one pushes out the one he left longest ago.
      expect(Object.keys(g.made).at(-1)).toBe("Sofia, Bulgaria");
      expect(Object.keys(g.made)).toHaveLength(MADE_CITIES);
      expect("Town 1" in g.made).toBe(before.length > 0);
    }
  });

  it("still checks the city when its made-up places can't load", async () => {
    vi.resetModules();
    vi.doMock("../../src/core/poiGen", () => {
      throw new Error("offline");
    });
    try {
      const { g } = game({ places: [CAFE] });
      await g.startCity("Sofia, Bulgaria", ...START, null);
      for (let i = 0; i < 30 && !g.severeNow.length; i++) {
        run(g, 1);
        await tick();
      }
      expect(g.made).toEqual({});
      expect(g.severeNow.map((p) => p.title)).toContain("Can't leave Sofia, Bulgaria");
    } finally {
      vi.doUnmock("../../src/core/poiGen");
    }
  });

  it("flags a city with no way out once the area is loaded", async () => {
    const { g } = game({ places: [CAFE] });
    g.made["Sofia, Bulgaria"] = [];
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
    g.made["Sofia, Bulgaria"] = [];
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
    async function reopen(agoMs: number, o: Partial<GameDeps> & { places?: Place[]; roll?: number } = {}, before: (g: Game) => void = () => {}, loaded: (g: Game) => void = () => {}) {
      let now = Date.UTC(2026, 9, 29, 8);
      const { g, storage } = game({ ...o, clock: () => now });
      await g.startCity("Sofia, Bulgaria", ...START, null);
      before(g);
      g.save();
      now += agoMs;
      const again = new Game({ ...(g as unknown as { deps: GameDeps }).deps, storage });
      again.problems.quiet = true;
      again.load();
      loaded(again);
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

    /** A reopen that brings a dilemma (the Debug switch), then made into `id`, offering `city`. */
    async function reopenDilemma(id: string, city: City | null = null) {
      const r = await reopen(5 * HOUR, {}, (g) => g.setAlwaysDilemma(true));
      expect(r.again.dilemma).not.toBeNull();
      r.again.dilemma = { ...r.again.dilemma!, id, city };
      return r;
    }

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

    it("lets a free ride replace a trip he is walking to, with its guess", async () => {
      const { again } = await reopenDilemma("trucker");
      const [plovdiv, vidin] = ["Plovdiv", "Vidin"].map((n) => again.trips.cities.find((c) => c.name === n)!);
      again.dilemma!.city = vidin!;
      const w = again.walker!;
      w.departing = { city: { ...plovdiv!, bounds: cityBounds(plovdiv!) }, mode: "bus", station: null, fare: 1248, arrive: [plovdiv!.lat, plovdiv!.lon], distance_m: 120000 } as unknown as typeof w.departing;
      again.stats.care.guess = { abroad: false, choices: ["Plovdiv", "Vidin"], answer: "Plovdiv", pick: "" };
      again.chooseDilemma(0);
      expect(again.city).toBe("Vidin, Bulgaria");
      expect(w.departing).toBeNull();
      expect(again.stats.care.guess).toBeNull();
    });

    it("still finishes a reopen when the dilemma code can't load", async () => {
      vi.doMock("../../src/core/dilemmas", () => {
        throw new Error("offline");
      });
      try {
        const { again } = await reopen(5 * HOUR, {}, (g) => g.setAlwaysDilemma(true));
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
