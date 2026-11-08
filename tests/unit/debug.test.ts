import { beforeEach, describe, expect, it } from "vitest";
import * as D from "../../src/core/debugLog";
import { MAX_ERRORS, MAX_WARNINGS, Problems } from "../../src/core/problems";

describe("problems", () => {
  let log: Problems;
  beforeEach(() => {
    log = new Problems();
    log.quiet = true;
  });

  it("keep the last 20 warnings and 10 errors", () => {
    for (let i = 0; i < 25; i++) log.warn(`w${i}`);
    for (let i = 0; i < 15; i++) log.error(`e${i}`);
    expect(log.warnings).toHaveLength(MAX_WARNINGS);
    expect(log.errors).toHaveLength(MAX_ERRORS);
    expect(log.warnings.at(-1)!.text).toBe("w24");
    expect(log.errors[0]!.text).toBe("e5");
  });

  it("count a repeat up instead of filling the log", () => {
    for (let i = 0; i < 3; i++) log.warn("tile failed");
    expect(log.warnings).toHaveLength(1);
    expect(log.warnings[0]!.count).toBe(3);
  });

  it("count what has not been seen", () => {
    log.warn("a");
    log.error("b");
    expect(log.unseen).toBe(2);
    log.markSeen();
    expect(log.unseen).toBe(0);
  });

  it("survive a save", () => {
    log.warn("a");
    log.error("b");
    const again = Problems.fromJSON(JSON.parse(JSON.stringify(log)));
    expect(again.warnings[0]!.text).toBe("a");
    expect(again.errors[0]!.text).toBe("b");
    expect(Problems.fromJSON(null).entries()).toEqual([]);
  });

  it("list errors first, newest first", () => {
    log.warn("old warning");
    log.error("bad");
    log.warn("new warning");
    const text = log.lines(0).join("\n");
    expect(text.indexOf("bad")).toBeLessThan(text.indexOf("new warning"));
    expect(text.indexOf("new warning")).toBeLessThan(text.indexOf("old warning"));
  });

});

describe("debug log", () => {
  it("keeps only the latest picks, stamped", () => {
    const log = new D.DebugLog();
    for (let i = 0; i < D.SIZE + 5; i++) log.add({ n: i });
    expect(log.entries).toHaveLength(D.SIZE);
    expect(log.entries.at(-1)!.n).toBe(D.SIZE + 4);
    expect(log.entries.at(-1)).toHaveProperty("t");
  });

  it("drops entries from before the cards when a save loads", () => {
    const again = D.DebugLog.fromJSON([{ place: "Old pick", rank: 2 }, { picked: 1, of: 3, place: "Cafe" }, null]);
    expect(again.entries.map((e) => e.place)).toEqual(["Cafe"]);
  });

  it("survives a save", () => {
    const log = new D.DebugLog();
    log.add({ fallback: "x" });
    const again = D.DebugLog.fromJSON(JSON.parse(JSON.stringify(log)));
    expect(again.entries).toHaveLength(1);
    expect(again.entries[0]!.fallback).toBe("x");
  });

  it("lists the cards dealt, with what each promised", () => {
    const e = { t: 0, in_box: 37, dealt: [{ place: "Cafe East", kind: "work", slot: "close", dist_m: 312, cents: 340, xp: 20, new: true }, { place: "Museum", kind: "sight", slot: "far", dist_m: 950, cents: 0, xp: 61, new: false }] };
    const text = D.lines(e, 0).join("\n");
    for (const s of ["37 places", "1. Cafe East (work): close · 312 m · €3.40 + 20 XP · new", "2. Museum (sight): far · 950 m · 61 XP"]) expect(text).toContain(s);
  });

  it("shows a pick: which card and what it promised", () => {
    const text = D.lines({ t: 0, picked: 2, of: 3, place: "Museum", kind: "sight", slot: "far", dist_m: 950, cents: 0, xp: 61 }, 0).join("\n");
    expect(text).toContain("sight: far · 950 m · 61 XP");
  });

  it("says why a random spot was used", () => {
    const text = D.lines({ t: 0, in_box: 0, too_close: 0, fallback: "no places loaded in the city box yet", spot: [42.01, 23.02], cells: 3 }, 0).join("\n");
    for (const s of ["Random spot", "no places loaded in the city box yet", "42.01", "3 street cells"]) expect(text).toContain(s);
  });

  it("gives each entry a short title", () => {
    expect(D.title({ dealt: [{}, {}, {}] })).toBe("🃏 Dealt 3 cards");
    expect(D.title({ dealt: [{}], forced: "cards" })).toBe("🃏 Dealt 1 card (button)");
    expect(D.title({ picked: 2, of: 3, place: "Cafe East" })).toBe("🎯 Picked 2 of 3: Cafe East");
    expect(D.title({ fallback: "x", in_box: 0 })).toBe("⚠ Random spot: no places loaded");
    expect(D.title({ fallback: "x", in_box: 2 })).toBe("⚠ Random spot: none to offer");
  });
});
