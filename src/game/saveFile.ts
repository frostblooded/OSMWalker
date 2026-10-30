// The saved game and the settings on the device: what gets written, how old
// saves are repaired on the way back in, and why one can't be read. The game
// is kept under SAVE_KEY; settings (debug switches and the problem log) live
// apart under SETTINGS_KEY, so New city keeps them, and so do the public
// holiday lists under HOLIDAYS_KEY.
import { DebugLog, type Entry } from "../core/debugLog";
import type { Holiday } from "../core/holidays";
import { Problems } from "../core/problems";
import { Stats } from "../core/stats";
import type { LatLon } from "../core/trips";
import { cityBounds, Walker, type WalkerSave } from "../core/walker";

export const SAVE_KEY = "osmwalker.save";
/** Kept apart from the save, so New city keeps them: debug toggles and the problem log. */
export const SETTINGS_KEY = "osmwalker.settings";
/** Public holidays fetched from Nager.Date, kept a year so each country is asked once a year. */
export const HOLIDAYS_KEY = "osmwalker.holidays";
export const DEFAULT_ZOOM = 17;

/** Holiday lists by "CC:year", and the last "CC:date" whose holiday he has already noticed. */
export type HolidayBook = { lists: Record<string, Holiday[]>; said: string };

export type KV = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** A whole game, as the game hands it over and gets it back. */
export type Saved = {
  city: string;
  /** "" when an old save didn't record it. */
  country: string;
  skipRoll: boolean;
  origin: LatLon;
  zoom: number;
  walker: Walker;
  stats: Stats;
  debugLog: DebugLog;
  /** Unix ms when it was saved, for the catch-up; 0 when an old save didn't record it. */
  savedAt: number;
};

export type Settings = { showCityArea: boolean; showRoute: boolean; cameraFollows: boolean; problems: Problems };

/** The stored form; its keys never change, so older saves still load. */
type Stored = {
  city: string;
  country: string;
  skip_roll: boolean;
  origin: LatLon;
  zoom: number;
  walker: WalkerSave;
  stats: ReturnType<Stats["toJSON"]>;
  debug_log: Entry[];
  saved_at?: number;
};
type StoredSettings = { show_city_area?: boolean; show_route?: boolean; camera_follows?: boolean; problems?: unknown };

export function safeStorage(): KV | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export class SaveFile {
  constructor(private readonly kv: KV | null = safeStorage()) {}

  has(): boolean {
    try {
      return !!this.kv?.getItem(SAVE_KEY);
    } catch {
      return false;
    }
  }

  /** Returns "" when saved (or when there is nowhere to save), else what went wrong. */
  write(g: Saved): string {
    if (!this.kv) return "";
    const d: Stored = {
      city: g.city,
      country: g.country,
      skip_roll: g.skipRoll,
      origin: g.origin,
      zoom: g.zoom,
      walker: g.walker.toJSON(),
      stats: g.stats.toJSON(),
      debug_log: g.debugLog.toJSON(),
      saved_at: g.savedAt,
    };
    try {
      this.kv.setItem(SAVE_KEY, JSON.stringify(d));
      return "";
    } catch (e) {
      return `Couldn't save the game (${(e as Error).message})`;
    }
  }

  /** The saved game, null when there is none, or why it can't be used. */
  read(): Saved | string | null {
    const raw = this.kv?.getItem(SAVE_KEY);
    if (!raw) return null;
    let d: Stored;
    try {
      d = JSON.parse(raw) as Stored;
      if (!d.walker) throw new Error("no walker");
    } catch {
      return "The saved game was unreadable; starting over";
    }
    const walker = Walker.fromJSON(d.walker);
    if (walker.fromNode === null || !walker.graph.hasNode(walker.fromNode)) return "The saved game had no spot for him; starting over";
    walker.bounds ??= cityBounds(d.origin[0], d.origin[1]);
    return {
      city: d.city,
      country: d.country || "",
      skipRoll: d.skip_roll,
      origin: d.origin,
      zoom: d.zoom || DEFAULT_ZOOM,
      walker,
      stats: Stats.fromJSON(d.stats),
      debugLog: DebugLog.fromJSON(d.debug_log),
      savedAt: d.saved_at ?? 0,
    };
  }

  /** New city: drops the game, keeps the settings. */
  clear(): void {
    this.kv?.removeItem(SAVE_KEY);
  }

  /** The settings, null when there are none, or why they can't be read. */
  readSettings(): Settings | string | null {
    const raw = this.kv?.getItem(SETTINGS_KEY);
    if (!raw) return null;
    try {
      const d = JSON.parse(raw) as StoredSettings;
      return { showCityArea: !!d.show_city_area, showRoute: !!d.show_route, cameraFollows: d.camera_follows ?? true, problems: Problems.fromJSON(d.problems) };
    } catch {
      return "Settings were unreadable; using defaults";
    }
  }

  writeSettings(s: Settings): void {
    try {
      const d: StoredSettings = { show_city_area: s.showCityArea, show_route: s.showRoute, camera_follows: s.cameraFollows, problems: s.problems };
      this.kv?.setItem(SETTINGS_KEY, JSON.stringify(d));
    } catch {
      // Out of space: settings are only a convenience.
    }
  }

  /** The holiday lists, empty when there are none or they can't be read. */
  readHolidays(): HolidayBook {
    try {
      const d = JSON.parse(this.kv?.getItem(HOLIDAYS_KEY) ?? "{}") as Partial<HolidayBook>;
      return { lists: d.lists ?? {}, said: d.said ?? "" };
    } catch {
      return { lists: {}, said: "" };
    }
  }

  /** Keeps only this year's and later lists, so the book never grows. */
  writeHolidays(b: HolidayBook, year: number): void {
    const lists = Object.fromEntries(Object.entries(b.lists).filter(([k]) => Number(k.split(":")[1]) >= year));
    try {
      this.kv?.setItem(HOLIDAYS_KEY, JSON.stringify({ lists, said: b.said }));
    } catch {
      // Out of space: they are fetched again next time.
    }
  }
}
