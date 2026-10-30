// The storyteller's pacing (src/core/storyteller.ts) and the incident deck it deals from (src/core/incidents.ts, data/incidents.json).
import { describe, expect, it } from "vitest";
import { Activities } from "../../src/core/activities";
import { catchUp, type AwayCity } from "../../src/core/catchup";
import { bboxAround } from "../../src/core/geo";
import * as Inc from "../../src/core/incidents";
import * as Items from "../../src/core/items";
import { Rng } from "../../src/core/rng";
import { skyAt } from "../../src/core/sky";
import { ATTRS, inTime, Stats, type Place } from "../../src/core/stats";
import { FIRE_AT, FIRE_MAX, LUCKY_H, RECENT, STYLE, STYLES, Storyteller, TENSION_MAX, WEALTH_CAP, WEALTH_STEP } from "../../src/core/storyteller";
import { parseAirports, parseCities, Trips } from "../../src/core/trips";
import { dataFile } from "../support/data";

const DECK = JSON.parse(dataFile("incidents.json")) as Inc.Incident[];
const ACTIONS = JSON.parse(dataFile("actions.json")) as Record<string, unknown>;
/** An Rng whose rolls come from `rolls` in turn, and whose picks take the first. */
const fixed = (...rolls: number[]) => ({ randf: () => rolls.shift() ?? 0, randiRange: (lo: number) => lo, pick: <T>(l: readonly T[]) => l[0]! }) as unknown as Rng;
const card = (o: Partial<Inc.Incident>): Inc.Incident => ({ id: "t", icon: "🧪", tone: "bad", text: "At {PLACE}.", say: "It happened.", ...o });
const CAFE = { place: "Cafe", kind: "cafe", hour: 12, rides: "" as const };

