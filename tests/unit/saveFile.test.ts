import { describe, expect, it } from "vitest";
import { TRUST_START } from "../../src/core/bond";
import { DebugLog } from "../../src/core/debugLog";
import { StreetGraph } from "../../src/core/graph";
import { Problems } from "../../src/core/problems";
import { Stats } from "../../src/core/stats";
import { Walker } from "../../src/core/walker";
import { BAD_SAVE_KEY, DEFAULT_ZOOM, SAVE_KEY, SETTINGS_KEY, SaveFile, type Saved } from "../../src/game/saveFile";

class MemStorage {
  m = new Map<string, string>();
  full = false;
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.full) throw new Error("quota exceeded");
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

function walkerAt(lat: number, lon: number): Walker {
  const g = new StreetGraph();
  g.nodes.set(1, [lat, lon]);
  const w = new Walker(g);
  w.startAt(1);
  w.totalM = 123;
  return w;
}

const INN = { name: "Sofia inn", class: "lodging", subclass: "guest_house", rank: 1, lat: 42.7, lon: 23.3, id: "sofia:guest_house:0", made: true };

function saved(): Saved {
  const stats = new Stats();
  stats.cents = 4321;
  const debugLog = new DebugLog();
  debugLog.add({ place: "Cafe" });
  return { city: "Sofia, Bulgaria", country: "BGR", skipRoll: true, origin: [42.7, 23.3], zoom: 15, walker: walkerAt(42.7, 23.3), stats, debugLog, savedAt: 1_800_000_000_000, made: { "Sofia, Bulgaria": [INN] } };
}

