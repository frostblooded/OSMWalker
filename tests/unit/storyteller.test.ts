// The storyteller's pacing (src/core/storyteller.ts) and the incident deck it deals from (src/core/incidents.ts, data/incidents.json).
import { describe, expect, it } from "vitest";
import * as Inc from "../../src/core/incidents";
import * as Items from "../../src/core/items";
import type { Moment, Pick } from "../../src/core/moments";
import { Rng } from "../../src/core/rng";
import { ATTRS, inTime, Stats, type Place } from "../../src/core/stats";
import { FIRE_AT, FIRE_MAX, LUCKY_MIN, RECENT, STYLE, STYLES, Storyteller, TENSION_MAX, WEALTH_CAP, WEALTH_PER_H, WEALTH_STEP } from "../../src/core/storyteller";
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
      s.pass(10, 0);
      return s.tension;
    });
    expect(rates).toEqual(STYLES.map((st) => STYLE[st].per_h / 6));
    expect(rates[0]).toBeLessThan(rates[1]!);
    expect(rates[1]).toBeLessThan(rates[2]!);
  });

  it("builds it faster the richer he is, up to a cap, and never past the top", () => {
    const s = new Storyteller();
    s.pass(6, WEALTH_STEP * 2);
    expect(s.tension).toBeCloseTo((STYLE.classic.per_h + 2 * WEALTH_PER_H) / 10, 9);
    const rich = new Storyteller();
    rich.pass(6, WEALTH_STEP * 1000);
    expect(rich.tension).toBeCloseTo((STYLE.classic.per_h + WEALTH_CAP) / 10, 9);
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
    s.pass(LUCKY_MIN, 0);
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
  it("holds 40 to 60 sound cards of every tone, and night legends", () => {
    const classes = new Set(Object.keys(ACTIONS).map((k) => k.split("/")[0]!));
    expect(Inc.check(DECK, classes, ATTRS)).toEqual([]);
    const plain = DECK.filter((c) => !c.legend);
    expect(plain.length).toBeGreaterThanOrEqual(40);
    expect(plain.length).toBeLessThanOrEqual(60);
    expect(DECK.filter((c) => c.legend).length).toBeGreaterThanOrEqual(8);
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

  it("tells night legends at their places at night, likelier than other cards", () => {
    const deck = [card({ id: "plain" }), card({ id: "ghost", legend: true, at: ["castle"], time: "night" })];
    const castle = { ...CAFE, kind: "castle", hour: 23 };
    expect(Inc.pick(deck, "bad", { ...castle, hour: 12 }, inTime, fixed(0.99))!.id).toBe("plain");
    // Weights 1 and LEGEND_WEIGHT: the legend takes all but the first 1 / (1 + LEGEND_WEIGHT).
    expect(Inc.pick(deck, "bad", castle, inTime, fixed(0.99 / (1 + Inc.LEGEND_WEIGHT)))!.id).toBe("plain");
    expect(Inc.pick(deck, "bad", castle, inTime, fixed(1.01 / (1 + Inc.LEGEND_WEIGHT)))!.id).toBe("ghost");
    expect(Inc.check([card({ id: "x", legend: true })], new Set(), ATTRS)).toEqual(["x: a legend needs night and places"]);
    expect(Inc.check([card({ id: "s", stray: "owl" as "dog" })], new Set(), ATTRS)).toEqual(["s: no pet kind owl"]);
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

  it("asks a choice card as a timed moment; untapped, he picks as he would with nobody to ask", () => {
    const options: Inc.Incident["options"] = [{ id: "sing", label: "Sings", fx: { mood: 10 }, say: "coins fly." }, { id: "listen", label: "Listens", say: "he claps." }];
    const deal = () => {
      const s = new Stats();
      s.now = () => 1000;
      s.incidents = [card({ say: undefined, lean: "cha", options })];
      s.story.tension = TENSION_MAX;
      return s;
    };
    const away = deal();
    const plain = away.happen(cafe, 12, fixed(0, 0));
    let asked: { m: Moment; his: () => string; settle: (p: Pick) => void } | null = null;
    const s = deal();
    expect(s.happen(cafe, 12, fixed(0, 0), (m, his, settle) => (asked = { m, his, settle }))).toBe("");
    expect(asked!.m).toMatchObject({ id: "incident:t", icon: "🧪", ask: "At Cafe.", lean: "cha", options: [{ id: "0", label: "Sings" }, { id: "1", label: "Listens" }] });
    asked!.settle({ id: asked!.his(), you: false });
    expect(s.incidentLine).toBe(plain.replace(". ", ". Decided by himself: "));
    expect(s.incidentLatest()).toBe(true);
    const tapped = deal();
    tapped.happen(cafe, 12, fixed(0, 0), (_m, _his, settle) => settle({ id: "0", you: true }));
    expect(tapped.incidentLine).toBe("🧪 At Cafe. Sings: coins fly.");
  });

  it("asks a contest with Viktor at a stop with no incident; its result becomes the incident line", () => {
    const s = new Stats();
    s.where.city = "Sofia, Bulgaria";
    s.contests = JSON.parse(dataFile("rival.json"));
    Object.assign(s.rival, { town: "Sofia, Bulgaria", inTown: true });
    s.incidents = [card({})];
    let settle: ((p: Pick) => void) | null = null;
    const opening = s.happen(cafe, 12, fixed(0.5, 0, 0.99, 0), (_m, _his, done) => (settle = done));
    expect(opening).toMatch(/^🎩 Viktor .* at Cafe\.$/);
    expect(s.incidentLine).toBe(opening);
    settle!({ id: "won", you: true });
    expect(s.rival.wins).toBe(1);
    expect(s.incidentLine).not.toBe(opening);
    expect(s.incidentLatest()).toBe(true);
    // Settled at once (the timer Off), the result line is the incident line.
    const now = new Stats();
    now.where.city = "Sofia, Bulgaria";
    now.contests = s.contests;
    Object.assign(now.rival, { town: "Sofia, Bulgaria", inTown: true });
    now.incidents = [card({})];
    now.happen(cafe, 12, fixed(0.5, 0, 0.99, 0), (_m, his, done) => done({ id: his(), you: false }));
    expect(now.incidentLine).toMatch(/^🎩 Played by himself: /);
    expect(now.incidentLatest()).toBe(true);
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

  it("brings a meeting with Viktor at a stop with no incident, only while the deck is loaded", () => {
    const s = new Stats();
    s.where.city = "Sofia, Bulgaria";
    s.contests = JSON.parse(dataFile("rival.json"));
    Object.assign(s.rival, { town: "Sofia, Bulgaria", inTown: true });
    // The storyteller's roll (no tension, nothing), then a meeting, a contest, won.
    expect(s.happen(cafe, 12, fixed(0.5, 0, 0.99, 0))).toBe("");
    s.incidents = [card({})];
    const line = s.happen(cafe, 12, fixed(0.5, 0, 0.99, 0));
    expect(line).toMatch(/^🎩 Viktor .* at Cafe\./);
    expect(s.incidentLatest()).toBe(true);
    expect(s.rival.wins).toBe(1);
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
});