describe("the storyteller", () => {
  it("builds tension with calm time, faster for each storyteller", () => {
    const rates = STYLES.map((style) => {
      const s = new Storyteller();
      s.style = style;
      s.pass(60, 0);
      return s.tension;
    });
    expect(rates).toEqual(STYLES.map((st) => STYLE[st].per_h));
    expect(rates[0]).toBeLessThan(rates[1]!);
    expect(rates[1]).toBeLessThan(rates[2]!);
  });

  it("builds it faster the richer he is, up to a cap, and never past the top", () => {
    const s = new Storyteller();
    s.pass(60, WEALTH_STEP * 2);
    expect(s.tension).toBe(STYLE.classic.per_h + 2);
    const rich = new Storyteller();
    rich.pass(60, WEALTH_STEP * 1000);
    expect(rich.tension).toBe(STYLE.classic.per_h + WEALTH_CAP);
    rich.pass(60 * 100, 0);
    expect(rich.tension).toBe(TENSION_MAX);
  });

  it("brings nothing below FIRE_AT, then a chance that grows to FIRE_MAX", () => {
    const s = new Storyteller();
    s.tension = FIRE_AT;
    expect(s.chance()).toBe(0);
    expect(s.roll(fixed(0))).toBeNull();
    s.tension = TENSION_MAX;
    expect(s.chance()).toBe(FIRE_MAX);
    expect(s.roll(fixed(FIRE_MAX))).toBeNull();
    expect(s.roll(fixed(0, 0))).toBe("bad");
    expect(s.roll(fixed(0, STYLE.classic.bad, 0.2))).toBe("good");
    expect(s.roll(fixed(0, STYLE.classic.bad, 0.7))).toBe("odd");
  });

  it("makes bad ones rarer with Luck", () => {
    const s = new Storyteller();
    s.tension = TENSION_MAX;
    expect(s.roll(fixed(0, STYLE.classic.bad * 0.6), 0.5)).not.toBe("bad");
  });

  it("empties the tension after a bad one and keeps only good or odd ones for a while", () => {
    const s = new Storyteller();
    s.tension = TENSION_MAX;
    s.after("x", "bad");
    expect(s.tension).toBe(0);
    s.tension = TENSION_MAX;
    expect(s.roll(fixed(0, 0, 0))).toBe("good");
    s.pass(LUCKY_H * 60, 0);
    s.tension = TENSION_MAX;
    expect(s.roll(fixed(0, 0))).toBe("bad");
    s.after("y", "good");
    expect(s.tension).toBe(TENSION_MAX / 2);
    expect(s.recent).toEqual(["x", "y"]);
    for (let i = 0; i < RECENT + 3; i++) s.after(`n${i}`, "odd");
    expect(s.recent).toHaveLength(RECENT);
    expect(s.recent.at(-1)).toBe(`n${RECENT + 2}`);
  });

  it("saves its style and tension, and repairs a broken save", () => {
    const s = new Storyteller();
    s.style = "chaotic";
    s.tension = 42;
    s.luckyMin = 10;
    s.recent = ["dog"];
    expect(Storyteller.fromJSON(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(Storyteller.fromJSON({ style: "wild", tension: 1e9, luckyMin: -5 })).toMatchObject({ style: "classic", tension: TENSION_MAX, luckyMin: 0 });
    expect(Storyteller.fromJSON(undefined)).toEqual(new Storyteller());
  });
});

describe("the incident deck", () => {
  it("holds 40 to 60 sound cards of every tone", () => {
    const classes = new Set(Object.keys(ACTIONS).map((k) => k.split("/")[0]!));
    expect(Inc.check(DECK, classes, ATTRS)).toEqual([]);
    expect(DECK.length).toBeGreaterThanOrEqual(40);
    expect(DECK.length).toBeLessThanOrEqual(60);
    for (const tone of ["good", "bad", "odd"]) expect(DECK.filter((c) => c.tone === tone).length).toBeGreaterThanOrEqual(10);
  });

  it("finds broken cards", () => {
    const bad = [card({ id: "a", at: ["moon"] }), card({ id: "a", say: undefined }), card({ id: "b", guard: { attr: "x" as never, at: 1, say: "" } }), card({ id: "c", text: "Rain falls in {PLACE}.", guard: { attr: "str", at: 1, say: "" } })];
    expect(Inc.check(bad, new Set(["cafe"]), ATTRS)).toEqual(["a: no place class moon", "a: id used twice", "a: needs a say, or two options and a lean", "b: guard attribute x", "c: Help can't leave out its place"]);
    expect(Inc.bare(card({ text: "A pickpocket brushes past him near {PLACE}." }))).toBe("A pickpocket brushes past him");
  });

  it("deals only cards that fit the tone, the place, the hour and how he gets about", () => {
    const deck = [card({ id: "church", at: ["place_of_worship"] }), card({ id: "night", time: "night" }), card({ id: "bike", rides: ["bike"] }), card({ id: "good", tone: "good" }), card({ id: "any" })];
    expect(Inc.pick(deck, "bad", CAFE, inTime, fixed())!.id).toBe("any");
    expect(Inc.pick(deck, "bad", { ...CAFE, kind: "place_of_worship", hour: 23, rides: "bike" }, inTime, fixed())!.id).toBe("church");
    expect(Inc.pick(deck, "odd", CAFE, inTime, fixed())).toBeNull();
    expect(Inc.pick(deck, "bad", CAFE, inTime, fixed(), ["any"])!.id).toBe("any");
    expect(Inc.pick([card({ id: "a" }), card({ id: "b" })], "bad", CAFE, inTime, fixed(), ["a"])!.id).toBe("b");
  });

  it("plays a card out: money, meters and a feed line with the place", () => {
    const s = new Stats();
    s.cents = 10000;
    const line = Inc.play(card({ eur: -10, fx: { mood: -10 } }), s, "Cafe Roma", fixed());
    expect(s.cents).toBe(9000);
    expect(s.meters.mood).toBe(60);
    expect(line).toBe("🧪 At Cafe Roma. It happened. (-€10)");
    expect(s.history.latest()).toBe(line);
  });

  it("never takes more than LOSS_CAP_SHARE of his money", () => {
    const s = new Stats();
    s.cents = 1000;
    Inc.play(card({ eur: -100, share: 0.5 }), s, "", fixed());
    expect(s.cents).toBe(1000 * (1 - Inc.LOSS_CAP_SHARE));
  });

  it("lets a strong enough attribute ward it off", () => {
    const s = new Stats();
    s.cents = 10000;
    s.attrs.wit = 6;
    const line = Inc.play(card({ eur: -10, guard: { attr: "wit", at: 6, say: "He saw it coming." } }), s, "Cafe", fixed());
    expect(s.cents).toBe(10000);
    expect(line).toBe("🧪 At Cafe. He saw it coming.");
  });

  it("takes a bag item, but never gear or a treasured item", () => {
    const s = new Stats();
    const item = Items.make("trinkets", 1, new Rng(1), 0);
    const treasured = { ...Items.make("trinkets", 1, new Rng(2), 0), story: { countries: Array(Items.TREASURED_COUNTRIES).fill("X"), km: 0 } } as Items.Item;
    s.bag = [treasured, item];
    s.gear.trinket = Items.make("trinkets", 1, new Rng(3), 0);
    expect(Inc.play(card({ lose: true }), s, "", fixed())).toContain(`lost ${item.name}`);
    expect(s.bag).toEqual([treasured]);
    expect(Inc.play(card({ lose: true }), s, "", fixed())).not.toContain("lost");
    expect(s.gear.trinket).toBeDefined();
  });

  it("has him pick an option by himself, leaning on its attribute", () => {
    const c = card({ say: undefined, lean: "cha", options: [{ id: "sing", label: "Sings", fx: { mood: 10 }, say: "coins fly." }, { id: "listen", label: "Listens", say: "he claps." }] });
    const s = new Stats();
    expect(Inc.play(c, s, "Square", fixed(0.49))).toBe("🧪 At Square. Sings: coins fly.");
    expect(Inc.play(c, s, "Square", fixed(0.51))).toBe("🧪 At Square. Listens: he claps.");
    s.attrs.cha = 5;
    expect(Inc.hisPick(c, s, fixed(0.6))).toBe(0);
    s.attrs.cha = 100;
    expect(Inc.hisPick(c, s, fixed(0.5 + Inc.LEAN_CAP))).toBe(1);
    expect(Inc.play(c, s, "Square", fixed(), 1)).toContain("Listens");
  });
});

describe("incidents in his life", () => {
  const cafe: Place = { name: "Cafe", class: "cafe", subclass: "cafe", rank: 1, lat: 0, lon: 0 };

  it("rolls nothing without a deck, so his dice stay the same", () => {
    const s = new Stats();
    s.story.tension = TENSION_MAX;
    const rng = new Rng(5);
    expect(s.happen(cafe, 12, rng)).toBe("");
    expect(rng.randf()).toBe(new Rng(5).randf());
  });

  it("happens at a stop when the tension is high, and eases it", () => {
    const s = new Stats();
    s.incidents = [card({ tone: "good", id: "g" }), card({ tone: "odd", id: "o" }), card({ id: "b" })];
    s.story.tension = TENSION_MAX;
    const line = s.happen(cafe, 12, fixed(0, 0));
    expect(line).toBe("🧪 At Cafe. It happened.");
    expect(s.incidentLine).toBe(line);
    expect(s.incidentLatest()).toBe(true);
    expect(s.story.tension).toBe(0);
    s.say("Reached Park");
    expect(s.incidentLatest()).toBe(false);
  });

  it("keeps the storyteller in the save, and an old save starts on Classic", () => {
    const s = new Stats();
    s.story.style = "calm";
    s.story.tension = 12;
    const back = Stats.fromJSON(JSON.parse(JSON.stringify(s)));
    expect(back.story).toMatchObject({ style: "calm", tension: 12 });
    const old = JSON.parse(JSON.stringify(s));
    delete old.story;
    expect(Stats.fromJSON(old).story).toEqual(new Storyteller());
  });

  it("brings incidents while he is away", () => {
    const places = ["cafe", "restaurant", "park", "bar", "museum"].map((k, i): Place => ({ name: `${k} ${i}`, class: k, subclass: k, rank: 1, lat: 0.003 * i, lon: 0.002 * (i % 2) }));
    const city: AwayCity = { name: "Bigtown, A-land", code: "AAA", center: [0, 0], bounds: bboxAround(0, 0, 3000), places };
    const s = new Stats();
    s.incidents = DECK;
    const icons = new Set(DECK.map((c) => c.icon));
    const sum = catchUp(s, city, [0, 0], 24 * 3600, Date.UTC(2026, 9, 29, 8), {
      activities: new Activities(JSON.parse(dataFile("actions.json"))),
      trips: new Trips(parseCities("Bigtown\tAAA\tA-land\t0.0\t0.0\t1000000\n"), parseAirports("")),
      rng: new Rng(7),
      cardRng: new Rng(8),
      skyAt: (ms, c) => skyAt(ms, c.center[0], c.center[1], 0, null),
      roll: () => 0.99,
    });
    const told = sum.lines.filter((l) => icons.has([...l.text][0]!));
    expect(told.length).toBeGreaterThanOrEqual(3);
  });
});
