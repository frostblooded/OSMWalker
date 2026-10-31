// His pet: a stray that stays, its food, mood lift, levels and perks, its fairy self and old age.
import { describe, expect, it } from "vitest";
import { dayOf } from "../../src/core/gifts";
import type * as Inc from "../../src/core/incidents";
import * as Pt from "../../src/core/pet";
import { Rng } from "../../src/core/rng";
import { findChance, MOOD_PER_H, Stats, type Place } from "../../src/core/stats";
import { TENSION_MAX } from "../../src/core/storyteller";
import { dataFile } from "../support/data";

const T0 = Date.UTC(2026, 9, 31, 10) / 1000;
const CAFE = { name: "Cafe", class: "cafe", lat: 42.69, lon: 23.32 };
const CASTLE: Place = { name: "Tsarevets", class: "castle", subclass: "castle", rank: 1, lat: 43.08, lon: 25.65 };
const STRAY: Inc.Incident = { id: "stray_dog", icon: "🐕", tone: "good", text: "A stray dog follows him from {PLACE}.", say: "It trots along.", stray: "dog" };
const fixed = (...rolls: number[]) => ({ randf: () => rolls.shift() ?? 0, randiRange: (lo: number) => lo, pick: <T>(l: readonly T[]) => l[0]! }) as unknown as Rng;

/** A Stats at unix second `t` with a dog adopted that day. */
function withDog(t = T0): Stats {
  const s = new Stats();
  s.now = () => t;
  s.pets.adopt("dog", t, dayOf(t * 1000), new Rng(1));
  return s;
}

/** Plays the stray card at successive seconds until it stays; returns the Stats and how many tries it took. */
function adoptByStray(): { s: Stats; tries: number } {
  for (let i = 0; i < 200; i++) {
    const s = new Stats();
    s.now = () => T0 + i;
    s.incidents = (["good", "bad", "odd"] as const).map((tone) => ({ ...STRAY, id: tone, tone }));
    s.story.tension = TENSION_MAX;
    s.happen(CAFE, 12, fixed(0, 0));
    if (s.pets.pet) return { s, tries: i + 1 };
  }
  throw new Error("no stray ever stayed");
}

