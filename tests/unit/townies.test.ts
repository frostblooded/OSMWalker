// Townies live on (src/core/townies.ts): a friend's news once a day, letters for big news, moves, and how Stats rolls it.
import { describe, expect, it } from "vitest";
import type { Friend, FriendData } from "../../src/core/friends";
import type { Rng } from "../../src/core/rng";
import { Stats } from "../../src/core/stats";
import * as T from "../../src/core/townies";
import { dataFile } from "../support/data";

const NEWS = (JSON.parse(dataFile("friends.json")) as FriendData).news!;
const fixed = (...rolls: number[]) => ({ randf: () => rolls.shift() ?? 0, pick: <T>(l: readonly T[]) => l[0]! }) as unknown as Rng;
const local = (over: Partial<Friend> = {}): Friend => ({ id: "x", name: "Ana", icon: "👩", city: "Sofia, Bulgaria", kind: "cafe", place: { name: "Cafe", lat: 42.7, lon: 23.3 }, hearts: T.NEWS_AT, met: 0, seen: 0, ...over });
const small: T.News = { id: "guitar", icon: "🎸", line: "{NAME} took up the guitar" };
const big: T.News = { id: "married", icon: "💍", line: "{NAME} got married", letter: "We got married!" };
const move: T.News = { id: "moved", icon: "📦", line: "{NAME} moved to {CITY}", letter: "I've moved to {CITY}!", move: true };
/** Townies past their first day. */
const started = () => Object.assign(new T.Townies(), { day: "2026-10-01" });

describe("townies", () => {
  it("has sound news in data/friends.json: unique ids, some letters and a move", () => {
    expect(NEWS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(NEWS.map((n) => n.id)).size).toBe(NEWS.length);
    expect(NEWS.some((n) => n.letter)).toBe(true);
    expect(NEWS.some((n) => n.move && n.letter?.includes("{CITY}"))).toBe(true);
    for (const n of NEWS) expect(n.line, n.id).toContain("{NAME}");
  });

  it("brings no news on the first day it counts, nor twice the same day", () => {
    const t = new T.Townies();
    expect(t.roll("2026-10-02", [local()], "", [small], [], fixed(0))).toBe("");
    expect(t.roll("2026-10-02", [local()], "", [small], [], fixed(0))).toBe("");
    expect(t.roll("2026-10-03", [local()], "", [small], [], fixed(0))).toBe("🎸 News from Sofia: Ana took up the guitar");
  });

  it(`gives news with a ${T.NEWS_CHANCE} chance a day, from friends with ${T.NEWS_AT} hearts but not his partner, each piece once`, () => {
    const t = started();
    expect(t.roll("2026-10-02", [local()], "", [small], [], fixed(T.NEWS_CHANCE))).toBe("");
    expect(t.roll("2026-10-03", [local({ hearts: T.NEWS_AT - 1 })], "", [small], [], fixed(0))).toBe("");
    expect(t.roll("2026-10-04", [local()], "x", [small], [], fixed(0))).toBe("");
    expect(t.roll("2026-10-05", [local()], "", [small], [], fixed(0))).toMatch(/guitar/);
    expect(t.roll("2026-10-06", [local()], "", [small], [], fixed(0))).toBe("");
    expect(t.done).toEqual({ x: ["guitar"] });
  });

  it("sends big news as a letter to him", () => {
    expect(started().roll("2026-10-02", [local()], "", [big], [], fixed(0))).toBe(`${T.LETTER_MARK} A letter from Ana in Sofia: "We got married!"`);
  });

  it("moves a friend to a city he has been to, where he may meet them from then on; no move with nowhere to go", () => {
    const ana = local();
    expect(started().roll("2026-10-02", [ana], "", [move], ["Sofia, Bulgaria"], fixed(0))).toBe("");
    expect(started().roll("2026-10-02", [ana], "", [move], ["Sofia, Bulgaria", "Porto, Portugal"], fixed(0))).toBe(`${T.LETTER_MARK} A letter from Ana in Sofia: "I've moved to Porto!"`);
    expect(ana.city).toBe("Porto, Portugal");
  });

  it("forgets news of friends he no longer knows, survives the save and repairs a broken one", () => {
    const t = started();
    t.done = { x: ["guitar"], gone: ["dog"] };
    t.prune([local()]);
    expect(t.done).toEqual({ x: ["guitar"] });
    expect(T.Townies.fromJSON(JSON.parse(JSON.stringify(t)))).toEqual(t);
    expect(T.Townies.fromJSON(null)).toEqual(new T.Townies());
    expect(T.Townies.fromJSON({ day: 3, done: { x: ["a", 1], y: "b" } })).toEqual(Object.assign(new T.Townies(), { done: { x: ["a"] } }));
  });
});

describe("townies in his stats", () => {
  it("rolls news on the first minute of a new local day, also in the catch-up, and loads saves from before townies", () => {
    const s = new Stats();
    s.townNews = [small];
    s.friends.list = [local()];
    let t = Math.floor(new Date(2026, 9, 2, 23, 59).getTime() / 1000);
    s.now = () => t;
    s.passTime(1, 0);
    expect(s.townies.day).toBe("2026-10-02");
    // Dice from the date: find a day with news.
    const said: string[] = [];
    s.onSay = (l) => said.push(l);
    for (let d = 3; d < 30 && !said.some((l) => l.startsWith("🎸")); d++) {
      t = Math.floor(new Date(2026, 9, d, 0, 1).getTime() / 1000);
      s.passTime(1, 0);
    }
    expect(said).toContain("🎸 News from Sofia: Ana took up the guitar");
    const d = JSON.parse(JSON.stringify(s));
    expect(Stats.fromJSON(d).townies).toEqual(s.townies);
    delete d.townies;
    expect(Stats.fromJSON(d).townies).toEqual(new T.Townies());
  });
});
