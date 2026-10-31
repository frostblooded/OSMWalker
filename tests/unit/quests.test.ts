// Quests and world events (src/core/quests.ts, data/quests.json): the board, taking a quest on, its steps, events and the catch-up.
import { describe, expect, it } from "vitest";
import { Activities } from "../../src/core/activities";
import { catchUp, type AwayCity } from "../../src/core/catchup";
import { bboxAround } from "../../src/core/geo";
import * as Q from "../../src/core/quests";
import { Rng } from "../../src/core/rng";
import { ATTRS, Stats, type Place } from "../../src/core/stats";
import { parseAirports, parseCities, Trips } from "../../src/core/trips";
import { dataFile } from "../support/data";
import { skyAt } from "../../src/core/sky";
import { hourSky } from "../support/sky";

const BANK = JSON.parse(dataFile("quests.json")) as Q.Bank;
const ACTIONS = JSON.parse(dataFile("actions.json")) as Record<string, unknown>;
const CITY_QUESTS = JSON.parse(dataFile("city-quests.json")) as Q.QuestKind[];
const HERE: [number, number] = [48.85, 2.35];
/** A place `east` hundred meters east of HERE. */
const place = (name: string, cls: string, east = 1, sub = cls): Place => ({ name, class: cls, subclass: sub, rank: 1, lat: HERE[0], lon: HERE[1] + east * 0.00137 });
/** A small town: one of each kind a few hundred meters apart, enough for the board to roll. */
const KINDS = ["post", "cafe", "library", "bakery", "park", "museum", "shop", "restaurant", "grocery", "lodging", "railway", "bus", "school", "hospital", "pharmacy", "bar", "town_hall", "fountain", "place_of_worship", "notice_board", "veterinary", "police"];
const TOWN = KINDS.map((k, i) => place(`The ${k}`, k, (i % 6) + 1));
const fresh = (bank: Q.Bank = BANK) => {
  const s = new Stats();
  s.quests.bank = bank;
  s.where = { city: "Testville, France", code: "FR", country: "France" };
  let t = 1_000_000;
  s.now = () => t;
  return { s, tick: (min: number) => (t += min * 60) };
};
const one = (k: Partial<Q.QuestKind> = {}): Q.QuestKind => ({
  id: "q", icon: "🧪", title: "Test quest", items: ["a box"], lean: "wit", twists: [], good: ["Good."], worse: ["Worse."], reward: { eur: 10, xp: 20 },
  steps: [{ at: ["post"], say: ["{GIVER} at {PLACE} has {ITEM}."] }, { at: ["cafe"], say: ["At {PLACE}."] }],
  ...k,
});

describe("the quest bank", () => {
  it("has no unknown places, broken follow-ups or empty lines", () => {
    expect(Q.check(BANK, new Set(Object.keys(ACTIONS)), ATTRS)).toEqual([]);
  });

  it("is big enough for thousands of distinct quests, about one in four with magic, and a treasure map", () => {
    const variants = BANK.quests.reduce((n, q) => n + q.items.length * BANK.names.length * Math.max(q.twists.length, 1), 0);
    expect(BANK.quests.length).toBeGreaterThanOrEqual(50);
    expect(variants).toBeGreaterThan(10_000);
    const share = (list: { fantasy?: boolean }[]) => list.filter((x) => x.fantasy).length / list.length;
    expect(share(BANK.quests)).toBeGreaterThan(0.2);
    expect(share(BANK.quests)).toBeLessThan(0.3);
    expect(share(BANK.events)).toBeGreaterThan(0.2);
    expect(share(BANK.events)).toBeLessThan(0.3);
    expect(BANK.quests.some((q) => q.id === "treasure_map")).toBe(true);
    expect(BANK.events.length).toBeGreaterThanOrEqual(40);
  });

  it("catches bad data", () => {
    const bad: Q.Bank = { names: ["A"], quests: [one({ steps: [{ at: ["moon"], say: [] }] })], events: [{ ...BANK.events[0]!, next: { win: "nope" } }] };
    const out = Q.check(bad, new Set(Object.keys(ACTIONS)), ATTRS);
    expect(out.join("\n")).toMatch(/no place key moon/);
    expect(out.join("\n")).toMatch(/two steps/);
    expect(out.join("\n")).toMatch(/no follow-up nope/);
  });
});

