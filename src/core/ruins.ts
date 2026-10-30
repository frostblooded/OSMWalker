// Ruin crawls, the part that is saved and loaded at startup: which real
// castles and ruins he crawled lately (once a week each) and the logs of
// his last crawls. The rooms themselves live in crawl.ts, loaded at idle.
import type { Item } from "./items";
import type { Rng } from "./rng";
import type { Place, Stats } from "./stats";

/** He crawls the same place at most once in this long. */
export const CRAWL_EVERY_S = 7 * 86400;
/** Crawl logs kept for the Collection sheet, few enough for one card. */
export const LOG_SIZE = 5;

export const isRuin = (p: Pick<Place, "class">) => p.class === "castle";

export type Room = { text: string; won: boolean; how: string };
export type Log = { name: string; city: string; t: number; rooms: Room[]; of: number; found: Pick<Item, "name" | "rarity"> | null };
export type Crawler = (stats: Stats, place: Place, rng: Rng) => Log;

let crawler: Crawler | null = null;
/** crawl.ts hands its crawl over here once loaded; until then a ruin is just a castle. */
export const setCrawler = (c: Crawler | null) => {
  crawler = c;
};
export const getCrawler = () => crawler;

export class Ruins {
  /** When he last crawled each place, by visit key. */
  last: Record<string, number> = {};
  logs: Log[] = [];
  /** Crawls in his whole life. */
  count = 0;

  /** True when the place under `key` may be crawled at `t`. */
  due(key: string, t: number): boolean {
    return t - (this.last[key] ?? -Infinity) >= CRAWL_EVERY_S;
  }

  /** Notes a crawl; places crawled over a week ago are forgotten, so the save stays small. */
  done(key: string, log: Log): void {
    for (const [k, t] of Object.entries(this.last)) if (log.t - t >= CRAWL_EVERY_S) delete this.last[k];
    this.last[key] = log.t;
    this.logs = [...this.logs, log].slice(-LOG_SIZE);
    this.count++;
  }

  toJSON() {
    return { ...this };
  }

  static fromJSON(d: Partial<ReturnType<Ruins["toJSON"]>> | undefined): Ruins {
    return Object.assign(new Ruins(), d);
  }
}
