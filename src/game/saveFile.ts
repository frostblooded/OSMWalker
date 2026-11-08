// The saved game and the settings on the device: what gets written, how old
// saves are repaired on the way back in, and why one can't be read. The game
// is kept under SAVE_KEY; settings (debug switches and the problem log) live
// apart under SETTINGS_KEY, so New city keeps them.
import { Choice } from "../core/cards";
import { DebugLog, type Entry } from "../core/debugLog";
import type { LatLon } from "../core/geo";
import { Problems } from "../core/problems";
import { Stats } from "../core/stats";
import { cityBounds, Walker, type WalkerSave } from "../core/walker";

export const SAVE_KEY = "osmwalker.save";
/** The last save that couldn't be used, copied here before the new game overwrites it. */
export const BAD_SAVE_KEY = "osmwalker.save.bad";
/** Kept apart from the save, so New city keeps them: debug toggles and the problem log. */
export const SETTINGS_KEY = "osmwalker.settings";
/** What older versions kept that this one no longer uses (the weather and the public holidays), removed on the next write. */
export const OLD_KEYS = ["osmwalker.weather", "osmwalker.holidays"];
export const DEFAULT_ZOOM = 17;

export type KV = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** A whole game, as the game hands it over and gets it back. */
export type Saved = {
  city: string;
  origin: LatLon;
  zoom: number;
  walker: Walker;
  stats: Stats;
  debugLog: DebugLog;
  choice: Choice;
};

export type Settings = { showCityArea: boolean; showRoute: boolean; cameraFollows: boolean; problems: Problems };

/** The stored form; its keys never change, so older saves still load (what they have beyond these is dropped). */
type Stored = {
  city: string;
  origin: LatLon;
  zoom: number;
  walker: WalkerSave;
  stats: ReturnType<Stats["toJSON"]>;
  debug_log: Entry[];
  /** The cards on offer; saves from before the cards have none. */
  choice?: ReturnType<Choice["toJSON"]>;
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
    const d: Stored = { city: g.city, origin: g.origin, zoom: g.zoom, walker: g.walker.toJSON(), stats: g.stats.toJSON(), debug_log: g.debugLog.toJSON(), choice: g.choice.toJSON() };
    try {
      for (const k of OLD_KEYS) this.kv.removeItem(k);
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
      // An old save on a ride: he is put where it was going (see Walker.fromJSON), so the trail breaks there.
      const to = d.walker.travel?.to;
      const stats = Stats.fromJSON(d.stats);
      if (d.walker.travel || d.walker.flight) stats.history.breakTrail();
      return {
        city: to?.name ?? d.city,
        origin: to ? [to.lat, to.lon] : d.origin,
        zoom: d.zoom || DEFAULT_ZOOM,
        walker,
        // Stats.fromJSON keeps what this version has and drops the rest (an old save's needs, gear, quests and so on).
        stats,
        debugLog: DebugLog.fromJSON(d.debug_log),
        choice: Choice.fromJSON(d.choice),
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
}
