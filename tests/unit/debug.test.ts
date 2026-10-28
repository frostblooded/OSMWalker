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

  it("keep severe problems apart, with details", () => {
    log.addSevere("Can't leave Sofia", ["No bus station"]);
    log.warn("w");
    expect(log.severe[0]!.text).toBe("Can't leave Sofia");
    expect(log.severe[0]!.details).toEqual(["No bus station"]);
    const e = log.entries();
    expect(e[0]!.level).toBe("severe");
    expect(e[1]!.level).toBe("warning");
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

  it("survives a save", () => {
    const log = new D.DebugLog();
    log.add({ fallback: "x" });
    const again = D.DebugLog.fromJSON(JSON.parse(JSON.stringify(log)));
    expect(again.entries).toHaveLength(1);
    expect(again.entries[0]!.fallback).toBe("x");
  });

  it("shows both rolls and the odds for a place", () => {
    const text = D.lines({ t: 0, roll: 0.4312, outcome: "stay", in_box: 37, too_close: 2, total_weight: 10, r: 0.612, place: "Cafe East", class: "cafe", rank: 4 }, 0).join("\n");
    for (const s of ["0.4312", "stay", "37 places", "2 within 30 m", "0.6120", "Cafe East", "rank 4", "2.5%"]) expect(text).toContain(s);
  });

  it("explains the weight parts", () => {
    const text = D.lines({ t: 0, in_box: 1, place: "A", rank: 1, weight: 0.5, total_weight: 1, rank_w: 1, dist_w: 0.5, dist_m: 812.4, heading_w: 1, need_w: 1 }, 0).join("\n");
    expect(text).toContain("distance 0.50 (812 m away)");
    expect(text).toContain("× need 1.00");
  });

  it("says why a random spot was used", () => {
    const text = D.lines({ t: 0, skipped: "first pick in a new city", in_box: 0, too_close: 0, fallback: "no places loaded in the city box yet", spot: [42.01, 23.02], cells: 3 }, 0).join("\n");
    for (const s of ["first pick in a new city", "Random spot", "no places loaded in the city box yet", "42.01", "3 street cells"]) expect(text).toContain(s);
  });

  it("shows where a trip went and its odds", () => {
    const text = D.lines({ t: 0, forced: "country", trip: "Paris, France", options: 120, chance: 0.041, by: "plane from Sofia Airport" }, 0).join("\n");
    for (const s of ["button", "Paris, France", "120 cities", "4.1%", "Going by plane from Sofia Airport"]) expect(text).toContain(s);
  });

  it("doubles the shown odds when boosted", () => {
    expect(D.lines({ t: 0, roll: 0.3, outcome: "city", boost: 2 }, 0).join("\n")).toContain("city below 0.50, else stay); odds doubled");
  });

  it("gives each pick a short title", () => {
    expect(D.title({ place: "Cafe East", in_box: 3 })).toBe("🎯 Chosen: Cafe East");
    expect(D.title({ fallback: "x", in_box: 0 })).toBe("⚠ Random spot: no places loaded");
    expect(D.title({ fallback: "x", in_box: 2 })).toBe("⚠ Random spot: all places too close");
    expect(D.title({ trip: "Paris, France" })).toBe("✈ Trip: Paris, France");
    expect(D.title({ trip: "Paris, France", forced: "country" })).toBe("✈ Trip: Paris, France (button)");
    expect(D.title({ forced: "city", no_trip: "no other city to go to" })).toBe("✖ No trip: no other city to go to");
  });
});