describe("the capitals' own quests", () => {
  const cities = new Set(dataFile("cities.tsv").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => { const f = l.split("\t"); return `${f[0]}, ${f[2]}`; }));

  it("are valid, one or two for each of nearly every capital, in cities the game knows", () => {
    expect(Q.check({ ...BANK, quests: [...BANK.quests, ...CITY_QUESTS] }, new Set(Object.keys(ACTIONS)), ATTRS)).toEqual([]);
    const per = new Map<string, number>();
    for (const q of CITY_QUESTS) {
      expect(cities.has(q.city!), q.city).toBe(true);
      per.set(q.city!, (per.get(q.city!) ?? 0) + 1);
    }
    expect(per.size).toBeGreaterThanOrEqual(150);
    // Nearly all are about a named landmark.
    expect(CITY_QUESTS.filter((q) => q.steps.some((st) => st.name?.length)).length).toBeGreaterThan(CITY_QUESTS.length * 0.9);
    expect(Math.max(...per.values())).toBeLessThanOrEqual(2);
  });

  const paris = one({ id: "eiffel", city: "Paris, France", steps: [{ at: ["cafe"], say: ["{GIVER} at {PLACE}."] }, { at: ["attraction"], name: ["Eiffel"], say: ["Up {PLACE}."] }] });
  const eiffel = place("Tour Eiffel", "attraction", 3);
  const sights = [place("Other Sight", "attraction", 1), eiffel];

  it("go on their city's board first, and send him to the named landmark", () => {
    const { s } = fresh({ names: ["Ana"], quests: [one({ id: "a" }), paris], events: [] });
    s.quests.roll("Paris, France", 20_000, [...TOWN, ...sights], new Rng(3));
    expect(s.quests.board.map((o) => o.key)).toEqual(["eiffel", "a:Ana:0"]);
    s.quests.since = 9;
    s.quests.nudge = "eiffel";
    const giver = Q.questGoal(s, [...TOWN, ...sights], HERE, new Rng(3))!;
    Q.questStop(s, giver, [...TOWN, ...sights], 12, new Rng(3));
    expect(Q.questGoal(s, [...TOWN, ...sights], HERE, new Rng(3))).toBe(eiffel);
  });

  it("never show up in another city, and are done once for good", () => {
    const { s } = fresh({ names: ["Ana", "Bo"], quests: [one({ id: "a" }), paris], events: [] });
    s.quests.roll("Lyon, France", 300_000, [...TOWN, ...sights], new Rng(3));
    expect(s.quests.board.some((o) => o.kind === "eiffel")).toBe(false);
    s.quests.done = ["eiffel"];
    s.quests.roll("Paris, France", 300_000, [...TOWN, ...sights], new Rng(3));
    expect(s.quests.board.some((o) => o.kind === "eiffel")).toBe(false);
  });

  it("stand in a place of the same kind while the landmark isn't loaded", () => {
    expect(Q.stepPlaces(paris.steps[1]!, [sights[0]!])).toEqual([sights[0]]);
    expect(Q.stepPlaces(paris.steps[1]!, sights)).toEqual([eiffel]);
  });

  it("only take a landmark of the step's kinds: an Eiffel café isn't the tower", () => {
    const cafe = place("Café Eiffel", "cafe", 2);
    expect(Q.stepPlaces(paris.steps[1]!, [cafe, sights[0]!])).toEqual([sights[0]]);
  });

  it("know their city however a search spells it", () => {
    expect(Q.sameCity("Sofia, Bulgaria", "Sofia, Sofia City, Bulgaria")).toBe(true);
    expect(Q.sameCity("Bogota, Colombia", "Bogotá, Bogotá D.C., Colombia")).toBe(true);
    expect(Q.sameCity("Washington,  D.C., United States of America", "Washington, District of Columbia, United States")).toBe(true);
    expect(Q.sameCity("London, United Kingdom", "London, Ontario, Canada")).toBe(false);
    const { s } = fresh({ names: ["Ana"], quests: [one({ id: "a" }), paris], events: [] });
    s.quests.roll("Paris, Île-de-France, France", 20_000, [...TOWN, ...sights], new Rng(3));
    expect(s.quests.board[0]?.key).toBe("eiffel");
  });

  it("don't make a board ready in another city that only has their giver kinds", () => {
    const music = one({ id: "band", city: "Paris, France", steps: [{ at: ["music"], say: ["At {PLACE}."] }, { at: ["cafe"], say: ["At {PLACE}."] }] });
    const shops = Array.from({ length: Q.BOARD_PLACES }, (_, i) => place(`Music ${i}`, "music", i % 6));
    const { s } = fresh({ names: ["Ana"], quests: [one({ id: "a" }), music], events: [] });
    s.quests.roll("Lyon, France", 300_000, shops, new Rng(3));
    expect(s.quests.rolled).toBe(false);
  });
});

