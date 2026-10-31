// The little moments: when one is due, which fit, how they read, and the deck itself.
import { describe, expect, it } from "vitest";
import * as B from "../../src/core/beats";
import { Rng } from "../../src/core/rng";
import type { Sky } from "../../src/core/sky";
import { Stats } from "../../src/core/stats";
import { MODES } from "../../src/core/trips";
import { dataFile } from "../support/data";

const DECK = JSON.parse(dataFile("beats.json")) as B.Deck;
const sky = (o: Partial<Sky> = {}): Sky => ({ offsetS: 0, clock: 12, hour: 12, season: "summer", dark: 0, rise: 6, set: 20, weather: { kind: "cloudy", tempC: 15 }, holiday: false, ...o });
const now = (o: Partial<B.Now> = {}): B.Now => ({ at: "walk", sky: sky(), meters: { ...new Stats().meters }, city: "Sofia, Bulgaria", street: "Vitosha Blvd", place: "", near: null, ...o });
const beat = (o: Partial<B.Beat>): B.Beat => ({ id: "t", icon: "🧪", at: "any", text: "It happened", say: "Oh", ...o });

describe("little moments", () => {
  it("come after a random quiet spell between BEAT_MIN_S and BEAT_MAX_S", () => {
    const b = new B.Beats();
    const gaps = new Set<number>();
    for (let s = 0; s < 50; s++) {
      b.heard(new Rng(s));
      expect(b.leftS).toBeGreaterThanOrEqual(B.BEAT_MIN_S);
      expect(b.leftS).toBeLessThanOrEqual(B.BEAT_MAX_S);
      gaps.add(Math.round(b.leftS));
    }
    expect(gaps.size).toBeGreaterThan(10);
    b.leftS = 2;
    expect(b.tick(1)).toBe(false);
    expect(b.tick(1)).toBe(true);
  });

  it("fit what he does, the way he travels, the sky and a low meter", () => {
    expect(B.fits(beat({ at: "walk" }), now())).toBe(true);
    expect(B.fits(beat({ at: "walk" }), now({ at: "ride", mode: "bus" }))).toBe(false);
    expect(B.fits(beat({ at: "ride", modes: ["bus"] }), now({ at: "ride", mode: "bus" }))).toBe(true);
    expect(B.fits(beat({ at: "ride", modes: ["plane"] }), now({ at: "ride", mode: "bus" }))).toBe(false);
    expect(B.fits(beat({ sky: "wet" }), now())).toBe(false);
    expect(B.fits(beat({ sky: "wet" }), now({ sky: sky({ weather: { kind: "rain", tempC: 10 } }) }))).toBe(true);
    expect(B.fits(beat({ sky: "night" }), now({ sky: sky({ dark: 1 }) }))).toBe(true);
    expect(B.fits(beat({ sky: "day" }), now({ sky: null }))).toBe(false);
    expect(B.fits(beat({ low: "fullness" }), now())).toBe(false);
    expect(B.fits(beat({ low: "fullness" }), now({ meters: { ...new Stats().meters, fullness: B.LOW_AT - 1 } }))).toBe(true);
    expect(B.fits(beat({ text: "On {STREET}" }), now({ street: "" }))).toBe(false);
    expect(B.fits(beat({ text: "At {PLACE}" }), now())).toBe(false);
    expect(B.fits(beat({ text: "At {PLACE}", at: "rest" }), now({ at: "rest", place: "Cafe One" }))).toBe(true);
  });

  it("read as a History line with its nudge, and his words, filled in", () => {
    const b = new B.Beats();
    const deck: B.Deck = { beats: [beat({ id: "x", icon: "🐦", text: "A pigeon on {STREET} in {CITY}", say: "Shoo!", fx: { mood: 2, karma: 1 } })], comments: [] };
    const said = b.deal(deck, now(), new Rng(1))!;
    expect(said).toEqual({ id: "x", line: "🐦 A pigeon on Vitosha Blvd in Sofia (+2 mood, +1 karma)", say: "Shoo!", fx: { mood: 2, karma: 1 } });
    expect(b.seen.has("x")).toBe(true);
    expect(b.deal({ beats: [beat({ at: "ride" })], comments: [] }, now(), new Rng(1))).toBeNull();
  });

  it("sometimes give a word about a named place he walks past", () => {
    const deck: B.Deck = { beats: [beat({ id: "x" })], comments: [{ id: "c", text: "He peeked into {NEAR}", say: "Ooh" }] };
    const near = { name: "Cafe One", icon: "☕" };
    let words = 0;
    for (let s = 0; s < 400; s++) if (new B.Beats().deal(deck, now({ near }), new Rng(s))!.id === "c") words++;
    expect(words / 400).toBeGreaterThan(B.COMMENT_SHARE - 0.07);
    expect(words / 400).toBeLessThan(B.COMMENT_SHARE + 0.07);
    expect(new B.Beats().deal(deck, now({ near, at: "rest" }), new Rng(0))!.id).toBe("x");
    const b = new B.Beats();
    for (let s = 0; s < 50; s++) {
      const said = b.deal(deck, now({ near }), new Rng(s))!;
      if (said.id === "c") return expect(said.line).toBe("☕ He peeked into Cafe One");
    }
    throw new Error("no word in 50 tries");
  });

  it("don't repeat the last RECENT while another fits", () => {
    const b = new B.Beats();
    const deck: B.Deck = { beats: Array.from({ length: B.RECENT + 1 }, (_, i) => beat({ id: `b${i}` })), comments: [] };
    const ids = Array.from({ length: B.RECENT + 1 }, (_, s) => b.deal(deck, now(), new Rng(s))!.id);
    expect(new Set(ids).size).toBe(B.RECENT + 1);
    expect(b.recent).toHaveLength(B.RECENT);
  });

  it("keep what he has had in the save", () => {
    const b = new B.Beats();
    b.deal(DECK, now(), new Rng(3));
    const back = B.Beats.fromJSON(JSON.parse(JSON.stringify(b)));
    expect([...back.seen]).toEqual([...b.seen]);
    expect(back.recent).toEqual(b.recent);
    expect(B.Beats.fromJSON(undefined).seen.size).toBe(0);
    const s = Stats.fromJSON(JSON.parse(JSON.stringify(Object.assign(new Stats(), { beats: b }))));
    expect(s.beats.seen.size).toBe(1);
  });
});

