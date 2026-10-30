// Clubs (src/core/clubs.ts): a friend's invitation, a weekly club night at a real place, and how Stats runs it at stops.
import { describe, expect, it } from "vitest";
import * as C from "../../src/core/clubs";
import type { Friend } from "../../src/core/friends";
import type { Rng } from "../../src/core/rng";
import { TOWER_KIND } from "../../src/core/poiGen";
import { Stats, type Fx } from "../../src/core/stats";
import { dataFile } from "../support/data";

/** An Rng whose rolls come from `rolls` in turn, whose picks take the first, and whose ranges take `day`. */
const fixed = (day: number, ...rolls: number[]) => ({ randf: () => rolls.shift() ?? 0, pick: <T>(l: readonly T[]) => l[0]!, randiRange: () => day }) as unknown as Rng;
const local = (over: Partial<Friend> = {}): Friend => ({ id: "Sofia, Bulgaria|Café Rila|0", name: "Ana", icon: "👩", city: "Sofia, Bulgaria", kind: "cafe", place: { name: "Café Rila", lat: 42.7, lon: 23.3 }, hearts: C.JOIN_AT, met: 0, seen: 0, ...over });
/** Tuesday 27 October 2026 at `h`:30, local time. */
const tue = (h: number) => {
  const d = new Date(2026, 9, 27, h, 30);
  return { city: "Sofia, Bulgaria", day: d.getDay(), hour: h, date: "2026-10-27", t: Math.floor(d.getTime() / 1000) };
};