describe("the board", () => {
  it("grows with the city: a couple in a town, about ten in a big city, thirty in a capital", () => {
    expect(Q.boardSize(5_000)).toBe(Q.BOARD_MIN);
    expect(Q.boardSize(300_000)).toBeGreaterThanOrEqual(8);
    expect(Q.boardSize(300_000)).toBeLessThanOrEqual(20);
    expect(Q.boardSize(3_000_000)).toBe(Q.BOARD_MAX);
  });

  it("rolls once enough places are loaded, with givers at real places of the right kind", () => {
    const { s } = fresh();
    s.quests.roll("Testville", 300_000, TOWN.slice(0, 5), new Rng(1));
    expect(s.quests.board).toEqual([]);
    s.quests.roll("Testville", 300_000, TOWN, new Rng(1));
    expect(s.quests.board.length).toBeGreaterThan(0);
    for (const o of s.quests.board) expect(Q.isKind(o.at, s.quests.kind(o.kind)!.steps[0]!.at)).toBe(true);
    expect(new Set(s.quests.board.map((o) => o.kind)).size).toBe(s.quests.board.length);
  });

  it("waits for a place a quest can start at, not just any (bridges can load first)", () => {
    const { s } = fresh();
    const bridges = Array.from({ length: Q.BOARD_PLACES }, (_, i) => place(`Bridge ${i}`, "bridge", i % 6));
    s.quests.roll("Testville", 300_000, bridges, new Rng(1));
    expect(s.quests.rolled).toBe(false);
    // One café among the bridges isn't enough either: they don't count.
    s.quests.roll("Testville", 300_000, [...bridges, TOWN[1]!], new Rng(1));
    expect(s.quests.rolled).toBe(false);
    s.quests.roll("Testville", 300_000, [...bridges, ...TOWN], new Rng(1));
    expect(s.quests.board.length).toBeGreaterThan(0);
  });

  it("never deals the same quest twice on one board, even when the bank is small", () => {
    const { s } = fresh({ names: ["Ana"], quests: [one({ id: "a" }), one({ id: "b" })], events: [] });
    s.quests.roll("Testville", 3_000_000, TOWN, new Rng(13));
    expect(s.quests.board.map((o) => o.key).sort()).toEqual(["a:Ana:0", "b:Ana:0"]);
  });

  it("deals no fantasy quest on a board too small for its share", () => {
    const { s } = fresh({ names: ["Ana", "Bo", "Cy", "Di", "Eve", "Fay"], quests: [one({ id: "magic", fantasy: true })], events: [] });
    s.quests.roll("Testville", 5_000, TOWN, new Rng(8));
    expect(s.quests.board).toEqual([]);
    s.quests.city = "";
    s.quests.roll("Testville", 300_000, TOWN, new Rng(8));
    expect(s.quests.board.length).toBe(Math.floor(Q.boardSize(300_000) * Q.FANTASY_SHARE));
  });

  it("never deals a quest he has done, and a new city gets a new board", () => {
    const { s } = fresh({ names: ["Ana"], quests: [one({ id: "a" }), one({ id: "b" })], events: [] });
    s.quests.done = ["a:Ana:0"];
    s.quests.roll("Testville", 300_000, TOWN, new Rng(2));
    expect(s.quests.board.map((o) => o.key)).toEqual(["b:Ana:0"]);
    s.quests.roll("Otherton", 300_000, TOWN, new Rng(2));
    expect(s.quests.city).toBe("Otherton");
  });
});

