import { beforeEach, describe, expect, it } from "vitest";
import { History, MAX_TRAIL, SIZE, timeText } from "../../src/core/history";

describe("history", () => {
  let h: History;
  beforeEach(() => {
    h = new History();
  });

  it("logs where and when", () => {
    h.moveTo(42, 23);
    h.add("Bought bread", 1000);
    expect(h.entries).toHaveLength(1);
    expect(h.entries[0]).toMatchObject({ text: "Bought bread", t: 1000, at: [42, 23] });
    expect(h.latest()).toBe("Bought bread");
  });

  it("before he is anywhere entries have no spot", () => {
    h.add("Hello", 1);
    expect(h.entries[0]!.at).toBeNull();
  });

  it("keeps the last 100", () => {
    for (let i = 0; i < SIZE + 5; i++) h.add(`e${i}`, i);
    expect(h.entries).toHaveLength(SIZE);
    expect(h.entries[0]!.text).toBe("e5");
    expect(h.latest()).toBe(`e${SIZE + 4}`);
  });

  it("trail drops points closer than a step", () => {
    h.moveTo(42, 23);
    h.moveTo(42.00001, 23);
    expect(h.trailPoints()).toBe(1);
    h.moveTo(42.001, 23);
    expect(h.trailPoints()).toBe(2);
  });

  it("a trip breaks the trail", () => {
    h.moveTo(42, 23);
    h.moveTo(42.001, 23);
    h.breakTrail();
    h.moveTo(48, 2);
    h.moveTo(48.001, 2);
    const segs = h.segments();
    expect(segs).toHaveLength(2);
    expect(segs[0]).toHaveLength(2);
    expect(segs[1]![0]).toEqual([48, 2]);
  });

  it("trail starts where the oldest entry happened", () => {
    for (let i = 0; i < SIZE + 1; i++) {
      h.moveTo(42 + i * 0.001, 23);
      h.add(`e${i}`, i);
    }
    const segs = h.segments();
    expect(segs).toHaveLength(1);
    expect(segs[0]![0]).toEqual(h.entries[0]!.at);
  });

  it("trail is capped", () => {
    for (let i = 0; i < MAX_TRAIL + 10; i++) h.moveTo(42 + i * 0.001, 23);
    expect(h.trailPoints()).toBe(MAX_TRAIL);
  });

  it("markers number newest first and group the same spot", () => {
    h.moveTo(42, 23);
    h.add("Reached Cafe", 1);
    h.add("Drank coffee at Cafe", 2);
    h.moveTo(42.001, 23);
    h.add("Reached Park", 3);
    expect(h.markers()).toEqual([
      { at: [42, 23], label: "2-3", first: 2 },
      { at: [42.001, 23], label: "1", first: 1 },
    ]);
  });

  it("numbers entries newest first", () => {
    for (let i = 0; i < 3; i++) h.add(`e${i}`, i);
    expect(h.number(2)).toBe(1);
    expect(h.number(0)).toBe(3);
  });

  it("entries with no spot have no marker", () => {
    h.add("Old line", 1);
    expect(h.markers()).toEqual([]);
  });

  it("bounds cover the trail and entries", () => {
    h.moveTo(42, 23);
    h.add("a", 1);
    h.moveTo(42.002, 23.003);
    expect(h.bounds()).toEqual([42, 23, 42.002, 23.003]);
    expect(new History().bounds()).toBeNull();
  });

  it("survives a JSON round trip", () => {
    h.moveTo(42, 23);
    h.add("a", 1);
    h.moveTo(42.001, 23);
    h.breakTrail();
    h.moveTo(48, 2);
    const back = History.fromJSON(JSON.parse(JSON.stringify(h)));
    expect(back.entries).toEqual(h.entries);
    expect(back.segments()).toEqual(h.segments());
    expect(back.latest()).toBe("a");
  });

  it("time text is local hours and minutes", () => {
    expect(timeText(13 * 3600 + 5 * 60, 0)).toBe("13:05");
    expect(timeText(23 * 3600, 120)).toBe("01:00");
  });
});
