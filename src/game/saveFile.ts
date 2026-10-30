// The saved game and the settings on the device: what gets written, how old
// saves are repaired on the way back in, and why one can't be read. The game
// is kept under SAVE_KEY; settings (debug switches and the problem log) live
// apart under SETTINGS_KEY, so New city keeps them; so does the name you
// sign postcards with.
import { DebugLog, type Entry } from "../core/debugLog";
import { Problems } from "../core/problems";
import { Stats, type Place } from "../core/stats";
import type { LatLon } from "../core/trips";
import { cityBounds, Walker, type WalkerSave } from "../core/walker";

export const SAVE_KEY = "osmwalker.save";
/** The last save that couldn't be used, copied here before the new game overwrites it. */
export const BAD_SAVE_KEY = "osmwalker.save.bad";
/** Kept apart from the save, so New city keeps them: debug toggles and the problem log. */
export const SETTINGS_KEY = "osmwalker.settings";
export const DEFAULT_ZOOM = 17;

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
  /** Made-up places (core/poiGen.ts) by city, so a city keeps its own; empty in old saves. */
  made: Record<string, Place[]>;
};

export type Settings = { showCityArea: boolean; showRoute: boolean; cameraFollows: boolean; sound: boolean; problems: Problems; postcardName: string; alwaysDilemma: boolean };

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
  made_places?: Record<string, Place[]>;
};
type StoredSettings = { show_city_area?: boolean; show_route?: boolean; camera_follows?: boolean; sound?: boolean; problems?: unknown; postcard_name?: string; always_dilemma?: boolean };

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
      made_places: g.made,
    };
    try {
      this.kv.setItem(SAVE_KEY, JSON.stringify(d));
      return "";
    } catch (e) {
      return `Couldn't save the game (${(e as Error).message})`;
    }
  }

  /** The saved game, null when there is none, or why it can't be used (then a copy is kept under BAD_SAVE_KEY). */
  read(): Saved | string | null {
    const raw = this.kv?.getItem(SAVE_KEY);
    if (!raw) return null;
    const out = this.parse(raw);
    if (typeof out === "string") {
      try {
        this.kv?.setItem(BAD_SAVE_KEY, raw);
      } catch {
        // full: the save itself is still there until the next write
      }
    }
    return out;
  }

  private parse(raw: string): Saved | string {
    try {
      const d = JSON.parse(raw) as Stored;
      if (!d.walker) throw new Error("no walker");
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
        // Stats.fromJSON repairs what old saves lack: care packages (Care.fromJSON), keepsakes (no items noted,
        // odd places or badges yet; the next badge check notes his gear and bag), where he is, item stories, the week,
        // his bond with you, golden bricks, his life story (the firsts already past marked done) the creatures he met (none) and the storyteller (Classic, no tension).
        // The day's stops that older saves carry are dropped.
        stats: Stats.fromJSON(d.stats),
        debugLog: DebugLog.fromJSON(d.debug_log),
        savedAt: d.saved_at ?? 0,
        made: d.made_places ?? {},
      };
    } catch {
      return "The saved game was unreadable; starting over";
    }
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
      return { showCityArea: !!d.show_city_area, showRoute: !!d.show_route, cameraFollows: d.camera_follows ?? true, sound: !!d.sound, problems: Problems.fromJSON(d.problems), postcardName: d.postcard_name ?? "", alwaysDilemma: !!d.always_dilemma };
    } catch {
      return "Settings were unreadable; using defaults";
    }
  }

  writeSettings(s: Settings): void {
    try {
      const d: StoredSettings = { show_city_area: s.showCityArea, show_route: s.showRoute, camera_follows: s.cameraFollows, sound: s.sound, problems: s.problems, postcard_name: s.postcardName, always_dilemma: s.alwaysDilemma };
      this.kv?.setItem(SETTINGS_KEY, JSON.stringify(d));
    } catch {
      // Out of space: settings are only a convenience.
    }
  }
}