describe("going on a quest", () => {
  const setup = () => {
    const f = fresh({ names: ["Ana"], quests: [one()], events: [] });
    f.s.quests.roll("Testville", 300_000, TOWN, new Rng(3));
    return f;
  };

  it("waits for a few stops, then takes one on and walks its steps back to back", () => {
    const { s } = setup();
    const rng = new Rng(4);
    expect(Q.questGoal(s, TOWN, HERE, rng)).toBeNull();
    for (let i = 0; i < Q.QUEST_EVERY_MAX; i++) expect(Q.questStop(s, TOWN[4]!, TOWN, 12, rng)).toBeNull();
    const giver = Q.questGoal(s, TOWN, HERE, rng)!;
    expect(giver.class).toBe("post");
    expect(s.history.latest()).toMatch(/New quest: Test quest, for Ana/);
    expect(Q.questStop(s, giver, TOWN, 12, rng)).toBe(Q.STEP_MIN);
    expect(s.history.latest()).toBe("🧪 Ana at The post has a box.");
    const next = Q.questGoal(s, TOWN, HERE, rng)!;
    expect(next.class).toBe("cafe");
    const cents = s.cents;
    Q.questStop(s, next, TOWN, 12, rng);
    expect(s.quests.active).toBeNull();
    expect(s.cents).toBeGreaterThan(cents);
    expect(s.quests.done).toEqual(["q:Ana:0"]);
    expect(s.quests.finished).toBe(1);
    expect(s.quests.log.at(-1)).toMatchObject({ title: "Test quest", city: "Testville, France" });
  });

  it("sends him to the real place, keeping its rank and flags", () => {
    const tower = { ...place("Old tower", "post", 2), rank: 9, made: true };
    const town = [tower, ...TOWN.filter((p) => p.class !== "post")];
    const f = fresh({ names: ["Ana"], quests: [one()], events: [] });
    f.s.quests.roll("Testville", 300_000, town, new Rng(3));
    f.s.quests.since = 9;
    expect(Q.questGoal(f.s, town, HERE, new Rng(4))).toBe(tower);
  });

  it("can fail at its middle step: it ends early, with no reward", () => {
    const three = one({ steps: [{ at: ["post"], say: ["Start at {PLACE}."] }, { at: ["cafe"], say: ["Middle at {PLACE}."] }, { at: ["library"], say: ["End at {PLACE}."] }] });
    const f = fresh({ names: ["Ana"], quests: [three], events: [] });
    f.s.quests.roll("Testville", 300_000, TOWN, new Rng(3));
    f.s.quests.since = 9;
    // Every roll comes out high: the middle step fails.
    const unlucky = { randf: () => 0.999, randiRange: (lo: number) => lo, pick: <T>(l: readonly T[]) => l[0]! } as unknown as Rng;
    const giver = Q.questGoal(f.s, TOWN, HERE, unlucky)!;
    Q.questStop(f.s, giver, TOWN, 12, unlucky);
    const cents = f.s.cents;
    const middle = Q.questGoal(f.s, TOWN, HERE, unlucky)!;
    expect(middle.class).toBe("cafe");
    Q.questStop(f.s, middle, TOWN, 12, unlucky);
    expect(f.s.quests.active).toBeNull();
    expect(f.s.cents).toBe(cents);
    expect(f.s.history.latest()).toBe("🧪 Test quest fails: Worse.");
    expect(f.s.quests.log.at(-1)).toMatchObject({ good: false });
    expect([f.s.quests.finished, f.s.quests.done.length]).toEqual([0, 1]);
    // The count stays the same after a reload.
    expect(Stats.fromJSON(JSON.parse(JSON.stringify(f.s.toJSON()))).quests.finished).toBe(0);
  });

  it("drops everything for an urgent need, then carries on", () => {
    const { s } = setup();
    s.quests.since = 9;
    s.meters.fullness = 3;
    expect(Q.questGoal(s, TOWN, HERE, new Rng(5))).toBeNull();
    s.meters.fullness = 80;
    expect(Q.questGoal(s, TOWN, HERE, new Rng(5))).not.toBeNull();
  });

  it("waits for closed places: no giver or step there at night, and the quest holds until morning", () => {
    const { s } = setup();
    const at = (clock: number) => (s.sky = { ...skyAt(0, HERE[0], HERE[1], 0, null), clock });
    s.quests.since = 9;
    at(23);
    expect(Q.questGoal(s, TOWN, HERE, new Rng(4))).toBeNull();
    expect(s.quests.active).toBeNull();
    at(10);
    const giver = Q.questGoal(s, TOWN, HERE, new Rng(4))!;
    expect(giver.class).toBe("post");
    Q.questStop(s, giver, TOWN, 12, new Rng(4));
    at(21);
    expect(Q.questGoal(s, TOWN, HERE, new Rng(4))).toBeNull();
    expect(s.quests.active?.step).toBe(1);
    at(9);
    expect(Q.questGoal(s, TOWN, HERE, new Rng(4))?.class).toBe("cafe");
  });

  it("picks an open place for a step at night when one fits", () => {
    const f = fresh({ names: ["Ana"], quests: [one({ steps: [{ at: ["post"], say: ["At {PLACE}."] }, { at: ["cafe", "bar"], say: ["At {PLACE}."] }] })], events: [] });
    f.s.quests.roll("Testville", 300_000, TOWN, new Rng(3));
    f.s.quests.since = 9;
    f.s.sky = { ...skyAt(0, HERE[0], HERE[1], 0, null), clock: 19 };
    Q.questStop(f.s, Q.questGoal(f.s, TOWN, HERE, new Rng(4))!, TOWN, 12, new Rng(4));
    f.s.sky = { ...f.s.sky, clock: 22 };
    for (let seed = 1; seed <= 20; seed++) {
      f.s.quests.active!.target = null;
      expect(Q.questGoal(f.s, TOWN, HERE, new Rng(seed * 7919))?.class).toBe("bar");
    }
  });

  it("takes the quest you nudged first, without waiting", () => {
    const f = fresh({ names: ["Ana"], quests: [one({ id: "a" }), one({ id: "b" }), one({ id: "c" })], events: [] });
    f.s.quests.roll("Testville", 300_000, TOWN, new Rng(6));
    const pick = f.s.quests.board.at(-1)!;
    f.s.quests.nudge = pick.key;
    Q.questGoal(f.s, TOWN, HERE, new Rng(6));
    expect(f.s.quests.active?.key).toBe(pick.key);
    expect(f.s.quests.nudge).toBe("");
  });

  it("is saved and loaded with him", () => {
    const { s } = setup();
    s.quests.since = 9;
    Q.questGoal(s, TOWN, HERE, new Rng(7));
    const back = Stats.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
    expect(back.quests.active?.key).toBe(s.quests.active?.key);
    expect(back.quests.city).toBe("Testville");
    expect(Stats.fromJSON({ ...s.toJSON(), quests: undefined } as never).quests.board).toEqual([]);
  });

  it("counts quests done in an older save that has no tally yet", () => {
    expect(Q.Quests.fromJSON({ done: ["a:Ana:0", "b:Bo:1"] }).finished).toBe(2);
  });

  it("stays behind, with the board and events, when a free ride takes him to another city", () => {
    const { s } = setup();
    s.quests.since = 9;
    Q.questGoal(s, TOWN, HERE, new Rng(7));
    s.quests.events = [{ id: "e@1", kind: "e", at: Q.spotOf(TOWN[0]!), ends: s.now() + 600, line: 0 }];
    expect(s.quests.active).not.toBeNull();
    // Its places aren't loaded yet: everything from the old city goes at once.
    s.quests.roll("Farville", 300_000, [], new Rng(7));
    expect([s.quests.active, s.quests.board, s.quests.events, s.quests.city, s.quests.rolled]).toEqual([null, [], [], "Farville", false]);
    expect(Q.questGoal(s, [], HERE, new Rng(7))).toBeNull();
    // Once enough of its places load, Farville gets its board.
    s.quests.roll("Farville", 300_000, TOWN, new Rng(7));
    expect(s.quests.rolled).toBe(true);
    expect(s.quests.board.length).toBeGreaterThan(0);
  });

  it("an event you nudged in a town too small for a board stays behind too", () => {
    const { s } = fresh({ names: ["Ana"], quests: [one()], events: [] });
    const few = TOWN.slice(0, 5);
    s.quests.roll("Smallton", 5_000, few, new Rng(7));
    s.quests.events = [{ id: "e@1", kind: "e", at: Q.spotOf(few[0]!), ends: s.now() + 600, line: 0 }];
    s.quests.nudge = "e@1";
    // Each second the same town asks again: its own event stays.
    s.quests.roll("Smallton", 5_000, few, new Rng(7));
    expect(s.quests.events).toHaveLength(1);
    s.quests.roll("Farville", 300_000, [], new Rng(7));
    expect([s.quests.events, s.quests.nudge]).toEqual([[], ""]);
  });

  it("an older save's city counts as rolled", () => {
    expect(Q.Quests.fromJSON({ city: "Testville" }).rolled).toBe(true);
    expect(Q.Quests.fromJSON({}).rolled).toBe(false);
  });
});