describe("clubs", () => {
  it("has a kind for each club, with an hour of the day and something a night gives", () => {
    expect(new Set(C.KINDS.map((k) => k.id)).size).toBe(C.KINDS.length);
    for (const k of C.KINDS) {
      expect(k.hour, k.id).toBeGreaterThanOrEqual(0);
      expect(k.hour + C.NIGHT_H, k.id).toBeLessThanOrEqual(24);
      expect(Object.keys(k.fx).length, k.id).toBeGreaterThan(0);
    }
  });

  it("meets only at place classes the game still has: kinds with actions, and wizard's towers", () => {
    const actions = JSON.parse(dataFile("actions.json")) as Record<string, unknown>;
    for (const k of C.KINDS) for (const cls of k.at) expect(cls === TOWER_KIND || actions[cls] !== undefined, `${k.id} at ${cls}`).toBe(true);
  });

  it("gets no invitation from a friend who moved away from where they met", () => {
    const c = new C.Clubs();
    expect(c.stop({ ...tue(12), city: "Porto, Portugal" }, [local({ id: "Sofia, Bulgaria|Café Rila|0", city: "Porto, Portugal" })], {}, fixed(2, 0))).toBe("");
  });

  it(`invites him from ${C.JOIN_AT} hearts, at the place they met, on a weekday at the club's hour`, () => {
    const c = new C.Clubs();
    expect(c.stop(tue(12), [local({ hearts: C.JOIN_AT - 1 })], {}, fixed(2, 0))).toBe("");
    expect(c.stop(tue(12), [local()], {}, fixed(2, C.INVITE_CHANCE))).toBe("");
    expect(c.stop(tue(12), [local({ kind: "fuel" })], {}, fixed(2, 0))).toBe("");
    expect(c.stop(tue(12), [local()], {}, fixed(2, 0))).toBe("♟ Ana invited him to the chess club at Café Rila, Tuesdays at 19:00. He joined");
    expect(c.list[0]).toMatchObject({ kind: "chess", host: "Sofia, Bulgaria|Café Rila|0", city: "Sofia, Bulgaria", day: 2, hour: 19, nights: 0 });
    // One club a city.
    expect(c.stop(tue(12), [local({ id: "y", kind: "library" })], {}, fixed(3, 0))).toBe("");
  });

  it(`stops inviting at ${C.MAX_CLUBS} clubs`, () => {
    const c = new C.Clubs();
    for (let i = 0; i < C.MAX_CLUBS; i++) c.stop({ ...tue(12), city: `Town ${i}` }, [local({ id: `Town ${i}|Cafe|0`, city: `Town ${i}` })], {}, fixed(2, 0));
    expect(c.list).toHaveLength(C.MAX_CLUBS);
    expect(c.stop(tue(12), [local()], {}, fixed(2, 0))).toBe("");
  });

  it("goes to the club night by himself, once a night, in its city and hours: its fx and a heart for the friend", () => {
    const c = new C.Clubs();
    const ana = local();
    c.stop(tue(12), [ana], {}, fixed(2, 0));
    const fx: Fx = { mood: 1 };
    expect(c.stop(tue(18), [ana], fx, fixed(2, 1))).toBe("");
    expect(c.stop({ ...tue(19), city: "Plovdiv, Bulgaria" }, [ana], fx, fixed(2, 1))).toBe("");
    expect(c.stop(tue(19), [ana], fx, fixed(2, 1))).toBe("♟ Went to the chess club at Café Rila with Ana (night 1)");
    expect(fx).toEqual({ mood: 1 + C.KINDS[0]!.fx.mood!, xp: C.KINDS[0]!.fx.xp });
    expect(ana).toMatchObject({ hearts: C.JOIN_AT + 1, seen: tue(19).t });
    expect(c.stop(tue(20), [ana], {}, fixed(2, 1))).toBe("");
    expect(c.stop(tue(19 + C.NIGHT_H), [ana], {}, fixed(2, 1))).toBe("");
    // The next week.
    expect(c.stop({ ...tue(19), date: "2026-11-03" }, [ana], {}, fixed(2, 1))).toMatch(/\(night 2\)$/);
  });

  it("still meets after the friend is gone, just without them", () => {
    const c = new C.Clubs();
    c.stop(tue(12), [local()], {}, fixed(2, 0));
    expect(c.stop(tue(19), [], {}, fixed(2, 1))).toBe("♟ Went to the chess club at Café Rila (night 1)");
  });

  it("has a hedge mages' circle at a wizard's tower", () => {
    const c = new C.Clubs();
    c.stop(tue(12), [local({ kind: "wizard_tower", place: { name: "Sofia wizard's tower", lat: 0, lon: 0 } })], {}, fixed(5, 0));
    expect(C.clubText(c.list[0]!)).toBe("hedge mages' circle at Sofia wizard's tower, Fridays at 22:00");
  });

  it("survives the save, and repairs a broken one", () => {
    const c = new C.Clubs();
    c.stop(tue(12), [local()], {}, fixed(2, 0));
    expect(C.Clubs.fromJSON(JSON.parse(JSON.stringify(c)))).toEqual(c);
    expect(C.Clubs.fromJSON(undefined)).toEqual(new C.Clubs());
    const bad = C.Clubs.fromJSON({ list: [null, { ...c.list[0], kind: "gone" }, { ...c.list[0], nights: "x", last: 3 }] });
    expect(bad.list).toHaveLength(1);
    expect(bad.list[0]).toMatchObject({ nights: 0, last: "" });
  });
});

describe("clubs in his stats", () => {
  it("turns a stop in the club's hours into the club night, with its mood and XP, when no incident comes", () => {
    const s = new Stats();
    s.where.city = "Sofia, Bulgaria";
    s.incidents = [{ id: "t", tone: "good", text: "x", options: [] } as never];
    s.friends.list = [local()];
    s.clubs.stop(tue(12), s.friends.list, {}, fixed(new Date(2026, 9, 27).getDay(), 0));
    s.now = () => tue(19).t;
    s.meters.mood = 50;
    // The storyteller's roll: nothing.
    const line = s.happen({ name: "Somewhere", class: "park", lat: 0, lon: 0 }, 19, fixed(0, 0.5));
    expect(line).toBe("♟ Went to the chess club at Café Rila with Ana (night 1)");
    expect(s.meters.mood).toBe(50 + C.KINDS[0]!.fx.mood!);
    expect(s.xp).toBe(C.KINDS[0]!.fx.xp);
    expect(s.history.latest()).toBe(line);
  });

  it("keeps his clubs in the save, and loads saves from before clubs", () => {
    const s = new Stats();
    s.clubs.stop(tue(12), [local()], {}, fixed(2, 0));
    const d = JSON.parse(JSON.stringify(s));
    expect(Stats.fromJSON(d).clubs).toEqual(s.clubs);
    delete d.clubs;
    expect(Stats.fromJSON(d).clubs.list).toEqual([]);
  });
});