describe("save file", () => {
  it("has nothing at first", () => {
    const f = new SaveFile(new MemStorage());
    expect(f.has()).toBe(false);
    expect(f.read()).toBeNull();
  });

  it("gives back the whole game it was given", () => {
    const f = new SaveFile(new MemStorage());
    expect(f.write(saved())).toBe("");
    expect(f.has()).toBe(true);
    const back = f.read() as Saved;
    expect(back).toMatchObject({ city: "Sofia, Bulgaria", country: "BGR", skipRoll: true, origin: [42.7, 23.3], zoom: 15, savedAt: 1_800_000_000_000 });
    expect(back.walker.totalM).toBe(123);
    expect(back.walker.position()).toEqual([42.7, 23.3]);
    expect(back.stats.cents).toBe(4321);
    expect(back.debugLog.entries).toMatchObject([{ place: "Cafe" }]);
    expect(back.made).toEqual({ "Sofia, Bulgaria": [INN] });
  });

  it("loads saves from before made-up places, with none made yet", () => {
    const kv = new MemStorage();
    const f = new SaveFile(kv);
    f.write(saved());
    const d = JSON.parse(kv.getItem(SAVE_KEY)!);
    delete d.made_places;
    kv.setItem(SAVE_KEY, JSON.stringify(d));
    expect((f.read() as Saved).made).toEqual({});
  });

  it("keeps the stored format that older versions wrote", () => {
    const kv = new MemStorage();
    new SaveFile(kv).write(saved());
    const d = JSON.parse(kv.getItem(SAVE_KEY)!);
    expect(Object.keys(d).sort()).toEqual(["city", "country", "debug_log",
      "made_places", "origin", "saved_at", "skip_roll", "stats", "walker", "zoom"]);
  });

  it("loads saves from before care packages with no clovers and nothing on its way", () => {
    const kv = new MemStorage();
    new SaveFile(kv).write(saved());
    const d = JSON.parse(kv.getItem(SAVE_KEY)!);
    delete d.stats.care;
    kv.setItem(SAVE_KEY, JSON.stringify(d));
    const back = new SaveFile(kv).read() as Saved;
    expect(back.stats.care.toJSON()).toEqual({ clovers: 0, day: "", today: 0, parcel: "", guess: null });
    expect(back.stats.cents).toBe(4321);
  });

  it("loads saves from the day ribbon's time and drops their stops", () => {
    const kv = new MemStorage();
    new SaveFile(kv).write(saved());
    const d = JSON.parse(kv.getItem(SAVE_KEY)!);
    expect(d.stats.stops).toBeUndefined();
    d.stats.stops = [{ k: "amenity/cafe", t: 100 }];
    kv.setItem(SAVE_KEY, JSON.stringify(d));
    const back = new SaveFile(kv).read() as Saved;
    new SaveFile(kv).write(back);
    expect(JSON.parse(kv.getItem(SAVE_KEY)!).stats.stops).toBeUndefined();
  });

  it("loads saves from before the weekly recap with a fresh week", () => {
    const kv = new MemStorage();
    new SaveFile(kv).write(saved());
    const d = JSON.parse(kv.getItem(SAVE_KEY)!);
    delete d.stats.week;
    kv.setItem(SAVE_KEY, JSON.stringify(d));
    const back = new SaveFile(kv).read() as Saved;
    expect(back.stats.week.tally.start).toBe(0);
    expect(back.stats.week.pending()).toBeNull();
  });

  it("loads saves with clovers from before guesses with no guess open", () => {
    const kv = new MemStorage();
    new SaveFile(kv).write(saved());
    const d = JSON.parse(kv.getItem(SAVE_KEY)!);
    d.stats.care = { clovers: 2, day: "2026-10-30", today: 1, parcel: "snack" };
    kv.setItem(SAVE_KEY, JSON.stringify(d));
    const back = new SaveFile(kv).read() as Saved;
    expect(back.stats.care.toJSON()).toEqual({ clovers: 2, day: "2026-10-30", today: 1, parcel: "snack", guess: null });
  });

  it("fills in what old saves lack: zoom and the city box", () => {
    const kv = new MemStorage();
    const f = new SaveFile(kv);
    f.write(saved());
    const d = JSON.parse(kv.getItem(SAVE_KEY)!);
    delete d.zoom;
    d.walker.bounds = null;
    kv.setItem(SAVE_KEY, JSON.stringify(d));
    const back = f.read() as Saved;
    expect(back.zoom).toBe(DEFAULT_ZOOM);
    expect(back.walker.bounds).not.toBeNull();
  });

  it("loads saves from before the storyteller: Classic, no tension, and keeps a chosen one", () => {
    const kv = new MemStorage();
    const f = new SaveFile(kv);
    const s = saved();
    s.stats.story.style = "chaotic";
    f.write(s);
    expect((f.read() as Saved).stats.story.style).toBe("chaotic");
    const d = JSON.parse(kv.getItem(SAVE_KEY)!);
    delete d.stats.story;
    kv.setItem(SAVE_KEY, JSON.stringify(d));
    expect((f.read() as Saved).stats.story).toMatchObject({ style: "classic", tension: 0, luckyMin: 0, recent: [] });
  });

  it("loads saves from before the catch-up without a time, so there is nothing to catch up", () => {
    const kv = new MemStorage();
    const f = new SaveFile(kv);
    f.write(saved());
    const d = JSON.parse(kv.getItem(SAVE_KEY)!);
    delete d.saved_at;
    kv.setItem(SAVE_KEY, JSON.stringify(d));
    expect((f.read() as Saved).savedAt).toBe(0);
  });

  it("loads saves from before fantasy mounts: a dragon not fed yet, no flight", () => {
    const kv = new MemStorage();
    const f = new SaveFile(kv);
    f.write(saved());
    const d = JSON.parse(kv.getItem(SAVE_KEY)!);
    delete d.stats.dragonFed;
    delete d.stats.dragonSulked;
    delete d.walker.flight;
    delete d.walker.afoot;
    kv.setItem(SAVE_KEY, JSON.stringify(d));
    const back = f.read() as Saved;
    expect(back.stats.dragonFed).toBe("");
    expect(back.stats.dragonSulked).toBe("");
    expect(back.walker.flight).toBeNull();
    expect(back.walker.afoot).toBe(false);
  });

  it("loads saves from before the bond, with starting trust and no lean", () => {
    const kv = new MemStorage();
    const f = new SaveFile(kv);
    f.write(saved());
    const d = JSON.parse(kv.getItem(SAVE_KEY)!);
    delete d.stats.bond;
    kv.setItem(SAVE_KEY, JSON.stringify(d));
    const back = (f.read() as Saved).stats;
    expect(back.bond.trust).toBe(TRUST_START);
    expect(back.bond.leaning()).toBe("");
    expect(back.bond.nudge).toBe("");
  });

  it("loads saves from before keepsakes, with none collected yet", () => {
    const kv = new MemStorage();
    const f = new SaveFile(kv);
    f.write(saved());
    const d = JSON.parse(kv.getItem(SAVE_KEY)!);
    delete d.stats.keepsakes;
    delete d.stats.where;
    kv.setItem(SAVE_KEY, JSON.stringify(d));
    const back = (f.read() as Saved).stats;
    expect(back.keepsakes.cards.size).toBe(0);
    expect(back.keepsakes.souvenirs.size).toBe(0);
    expect(back.where).toEqual({ city: "", code: "", country: "" });
    expect(back.cents).toBe(4321);
  });

  it("loads saves from before golden bricks and the life story, with the old firsts skipped", () => {
    const kv = new MemStorage();
    const f = new SaveFile(kv);
    f.write(saved());
    const d = JSON.parse(kv.getItem(SAVE_KEY)!);
    delete d.stats.bricks;
    delete d.stats.chronicle;
    kv.setItem(SAVE_KEY, JSON.stringify(d));
    const back = (f.read() as Saved).stats;
    expect(back.bricks.count).toBe(0);
    expect(back.bricks.built).toEqual([]);
    back.arrive("Paris, France", "FRA", "France");
    expect(back.chronicle.lines).toEqual([]);
  });

  it("loads saves from before place creatures: none met yet, free to meet one today", () => {
    const kv = new MemStorage();
    const f = new SaveFile(kv);
    f.write(saved());
    const d = JSON.parse(kv.getItem(SAVE_KEY)!);
    delete d.stats.creatures;
    kv.setItem(SAVE_KEY, JSON.stringify(d));
    const back = (f.read() as Saved).stats;
    expect(back.creatures.met).toEqual({});
    expect(back.creatures.roll("park", "2026-10-30", 0)?.id).toBe("dryad");
  });

  it("says why a save is unreadable", () => {
    const kv = new MemStorage();
    const f = new SaveFile(kv);
    kv.setItem(SAVE_KEY, "{oops");
    expect(f.read()).toBe("The saved game was unreadable; starting over");
    kv.setItem(SAVE_KEY, JSON.stringify({ city: "x" }));
    expect(f.read()).toBe("The saved game was unreadable; starting over");
    const d = JSON.parse((() => (f.write(saved()), kv.getItem(SAVE_KEY)!))());
    d.walker.from = null;
    kv.setItem(SAVE_KEY, JSON.stringify(d));
    expect(f.read()).toBe("The saved game had no spot for him; starting over");
  });

  it("keeps a copy of a save it can't use, so starting over doesn't lose it", () => {
    const kv = new MemStorage();
    kv.setItem(SAVE_KEY, "{oops");
    new SaveFile(kv).read();
    expect(kv.getItem(BAD_SAVE_KEY)).toBe("{oops");
  });

  it("calls a save unreadable when repairing it fails, instead of throwing", () => {
    const kv = new MemStorage();
    const f = new SaveFile(kv);
    f.write(saved());
    const d = JSON.parse(kv.getItem(SAVE_KEY)!);
    d.stats = null;
    kv.setItem(SAVE_KEY, JSON.stringify(d));
    expect(f.read()).toBe("The saved game was unreadable; starting over");
    expect(kv.getItem(BAD_SAVE_KEY)).toBe(JSON.stringify(d));
  });

  it("says when the device is full", () => {
    const kv = new MemStorage();
    kv.full = true;
    expect(new SaveFile(kv).write(saved())).toBe("Couldn't save the game (quota exceeded)");
  });

  it("clears the game but not the settings", () => {
    const kv = new MemStorage();
    const f = new SaveFile(kv);
    f.write(saved());
    f.writeSettings({ showCityArea: true, showRoute: false, cameraFollows: false, sound: false, problems: new Problems(), postcardName: "", alwaysDilemma: false });
    f.clear();
    expect(f.has()).toBe(false);
    expect(kv.getItem(SETTINGS_KEY)).not.toBeNull();
  });

  it("remembers the settings, with defaults for what is missing", () => {
    const kv = new MemStorage();
    const f = new SaveFile(kv);
    expect(f.readSettings()).toBeNull();
    const problems = new Problems();
    problems.quiet = true;
    problems.warn("kept");
    f.writeSettings({ showCityArea: true, showRoute: true, cameraFollows: false, sound: true, problems, postcardName: "Ivan", alwaysDilemma: true });
    const s = f.readSettings() as Exclude<ReturnType<SaveFile["readSettings"]>, string | null>;
    expect(s).toMatchObject({ showCityArea: true, showRoute: true, cameraFollows: false, sound: true, postcardName: "Ivan", alwaysDilemma: true });
    expect(s.problems.warnings.map((w) => w.text)).toContain("kept");
    kv.setItem(SETTINGS_KEY, "{}");
    expect(f.readSettings()).toMatchObject({ showCityArea: false, showRoute: false, cameraFollows: true, sound: false, postcardName: "", alwaysDilemma: false });
    kv.setItem(SETTINGS_KEY, "nope");
    expect(f.readSettings()).toBe("Settings were unreadable; using defaults");
  });

  it("works with no storage at all", () => {
    const f = new SaveFile(null);
    expect(f.write(saved())).toBe("");
    expect(f.has()).toBe(false);
    expect(f.read()).toBeNull();
  });
});