describe("world events", () => {
  const ev = (o: Partial<Q.EventKind> = {}): Q.EventKind => ({
    id: "e", icon: "🔶", title: "Test event", at: ["park"], min: [30, 30], lean: "str", text: ["Trouble at {PLACE}."],
    win: { say: "Saved the day.", eur: 5 }, lose: { say: "It went badly." }, missed: "{PLACE} managed without him.", ...o,
  });

  it("pop up at a fitting place near him, and he heads there first", () => {
    const { s } = fresh({ names: ["Ana"], quests: [], events: [ev()] });
    const park = TOWN.find((p) => p.class === "park")!;
    expect(Q.startEvent(s, null, park, TOWN, 12, new Rng(8))).not.toBeNull();
    expect(s.history.latest()).toBe("🔶 Trouble at The park. (Test event, 30 min)");
    expect(Q.questGoal(s, TOWN, HERE, new Rng(8))?.name).toBe("The park");
    Q.questStop(s, park, TOWN, 12, new Rng(8));
    expect(s.quests.events).toEqual([]);
    expect(s.quests.log.at(-1)).toMatchObject({ title: "Test event", event: true });
  });

  it("never start at a closed place, and one that closes isn't picked until it opens", () => {
    const { s } = fresh({ names: ["Ana"], quests: [], events: [ev({ at: ["museum"] })] });
    const museum = TOWN.find((p) => p.class === "museum")!;
    s.sky = { ...skyAt(0, HERE[0], HERE[1], 0, null), clock: 22 };
    expect(Q.startEvent(s, null, museum, TOWN, 12, new Rng(8))).toBeNull();
    s.sky = { ...s.sky, clock: 19 };
    expect(Q.startEvent(s, null, museum, TOWN, 12, new Rng(8))).not.toBeNull();
    s.sky = { ...s.sky, clock: 20 };
    expect(Q.questGoal(s, TOWN, HERE, new Rng(8))).toBeNull();
    expect(s.quests.events).toHaveLength(1);
    s.sky = { ...s.sky, clock: 8 };
    expect(Q.questGoal(s, TOWN, HERE, new Rng(8))?.name).toBe(museum.name);
  });

  it("the one you nudged comes first, however far he has walked from it", () => {
    const { s } = fresh({ names: ["Ana"], quests: [], events: [ev()] });
    const far = place("Far Park", "park", 30);
    Q.startEvent(s, null, far, [far], 12, new Rng(8));
    expect(Q.questGoal(s, TOWN, HERE, new Rng(8))).toBeNull();
    s.quests.nudge = s.quests.events[0]!.id;
    expect(Q.questGoal(s, TOWN, HERE, new Rng(8))?.name).toBe("Far Park");
  });

  it("play out without him when the time runs out", () => {
    const { s, tick } = fresh({ names: ["Ana"], quests: [], events: [ev()] });
    Q.startEvent(s, null, TOWN[0]!, TOWN, 12, new Rng(9));
    tick(31);
    Q.expire(s);
    expect(s.quests.events).toEqual([]);
    expect(s.history.latest()).toBe("🔶 The park managed without him.");
  });

  it("can lead to a follow-up event, which never starts on its own", () => {
    const { s } = fresh({ names: ["Ana"], quests: [], events: [ev({ next: { win: "f", lose: "f" } }), ev({ id: "f", title: "Follow-up", follow: true })] });
    const park = TOWN.find((p) => p.class === "park")!;
    Q.startEvent(s, null, park, TOWN, 12, new Rng(10));
    expect(s.quests.events.map((e) => e.kind)).toEqual(["e"]);
    // A roll under FOLLOW_CHANCE brings the follow-up.
    const rolls = [0, 0, 0, 0, 0, 0];
    const low = { randf: () => rolls.shift() ?? 0, randiRange: (lo: number) => lo, pick: <T>(l: readonly T[]) => l[0]! } as unknown as Rng;
    Q.questStop(s, park, TOWN, 12, low);
    expect(s.quests.events.map((e) => e.kind)).toEqual(["f"]);
  });

  it("honour their time of day", () => {
    const { s } = fresh({ names: ["Ana"], quests: [], events: [ev({ time: "night" })] });
    expect(Q.startEvent(s, null, TOWN[0]!, TOWN, 12, new Rng(11))).toBeNull();
    expect(Q.startEvent(s, null, TOWN[0]!, TOWN, 23, new Rng(11))).not.toBeNull();
  });
});

