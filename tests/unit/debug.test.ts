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
  it("keeps only the latest entries, stamped", () => {
    const log = new D.DebugLog();
    for (let i = 0; i < D.SIZE + 5; i++) log.add({ n: i });
    expect(log.entries).toHaveLength(D.SIZE);
    expect(log.entries.at(-1)!.n).toBe(D.SIZE + 4);
    expect(log.entries.at(-1)).toHaveProperty("t");
  });

  it("drops entries from before the orders when a save loads", () => {
    const again = D.DebugLog.fromJSON([{ picked: 1, of: 3, place: "Cafe" }, { dealt: [] }, { order: true, from: "Pizza" }, null]);
    expect(again.entries.map((e) => e.from)).toEqual(["Pizza"]);
  });

  it("survives a save", () => {
    const log = new D.DebugLog();
    log.add({ delivered: true, to: "Vitosha 12", cents: 300 });
    const again = D.DebugLog.fromJSON(JSON.parse(JSON.stringify(log)));
    expect(again.entries).toHaveLength(1);
    expect(again.entries[0]!.to).toBe("Vitosha 12");
  });

  it("explains an order: how far, the pay, and what it was picked from", () => {
    const text = D.lines({ t: 0, order: true, from: "Pizza", to: "Vitosha 12", cents: 340, pickup_m: 212.4, drop_m: 950, food: 7, doors: 120, street_doors: true }, 0).join("\n");
    for (const s of ["Pick-up 212 m away, drop 950 m on from it, pays €3.40", "7 food places and 120 doors", "street doors"]) expect(text).toContain(s);
  });

  it("gives each entry a short title, and warns of a cancelled order", () => {
    expect(D.title({ order: true, from: "Pizza", to: "Vitosha 12" })).toBe("🛎 Order: Pizza → Vitosha 12");
    expect(D.title({ order: true, from: "Pizza", to: "Vitosha 12", forced: "order" })).toBe("🛎 Order (button): Pizza → Vitosha 12");
    expect(D.title({ delivered: true, to: "Vitosha 12", cents: 340 })).toBe("✅ Delivered to Vitosha 12: €3.40");
    expect(D.title({ cancelled: true, at: "Pizza" })).toBe("⚠ Cancelled: couldn't get to Pizza");
    expect(D.isWarning({ cancelled: true })).toBe(true);
    expect(D.isWarning({ order: true })).toBe(false);
  });
});