describe("the beats deck", () => {
  const ALL = [...DECK.beats, ...DECK.comments];
  const WAYS = new Set([...Object.keys(MODES), "taxi", "metro"]);

  it("has unique ids, short words and only known blanks", () => {
    expect(new Set(ALL.map((b) => b.id)).size).toBe(ALL.length);
    for (const b of DECK.beats) {
      expect(["walk", "ride", "rest", "any"]).toContain(b.at);
      expect(b.icon).not.toBe("");
      expect(b.say.length).toBeLessThanOrEqual(30);
      for (const m of b.modes ?? []) expect(WAYS.has(m), `${b.id}: ${m}`).toBe(true);
      for (const k of `${b.text} ${b.say}`.match(/\{\w+\}/g) ?? []) expect(["{CITY}", "{STREET}", "{PLACE}"]).toContain(k);
      // A place is only named while he stays at one, a street only off a ride.
      if (b.text.includes("{PLACE}")) expect(b.at).toBe("rest");
      if (b.text.includes("{STREET}")) expect(b.at).not.toBe("ride");
      for (const v of Object.values(b.fx ?? {})) expect(Math.abs(v)).toBeLessThanOrEqual(3);
    }
    for (const c of DECK.comments) expect(c.text).toContain("{NEAR}");
  });

  it("has something for every way he gets about, at a place and on foot", () => {
    for (const at of ["walk", "rest"] as const) expect(DECK.beats.filter((b) => B.fits(b, now({ at, place: "Cafe" }))).length).toBeGreaterThan(at === "walk" ? 80 : 15);
    for (const mode of WAYS) if (mode !== "portal") expect(DECK.beats.filter((b) => B.fits(b, now({ at: "ride", mode, street: "" }))).length, mode).toBeGreaterThan(8);
  });
});
