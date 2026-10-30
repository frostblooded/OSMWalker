// Viktor, his rival (src/core/rival.ts): who is in town, meetings, memory, grudge or friendship.
import { describe, expect, it } from "vitest";
import * as R from "../../src/core/rival";
import type { Rng } from "../../src/core/rng";
import { ATTRS, Stats } from "../../src/core/stats";
import { dataFile } from "../support/data";

const CONTESTS = JSON.parse(dataFile("rival.json")) as R.Contest[];
const ACTIONS = JSON.parse(dataFile("actions.json")) as Record<string, unknown>;

/** An Rng whose rolls come from `rolls` in turn, and whose picks take the first. */
const fixed = (...rolls: number[]) => ({ randf: () => rolls.shift() ?? 0, pick: <T>(l: readonly T[]) => l[0]! }) as unknown as Rng;
const AT: [number, number] = [42.7, 23.3];

function inSofia(): Stats {
  const s = new Stats();
  s.where = { city: "Sofia, Bulgaria", code: "BGR", country: "Bulgaria" };
  s.now = () => 1000;
  return s;
}

describe("Viktor", () => {
  it("has sound contests in data/rival.json", () => {
    const classes = new Set(Object.keys(ACTIONS).map((k) => k.split("/")[0]!));
    expect(CONTESTS.length).toBeGreaterThanOrEqual(6);
    expect(new Set(CONTESTS.map((c) => c.id)).size).toBe(CONTESTS.length);
    for (const c of CONTESTS) {
      expect(ATTRS, c.id).toContain(c.attr);
      for (const k of c.at) expect(classes.has(k), `${c.id}: ${k}`).toBe(true);
      expect(c.text, c.id).toContain("{PLACE}");
    }
  });

  it("is in some cities, settled at the first stop there", () => {
    const s = inSofia();
    const r = new R.Rival();
    expect(r.meet(s, CONTESTS, "Cafe", "cafe", AT, fixed(R.IN_TOWN_CHANCE))).toBe("");
    expect(r).toMatchObject({ town: "Sofia, Bulgaria", inTown: false });
    // Not rolled again in the same city.
    expect(r.meet(s, CONTESTS, "Cafe", "cafe", AT, fixed(0, 0))).toBe("");
    s.where.city = "Plovdiv, Bulgaria";
    expect(r.meet(s, CONTESTS, "Cafe", "cafe", AT, fixed(0, R.MEET_CHANCE))).toBe("");
    expect(r.inTown).toBe(true);
  });

  it("competes at a place where a contest fits; he wins, Viktor holds a grudge", () => {
    const s = inSofia();
    const r = new R.Rival();
    const line = r.meet(s, CONTESTS, "Cafe Roma", "cafe", AT, fixed(0, 0, 0.99, 0));
    expect(line).toBe("🎩 Viktor is after the same day's work at Cafe Roma. He gets it; Viktor storms off.");
    expect(r).toMatchObject({ wins: 1, losses: 0, level: R.START_LEVEL, feeling: -1 });
    expect(s.history.latest()).toBe(line);
    expect(r.shownAt(1000, "Sofia, Bulgaria")).toEqual(AT);
    expect(r.shownAt(1000 + R.SEEN_MIN * 60, "Sofia, Bulgaria")).toBeNull();
    expect(r.shownAt(1000, "Varna, Bulgaria")).toBeNull();
  });

  it("levels up when he wins", () => {
    const s = inSofia();
    const r = new R.Rival();
    r.meet(s, CONTESTS, "Cafe", "cafe", AT, fixed(0, 0, 0.99, 0.999));
    expect(r).toMatchObject({ wins: 0, losses: 1, level: R.START_LEVEL + 1 });
  });

  it("has better odds the higher the contest's attribute", () => {
    const s = inSofia();
    const r = new R.Rival();
    const low = r.winChance(s, "wit");
    s.attrs.wit = 10;
    expect(r.winChance(s, "wit")).toBeGreaterThan(low);
    r.level = 50;
    expect(r.winChance(s, "wit")).toBeLessThan(0.5);
  });

  it("chats as a friend now and then, likelier with Charm, and remembers where they met", () => {
    const s = inSofia();
    const r = new R.Rival();
    expect(r.meet(s, CONTESTS, "Cafe", "cafe", AT, fixed(0, 0, R.FRIENDLY_BASE - 0.01))).toBe("🎩 Ran into Viktor at Cafe; they share a coffee and swap stories.");
    expect(r).toMatchObject({ chats: 1, feeling: 1 });
    s.where.city = "Varna, Bulgaria";
    s.attrs.cha = 100;
    expect(r.meet(s, CONTESTS, "Cafe", "cafe", AT, fixed(0, 0, R.FRIENDLY_CAP - 0.01))).toContain(" He still talks about Sofia.");
    // A place with no contest is always a chat.
    expect(r.meet(s, CONTESTS, "Toilets", "toilets", AT, fixed(0, 0.99))).toContain("share a coffee");
  });

  it("forms a grudge or a friendship over many meetings", () => {
    const r = new R.Rival();
    expect(r.standing()).toBe("rival");
    r.feeling = -R.FEELING_AT;
    expect(r.standing()).toBe("nemesis");
    r.feeling = R.FEELING_AT;
    expect(r.standing()).toBe("friend");
  });

  it("keeps only the last few meetings", () => {
    const s = inSofia();
    const r = new R.Rival();
    r.meet(s, CONTESTS, "Cafe", "cafe", AT, fixed(0, 0, 0.99, 0));
    // In town already: a meeting roll, the chat roll, the contest roll.
    for (let i = 0; i < R.FEELING_MAX + 2; i++) r.meet(s, CONTESTS, "Cafe", "cafe", AT, fixed(0, 0.99, 0));
    expect(r.memory).toHaveLength(R.MEMORY);
    expect(r.feeling).toBe(-R.FEELING_MAX);
  });

  it("saves, and repairs a broken or missing save", () => {
    const s = inSofia();
    const r = new R.Rival();
    r.meet(s, CONTESTS, "Cafe", "cafe", AT, fixed(0, 0, 0.99, 0));
    expect(R.Rival.fromJSON(JSON.parse(JSON.stringify(r)))).toEqual(r);
    expect(R.Rival.fromJSON(undefined)).toEqual(new R.Rival());
    expect(R.Rival.fromJSON({ level: -3, feeling: 99, memory: [null, { city: 3 }], seenAt: "x" })).toMatchObject({ level: R.START_LEVEL, feeling: R.FEELING_MAX, memory: [], seenAt: null });
    const old = JSON.parse(JSON.stringify(s));
    delete old.rival;
    expect(Stats.fromJSON(old).rival).toEqual(new R.Rival());
  });
});
