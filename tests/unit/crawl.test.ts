// Ruin crawls: rooms passed by attribute rolls, turning back on a fail, loot that gets rarer with depth, once a week per place, and saves.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FEATS } from "../../src/core/collection";
import * as C from "../../src/core/crawl";
import { CRAWL_EVERY_S, getCrawler, isRuin, LOG_SIZE, Ruins, setCrawler, type Log } from "../../src/core/ruins";
import { Rng } from "../../src/core/rng";
import { Stats, visitKey, type Place } from "../../src/core/stats";

const RUIN: Place = { name: "Rozafa Castle", class: "castle", subclass: "ruins", rank: 5, lat: 42.05, lon: 19.49 };
const CAFE: Place = { name: "Café Rila", class: "cafe", subclass: "cafe", rank: 5, lat: 42.7, lon: 23.3 };
/** An Rng whose randf answers come from `rolls` in turn (then 0.5). */
const fixed = (rolls: number[]) => {
  const r = new Rng(1);
  r.randf = () => rolls.shift() ?? 0.5;
  return r;
};

describe("passChance", () => {
  it("rises with the attribute, falls with depth, and stays within its bounds", () => {
    expect(C.passChance(2, 0)).toBeCloseTo(C.ROOM_BASE + 2 * C.ROOM_PER_POINT);
    expect(C.passChance(2, 2)).toBeCloseTo(C.ROOM_BASE + 2 * C.ROOM_PER_POINT - 2 * C.ROOM_DEPTH_CUT);
    expect(C.passChance(100, 0)).toBe(C.ROOM_MAX);
    expect(C.passChance(0, 20)).toBe(C.ROOM_MIN);
  });
});

describe("explore", () => {
  it("passes every room on good rolls and finds something, rarer than a shop's roll", () => {
    const s = new Stats();
    const lines: string[] = [];
    s.onSay = (l) => lines.push(l);
    // Room count roll 0.99 -> MAX_ROOMS; then each room: pick roll, pass roll 0.
    const rolls = [0.99, ...Array.from({ length: C.MAX_ROOMS }, () => [0, 0]).flat(), 0, 0, 0, 0.7];
    const log = C.explore(s, RUIN, fixed(rolls));
    expect(log.of).toBe(C.MAX_ROOMS);
    expect(log.rooms.every((r) => r.won)).toBe(true);
    expect(new Set(log.rooms.map((r) => r.text)).size).toBe(C.MAX_ROOMS);
    // Loot kind, base and material picks, then 0.7 + 5 rooms of DEPTH_RARITY lifts it past the 0.98 three-modifier line.
    expect(log.found?.rarity).toBe("Legendary");
    expect(["weapon", "trinket"]).toContain(log.found?.slot);
    expect(lines.at(-1)).toMatch(new RegExp(`^Found a Legendary .* ${C.MAX_ROOMS} of ${C.MAX_ROOMS} rooms into Rozafa Castle$`));
    expect([...Object.values(s.gear), ...s.bag].some((i) => i?.name === log.found?.name)).toBe(true);
  });

  it("turns back on a failed room, keeps what he found, and costs only energy", () => {
    const s = new Stats();
    const health = s.meters.health;
    const log = C.explore(s, RUIN, fixed([0, 0, 0, 0, 0.999]));
    expect(log.rooms.map((r) => r.won)).toEqual([true, false]);
    expect(log.found).not.toBeNull();
    expect(s.meters.health).toBe(health);
    expect(s.meters.energy).toBe(100 - 2 * C.ROOM_ENERGY - C.FAIL_ENERGY);
  });

  it("leaves with nothing when the first room fails", () => {
    const s = new Stats();
    const lines: string[] = [];
    s.onSay = (l) => lines.push(l);
    const log = C.explore(s, RUIN, fixed([0, 0, 0.999]));
    expect(log.found).toBeNull();
    expect(lines.at(-1)).toBe("Left Rozafa Castle with nothing");
  });
});

describe("Stats.collect crawls ruins", () => {
  beforeEach(() => setCrawler(C.explore));
  afterEach(() => setCrawler(null));

  it("only at castles and ruins, once a week each", () => {
    const s = new Stats();
    let t = 1792972800;
    s.now = () => t;
    const rng = new Rng(3);
    s.collect(CAFE, rng);
    expect(s.ruins.logs).toHaveLength(0);
    s.collect(RUIN, rng);
    expect(s.ruins.logs).toHaveLength(1);
    t += CRAWL_EVERY_S - 1;
    s.collect(RUIN, rng);
    expect(s.ruins.logs).toHaveLength(1);
    t += 1;
    s.collect(RUIN, rng);
    expect(s.ruins.logs).toHaveLength(2);
  });

  it("does nothing before crawl.ts has loaded", () => {
    setCrawler(null);
    const s = new Stats();
    s.collect(RUIN, new Rng(3));
    expect(getCrawler()).toBeNull();
    expect(s.ruins.logs).toHaveLength(0);
  });
});

describe("Ruins", () => {
  const log = (t: number): Log => ({ name: "x", city: "", t, rooms: [], of: 3, found: null });

  it("knows a castle by its class", () => {
    expect(isRuin(RUIN)).toBe(true);
    expect(isRuin({ class: "castle" })).toBe(true);
    expect(isRuin(CAFE)).toBe(false);
  });

  it("keeps the last LOG_SIZE logs and forgets places crawled over a week ago", () => {
    const r = new Ruins();
    for (let i = 0; i < LOG_SIZE + 2; i++) r.done(`p${i}`, log(i));
    expect(r.logs).toHaveLength(LOG_SIZE);
    expect(r.logs[0]!.t).toBe(2);
    expect(r.count).toBe(LOG_SIZE + 2);
    r.done("late", log(CRAWL_EVERY_S + 20));
    expect(Object.keys(r.last)).toEqual(["late"]);
  });

  it("the Delver badge counts every crawl of his life", () => {
    const s = new Stats();
    const delver = FEATS.find((f) => f.id === "ruins")!;
    expect(delver.count(s)).toBe(0);
    for (let i = 0; i < LOG_SIZE + 1; i++) s.ruins.done(`p${i}`, log(i));
    expect(delver.count(s)).toBe(LOG_SIZE + 1);
  });

  it("round-trips through JSON, and stats saved before ruins load with none", () => {
    const r = new Ruins();
    r.done(visitKey(RUIN), log(10));
    expect(Ruins.fromJSON(JSON.parse(JSON.stringify(r))).toJSON()).toEqual(r.toJSON());
    const d = JSON.parse(JSON.stringify(new Stats()));
    delete d.ruins;
    expect(Stats.fromJSON(d).ruins.logs).toEqual([]);
  });
});