describe("quests while he is away", () => {
  it("he takes on quests and finishes them in the catch-up, and doesn't leave town mid-quest", () => {
    const s = new Stats();
    s.quests.bank = BANK;
    const box = bboxAround(HERE[0], HERE[1], 2000);
    const city: AwayCity = { name: "Testville, France", code: "FR", center: HERE, bounds: box, places: TOWN, pop: 300_000 };
    const trips = new Trips(parseCities(dataFile("cities.tsv")), parseAirports(dataFile("airports.tsv")));
    const sum = catchUp(s, city, HERE, 12 * 3600, Date.UTC(2026, 9, 30, 8), { activities: new Activities(JSON.parse(dataFile("actions.json")), {}), trips, rng: new Rng(12), skyAt: hourSky(() => 12), roll: () => 0.999 });
    expect(sum.lines.some((l) => l.text.includes("New quest"))).toBe(true);
    expect(s.quests.log.length).toBeGreaterThan(0);
  });

  it("rolls the board of a city he left before enough of it had loaded", () => {
    const s = new Stats();
    s.quests = Q.Quests.fromJSON({ city: "Testville, France", rolled: false });
    s.quests.bank = BANK;
    const city: AwayCity = { name: "Testville, France", code: "FR", center: HERE, bounds: bboxAround(HERE[0], HERE[1], 2000), places: TOWN, pop: 300_000 };
    const trips = new Trips(parseCities(dataFile("cities.tsv")), parseAirports(dataFile("airports.tsv")));
    catchUp(s, city, HERE, 3600, Date.UTC(2026, 9, 30, 8), { activities: new Activities(JSON.parse(dataFile("actions.json")), {}), trips, rng: new Rng(12), skyAt: hourSky(() => 12), roll: () => 0.999 });
    expect(s.quests.rolled).toBe(true);
  });
});
