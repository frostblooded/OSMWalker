// Anniversaries (src/core/anniversaries.ts): month marks, his yearly birthday party, and how Stats keeps them.
import { describe, expect, it } from "vitest";
import * as A from "../../src/core/anniversaries";
import type { Friend } from "../../src/core/friends";
import type { Rng } from "../../src/core/rng";
import { Stats } from "../../src/core/stats";

const fixed = (...rolls: number[]) => ({ randf: () => rolls.shift() ?? 0 }) as unknown as Rng;
const at = (y: number, m: number, d: number) => Math.floor(new Date(y, m - 1, d, 9).getTime() / 1000);
const local = (over: Partial<Friend> = {}): Friend => ({ id: "x", name: "Ana", icon: "👩", city: "Sofia, Bulgaria", kind: "cafe", place: { name: "Cafe", lat: 0, lon: 0 }, hearts: A.PARTY_AT, met: 0, seen: 0, ...over });
/** Set out on 31 January 2026. */
const born = () => Object.assign(new A.Anniversaries(), { born: at(2026, 1, 31) });
const check = (a: A.Anniversaries, t: number, friends: Friend[] = [], mood = 50, r = 0.99) => a.check(`${t}`, t, mood, "Sofia, Bulgaria", friends, "", fixed(r));

describe("anniversaries", () => {
  it("counts months on the same day, or the month's last when it is shorter", () => {
    const b = new Date(2026, 0, 31);
    expect(A.monthsBetween(b, new Date(2026, 1, 27))).toBe(0);
    expect(A.isMark(b, new Date(2026, 1, 28))).toBe(true);
    expect(A.isMark(b, new Date(2026, 2, 30))).toBe(false);
    expect(A.isMark(b, new Date(2026, 2, 31))).toBe(true);
    expect(A.monthsBetween(b, new Date(2027, 0, 31))).toBe(12);
    expect(A.isMark(b, b)).toBe(false);
    expect(A.span(3)).toBe("3 months");
    expect(A.span(14)).toBe("1 year and 2 months");
  });

  it("sets his birthday to the first day it counts, with nothing that day", () => {
    const a = new A.Anniversaries();
    expect(check(a, at(2026, 3, 5))).toBeNull();
    expect(a.born).toBe(at(2026, 3, 5));
  });

  it("marks each month on the road, once a day", () => {
    const a = born();
    expect(check(a, at(2026, 2, 27))).toBeNull();
    expect(check(a, at(2026, 2, 28))).toEqual({ line: "📅 1 month on the road", fx: { mood: A.MONTH_MOOD } });
    expect(a.check(a.day, at(2026, 2, 28), 50, "", [], "", fixed())).toBeNull();
    expect(check(a, at(2027, 3, 31))!.line).toBe("📅 1 year and 2 months on the road");
  });

  it("has a quiet birthday alone, or a party with friends in town and his partner, great with his mood", () => {
    const a = born();
    expect(check(a, at(2027, 1, 31))).toEqual({ line: "🎂 His first birthday on the road: a quiet one alone in Sofia", fx: { mood: A.ALONE_MOOD } });
    const friends = [local(), local({ id: "far", name: "Ben", city: "Porto, Portugal", hearts: 9 }), local({ id: "low", name: "Dan", hearts: A.PARTY_AT - 1 })];
    const party = born().check("d", at(2027, 1, 31), 60, "Sofia, Bulgaria", friends, "far", fixed(0.6));
    expect(party).toEqual({ line: "🎂 His first birthday on the road: a party in Sofia with Ben and Ana", fx: { mood: A.PARTY_MOOD } });
    const great = born().check("d", at(2028, 1, 31), 60, "Sofia, Bulgaria", friends, "", fixed(0.59));
    expect(great).toEqual({
      line: "🎂 His second birthday on the road: a party in Sofia with Ana, a great one",
      fx: { mood: A.PARTY_MOOD },
      buff: { name: "Great birthday", min: A.GLOW_MIN, per_h: { mood: A.GLOW_PER_H } },
    });
    // Even in a bad mood a great party can happen.
    expect(born().check("d", at(2027, 1, 31), 0, "Sofia, Bulgaria", friends, "", fixed(A.GREAT_MIN - 0.01))!.buff).toBeDefined();
  });

  it("survives the save; an old save's birthday is the day he set out", () => {
    const a = born();
    a.day = "2026-02-01";
    expect(A.Anniversaries.fromJSON(JSON.parse(JSON.stringify(a)))).toEqual(a);
    expect(A.Anniversaries.fromJSON(undefined, 77)).toMatchObject({ born: 77, day: "" });
  });
});

describe("anniversaries in his stats", () => {
  it("throws his birthday party on the first minute of the day, and reads an old save's birthday from his life story", () => {
    const s = new Stats();
    let t = at(2026, 1, 31);
    s.now = () => t;
    s.where.city = "Sofia, Bulgaria";
    s.milestone("start", "Set out from Sofia, Bulgaria");
    s.passTime(1, 0);
    const d = JSON.parse(JSON.stringify(s));
    delete d.anniversaries;
    expect(Stats.fromJSON(d).anniversaries.born).toBe(t);
    const said: string[] = [];
    s.onSay = (l) => said.push(l);
    s.meters.mood = 50;
    t = at(2027, 1, 31);
    s.passTime(1, 0);
    expect(said).toContain("🎂 His first birthday on the road: a quiet one alone in Sofia");
  });
});