describe("his pet", () => {
  it("levels up with km walked together, slower each level, up to PET_MAX_LEVEL", () => {
    expect(Pt.levelAt(0)).toBe(1);
    expect(Pt.levelAt(Pt.kmFor(2) - 0.1)).toBe(1);
    expect(Pt.levelAt(Pt.kmFor(2))).toBe(2);
    expect(Pt.levelAt(Pt.kmFor(3))).toBe(3);
    expect(Pt.kmFor(3) - Pt.kmFor(2)).toBeGreaterThan(Pt.kmFor(2) - Pt.kmFor(1));
    expect(Pt.levelAt(1e9)).toBe(Pt.PET_MAX_LEVEL);
  });

  it("comes from a stray card in the deck, now and then, and a second stray doesn't replace it", () => {
    const { s, tries } = adoptByStray();
    expect(tries).toBeGreaterThan(0);
    expect(s.pets.pet).toMatchObject({ kind: "dog", km: 0, fairy: false, fed: dayOf(s.now() * 1000) });
    expect(s.history.latest()).toMatch(/stays with him for good\. He names it/);
    expect(s.chronicle.lines.at(-1)!.text).toMatch(/^Took in a stray dog/);
    const name = s.pets.pet!.name;
    s.now = () => T0 + 1000;
    s.story.tension = TENSION_MAX;
    s.happen(CAFE, 12, fixed(0, 0));
    expect(s.pets.pet!.name).toBe(name);
  });

  it("the deck holds a stray dog and a stray cat", () => {
    const deck = JSON.parse(dataFile("incidents.json")) as Inc.Incident[];
    expect(deck.filter((c) => c.stray).map((c) => c.stray).sort()).toEqual(["cat", "dog"]);
  });

  it("lifts his mood while fed, and eats PET_FOOD at the start of each day", () => {
    const s = withDog();
    s.meters.mood = 50;
    s.passTime(60, 0);
    expect(s.meters.mood).toBeCloseTo(50 - MOOD_PER_H + Pt.PET_MOOD_PER_H);
    const cents = s.cents;
    const next = T0 + 86400;
    s.now = () => next;
    s.passTime(1, 0);
    expect(s.cents).toBe(cents - Pt.PET_FOOD);
    expect(s.pets.pet!.fed).toBe(dayOf(next * 1000));
  });

  it("is grumpy and gives no lift on a day he can't pay, but never leaves", () => {
    const s = withDog();
    s.cents = Pt.PET_FOOD - 1;
    const next = T0 + 86400;
    s.now = () => next;
    s.passTime(1, 0);
    expect(s.history.latest()).toMatch(/is grumpy$/);
    s.meters.mood = 50;
    s.passTime(60, 0);
    expect(s.meters.mood).toBeCloseTo(50 - MOOD_PER_H);
    expect(s.pets.pet).not.toBeNull();
  });

  it("counts km on foot and by bike only, and says each new level", () => {
    const s = withDog();
    s.passTime(10, Pt.kmFor(2) * 1000);
    expect(s.pets.level()).toBe(2);
    expect(s.history.latest()).toMatch(/reached level 2/);
    s.gear.vehicle = { name: "Hatchback", slot: "vehicle", stats: {}, rarity: "Common", price: 1, vehicle: "car" };
    s.passTime(10, 1e6);
    expect(s.pets.level()).toBe(2);
  });

  it("a dog makes money on the street likelier, a cat mishaps rarer, more each level", () => {
    const s = withDog();
    s.pets.pet!.km = Pt.kmFor(3);
    expect(s.pets.findMult()).toBeCloseTo(1 + 3 * Pt.DOG_FIND_PER_LEVEL);
    expect(s.pets.riskMult()).toBe(1);
    s.pets.pet!.kind = "cat";
    expect(s.pets.riskMult()).toBeCloseTo(1 - 3 * Pt.CAT_RISK_PER_LEVEL);
    expect(s.pets.findMult()).toBe(1);
    expect(findChance(1)).toBeGreaterThan(0);
  });

  it("from FAIRY_LEVEL may show its fairy self at a real castle, which doubles its perk", () => {
    let s: Stats | null = null;
    for (let i = 0; i < 500 && !s?.pets.pet?.fairy; i++) {
      s = withDog(T0 + i);
      s.pets.pet!.km = Pt.kmFor(Pt.FAIRY_LEVEL);
      s.happen(CASTLE, 12, new Rng(1));
    }
    expect(s!.pets.pet!.fairy).toBe(true);
    expect(s!.pets.title()).toMatch(/the cù sìth$/);
    expect(s!.pets.icon()).toBe(Pt.KINDS.dog.fairy.icon);
    expect(s!.pets.findMult()).toBeCloseTo(1 + 2 * Pt.FAIRY_LEVEL * Pt.DOG_FIND_PER_LEVEL);
    expect(s!.history.latest()).toMatch(/was a cù sìth all along$/);
  });

  it("never shows its fairy self below FAIRY_LEVEL, at other places or at made-up ones", () => {
    for (let i = 0; i < 200; i++) {
      const s = withDog(T0 + i);
      s.pets.pet!.km = Pt.kmFor(Pt.FAIRY_LEVEL - 1);
      s.happen(CASTLE, 12, new Rng(1));
      s.pets.pet!.km = Pt.kmFor(Pt.FAIRY_LEVEL);
      s.happen({ ...CASTLE, class: "cafe" }, 12, new Rng(1));
      s.happen({ ...CASTLE, made: true }, 12, new Rng(1));
      expect(s.pets.pet!.fairy).toBe(false);
    }
  });

  it("passes away of old age at the start of a day, is remembered and missed, and a new stray may come", () => {
    const s = withDog();
    const end = T0 + s.pets.pet!.lives * 86400;
    s.now = () => end;
    s.passTime(1, 0);
    expect(s.pets.pet).toBeNull();
    expect(s.pets.past).toHaveLength(1);
    expect(s.history.latest()).toMatch(/passed away in its sleep/);
    expect(s.buffNames()).toContain(`Missing ${s.pets.past[0]!.name}`);
    expect(s.pets.past[0]!.until).toBe(end);
  });

  it("lives LIFE_DAYS, many months", () => {
    const lives = new Set(Array.from({ length: 50 }, (_, i) => new Pt.Pets().adopt("cat", 0, "d", new Rng(i)).lives));
    for (const d of lives) expect(d).toBeGreaterThanOrEqual(Pt.LIFE_DAYS[0]);
    for (const d of lives) expect(d).toBeLessThanOrEqual(Pt.LIFE_DAYS[1]);
    expect(Pt.LIFE_DAYS[0]).toBeGreaterThan(180);
  });

  it("is kept in the save, and an old save has none", () => {
    const s = withDog();
    const back = Stats.fromJSON(JSON.parse(JSON.stringify(s)));
    expect(back.pets.pet).toEqual(s.pets.pet);
    const old = JSON.parse(JSON.stringify(new Stats()));
    delete old.pets;
    expect(Stats.fromJSON(old).pets.pet).toBeNull();
  });
});
