// His diary and dreams: alone, through Stats, and the data file's lines.
import { describe, expect, it } from "vitest";
import * as D from "../../src/core/diary";
import { Rng } from "../../src/core/rng";
import { Stats, type Action } from "../../src/core/stats";
import { dataFile } from "../support/data";

const DATA = JSON.parse(dataFile("diary.json")) as D.DiaryData;
const CITY = "Sofia, Bulgaria";
const T0 = Date.UTC(2026, 9, 29, 12) / 1000;

describe("the diary's lines", () => {
  it("cover every note kind, and use only the blanks each knows", () => {
    for (const k of D.NOTE_KINDS) expect(DATA.notes[k]?.length, k).toBeGreaterThan(0);
    const blanks = (lines: string[]) => new Set(lines.flatMap((l) => [...l.matchAll(/\{(\w+)\}/g)].map((m) => m[1])));
    expect([...blanks(DATA.open)].sort()).toEqual(["CITY", "DAY"]);
    for (const k of D.NOTE_KINDS) for (const b of blanks(DATA.notes[k])) expect(["PLACE", "CITY"], k).toContain(b);
    for (const b of blanks(DATA.dreams)) expect(["A", "B"]).toContain(b);
  });
});

describe("diary", () => {
  it("writes the day that ended: its city, day count and what stood out most, then starts the next", () => {
    const d = new D.Diary();
    expect(d.close("2026-10-29", CITY, DATA, new Rng(1))).toBeNull(); // nothing under way yet
    d.note("first", "Cafe East");
    d.note("work", "Cafe East");
    d.note("faint", "City Hospital");
    d.note("arrive", "Sofia");
    d.note("first", "Old Bridge");
    const e = d.close("2026-10-30", CITY, DATA, new Rng(1))!;
    expect(e.date).toBe("2026-10-29");
    expect(e.lines[0]).toMatch(/Sofia.*1|1.*Sofia/);
    expect(e.lines).toHaveLength(1 + D.DAY_LINES);
    expect(e.lines[1]).toContain("City Hospital"); // a faint stands out most
    expect(d.today).toEqual({ date: "2026-10-30", city: CITY, notes: [], dreams: [] });
    expect(d.close("2026-10-31", CITY, DATA, new Rng(1))!.lines[0]).toMatch(/2/);
  });

  it("keeps what matters most on a busy day, past MAX_NOTES notes", () => {
    const d = new D.Diary();
    d.close("2026-10-29", CITY, DATA, new Rng(1));
    for (let i = 0; i < D.MAX_NOTES; i++) d.note("first", `Place ${i}`);
    d.note("faint", "City Hospital");
    d.note("work", "Late Cafe"); // matters less than any first visit: not kept
    expect(d.today.notes).toHaveLength(D.MAX_NOTES);
    expect(d.today.notes.map((n) => n.kind)).toContain("faint");
    expect(d.today.notes.map((n) => n.kind)).not.toContain("work");
  });

  it("keeps what he noted before his first day began", () => {
    const d = new D.Diary();
    d.note("arrive", "Sofia");
    d.close("2026-10-29", CITY, DATA, new Rng(1));
    expect(d.today.notes).toEqual([{ kind: "arrive", place: "Sofia" }]);
  });

  it("writes a quiet line on a day with nothing noted, and keeps KEEP_DAYS days", () => {
    const d = new D.Diary();
    d.close("d0", CITY, DATA, new Rng(1));
    for (let i = 1; i <= D.KEEP_DAYS + 3; i++) d.close(`d${i}`, CITY, DATA, new Rng(i));
    expect(d.entries).toHaveLength(D.KEEP_DAYS);
    expect(d.entries.at(-1)!.lines).toHaveLength(2);
  });

  it("never dreams of a quirk as if it were a place", () => {
    const d = new D.Diary();
    d.close("2026-10-29", CITY, DATA, new Rng(1));
    d.note("quirk", "Night owl");
    const dreams = Array.from({ length: 50 }, (_, i) => d.dream(DATA, new Rng(i))).filter(Boolean);
    expect(dreams.length).toBeGreaterThan(0);
    for (const l of dreams) expect(l).not.toContain("Night owl");
  });

  it("dreams DREAM_CHANCE of the time, of a place from his day, at most MAX_DREAMS a day", () => {
    const d = new D.Diary();
    d.close("d0", CITY, DATA, new Rng(1));
    d.note("first", "Cafe East");
    // A fresh day for each nap, so the cap doesn't count.
    const dreams = Array.from({ length: 200 }, (_, i) => {
      d.today.dreams = [];
      return d.dream(DATA, new Rng(i));
    }).filter(Boolean);
    expect(dreams.length / 200).toBeGreaterThan(D.DREAM_CHANCE - 0.15);
    expect(dreams.length / 200).toBeLessThan(D.DREAM_CHANCE + 0.15);
    expect(dreams.every((x) => x.includes("Cafe East"))).toBe(true);
    d.today.dreams = [];
    for (let i = 0; i < 50; i++) d.dream(DATA, new Rng(i));
    expect(d.close("d1", CITY, DATA, new Rng(1))!.dreams).toHaveLength(D.MAX_DREAMS);
  });

  it("survives a save", () => {
    const d = new D.Diary();
    d.close("d0", CITY, DATA, new Rng(1));
    d.note("spot", "Cafe East");
    d.close("d1", CITY, DATA, new Rng(1));
    d.note("first", "Park");
    expect(D.Diary.fromJSON(JSON.parse(JSON.stringify(d))).toJSON()).toEqual(d.toJSON());
  });
});

