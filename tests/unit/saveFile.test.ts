import { describe, expect, it } from "vitest";
import { DebugLog } from "../../src/core/debugLog";
import { StreetGraph } from "../../src/core/graph";
import { Problems } from "../../src/core/problems";
import { Stats } from "../../src/core/stats";
import { LONE_NODE, Walker } from "../../src/core/walker";
import { BAD_SAVE_KEY, DEFAULT_ZOOM, OLD_KEYS, SAVE_KEY, SETTINGS_KEY, SaveFile, type Saved } from "../../src/game/saveFile";

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

function saved(): Saved {
  const stats = new Stats();
  stats.cents = 4321;
  stats.history.moveTo(42.7, 23.3);
  stats.history.moveTo(42.701, 23.3);
  stats.addXp(150);
  stats.visited.add("Cafe@42.7000,23.3000");
  const debugLog = new DebugLog();
  debugLog.add({ place: "Cafe" });
  return { city: "Sofia, Bulgaria", origin: [42.7, 23.3], zoom: 15, walker: walkerAt(42.7, 23.3), stats, debugLog };
}

/** Writes `saved()`, lets `edit` change the stored JSON, and reads it back. */
type Raw = Record<string, unknown> & { stats: Record<string, unknown> | null; walker: Record<string, unknown> };
function edited(edit: (d: Raw) => void): Saved | string | null {
  const kv = new MemStorage();
  const f = new SaveFile(kv);
  f.write(saved());
  const d = JSON.parse(kv.getItem(SAVE_KEY)!) as Raw;
  edit(d);
  kv.setItem(SAVE_KEY, JSON.stringify(d));
  return f.read();
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
    expect(back).toMatchObject({ city: "Sofia, Bulgaria", origin: [42.7, 23.3], zoom: 15 });
    expect(back.walker.totalM).toBe(123);
    expect(back.walker.position()).toEqual([42.7, 23.3]);
    expect(back.stats).toMatchObject({ cents: 4321, xp: 50, level: 2 });
    expect([...back.stats.visited]).toEqual(["Cafe@42.7000,23.3000"]);
    expect(back.debugLog.entries).toMatchObject([{ place: "Cafe" }]);
  });

  it("keeps the stored format that older versions wrote", () => {
    const kv = new MemStorage();
    new SaveFile(kv).write(saved());
    const d = JSON.parse(kv.getItem(SAVE_KEY)!);
    expect(Object.keys(d).sort()).toEqual(["city", "debug_log", "origin", "stats", "walker", "zoom"]);
  });

  it("loads a save from before the base loop: XP, level and places kept, money from afresh, the rest dropped", () => {
    const back = edited((d) => {
      const st = d.stats!;
      delete st.economy;
      st.meters = { energy: 3 };
      st.bag = [{ name: "Bike" }];
      d.boost_s = 900;
      d.country = "BGR";
    }) as Saved;
    expect(back.stats.cents).toBe(0);
    expect(back.stats).toMatchObject({ xp: 50, level: 2 });
    expect(back.stats.visited.size).toBe(1);
    expect(back.stats).not.toHaveProperty("meters");
    expect(back).not.toHaveProperty("boostS");
  });

  it("puts him in the city an old save was riding to, waiting for its streets, with a break in his trail", () => {
    const back = edited((d) => {
      d.walker.travel = { arrive: [42.15, 24.75], to: { name: "Plovdiv", lat: 42.15, lon: 24.75 } };
    }) as Saved;
    expect(back.city).toBe("Plovdiv");
    expect(back.origin).toEqual([42.15, 24.75]);
    expect(back.walker.fromNode).toBe(LONE_NODE);
    expect(back.walker.position()).toEqual([42.15, 24.75]);
    expect(back.walker.goal).toBeNull();
    expect(back.walker.needsData()).toBe(true);
    // No line is drawn across the jump.
    back.stats.history.moveTo(42.15, 24.75);
    back.stats.history.moveTo(42.151, 24.75);
    expect(back.stats.history.segments()).toHaveLength(2);
  });

  it("puts him where an old save's flight was landing, in the same city", () => {
    const back = edited((d) => {
      d.walker.flight = { to: [42.71, 23.31] };
    }) as Saved;
    expect(back.city).toBe("Sofia, Bulgaria");
    expect(back.walker.position()).toEqual([42.71, 23.31]);
  });

  it("removes what older versions kept apart on the next write", () => {
    const kv = new MemStorage();
    for (const k of OLD_KEYS) kv.setItem(k, "{}");
    new SaveFile(kv).write(saved());
    for (const k of OLD_KEYS) expect(kv.getItem(k)).toBeNull();
  });

  it("fills in what old saves lack: zoom and the city box", () => {
    const back = edited((d) => {
      delete d.zoom;
      d.walker.bounds = null;
    }) as Saved;
    expect(back.zoom).toBe(DEFAULT_ZOOM);
    expect(back.walker.bounds).not.toBeNull();
  });

  it("says why a save is unreadable", () => {
    const kv = new MemStorage();
    const f = new SaveFile(kv);
    kv.setItem(SAVE_KEY, "{oops");
    expect(f.read()).toBe("The saved game was unreadable; starting over");
    kv.setItem(SAVE_KEY, JSON.stringify({ city: "x" }));
    expect(f.read()).toBe("The saved game was unreadable; starting over");
    expect(edited((d) => (d.walker.from = null))).toBe("The saved game had no spot for him; starting over");
  });

  it("keeps a copy of a save it can't use, so starting over doesn't lose it", () => {
    const kv = new MemStorage();
    kv.setItem(SAVE_KEY, "{oops");
    new SaveFile(kv).read();
    expect(kv.getItem(BAD_SAVE_KEY)).toBe("{oops");
  });

  it("calls a save unreadable when repairing it fails, instead of throwing", () => {
    expect(edited((d) => (d.stats = null))).toBe("The saved game was unreadable; starting over");
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
    f.writeSettings({ showCityArea: true, showRoute: false, cameraFollows: false, problems: new Problems() });
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
    f.writeSettings({ showCityArea: true, showRoute: true, cameraFollows: false, problems });
    const s = f.readSettings() as Exclude<ReturnType<SaveFile["readSettings"]>, string | null>;
    expect(s).toMatchObject({ showCityArea: true, showRoute: true, cameraFollows: false });
    expect(s.problems.warnings.map((w) => w.text)).toContain("kept");
    kv.setItem(SETTINGS_KEY, "{}");
    expect(f.readSettings()).toMatchObject({ showCityArea: false, showRoute: false, cameraFollows: true });
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