describe("through Stats", () => {
  it("notes his day as it passes and writes it on the next local day", () => {
    let t = T0;
    const s = new Stats();
    s.now = () => t;
    s.diaryData = DATA;
    s.where = { city: CITY, code: "BGR", country: "Bulgaria" };
    s.passTime(1, 0);
    s.visit({ name: "Cafe East", class: "cafe", lat: 1, lon: 2 });
    t += 86400;
    s.passTime(1, 0);
    expect(s.diary.entries).toHaveLength(1);
    expect(s.diary.entries[0]!.lines.join(" ")).toContain("Cafe East");
    expect(s.history.entries.some((e) => e.text === "📔 He wrote in his diary")).toBe(true);
  });

  it("may dream when he naps or sleeps, never otherwise", () => {
    const s = new Stats();
    s.diaryData = { ...DATA, dreams: ["Dreamt of {A} and {B}."] };
    let t = T0;
    s.now = () => t;
    const nap = { name: "Nap under a tree", min: 60, sleep: true } as Action;
    for (let i = 0; i < 20; i++, t += 60) s.do({ ...nap, sleep: false }, "Park", new Rng(1), "park");
    expect(s.history.entries.some((e) => e.text.startsWith("💤"))).toBe(false);
    for (let i = 0; i < 20; i++, t += 60) s.do(nap, "Park", new Rng(1), "park");
    expect(s.history.entries.some((e) => e.text.startsWith("💤 Dreamt of"))).toBe(true);
  });

  it("knows which actions are naps and sleeps", () => {
    const actions = JSON.parse(dataFile("actions.json")) as Record<string, Action[]>;
    const flavour = JSON.parse(dataFile("flavour.json")) as Record<string, Record<string, Action[]>>;
    const sleeps = [...Object.values(actions), ...Object.values(flavour).flatMap((c) => Object.values(c))]
      .flat()
      .filter((a) => a.sleep)
      .map((a) => a.name);
    expect(new Set(sleeps)).toEqual(new Set(["Nap on a gallery bench", "Fall asleep in the film", "Nap in the reading room", "Nap under a tree", "Doze in the summer sun", "Rent a cabin and sleep", "Hostel bunk for the night", "Hotel room", "Nap on a picnic bench", "Siesta in the shade"]));
  });
});
