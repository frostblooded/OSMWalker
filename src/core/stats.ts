// His progress: money, XP and level, the places he has been to, and his
// history (the feed and the trail he walked). Reaching a place gives its
// reward (see places.ts).
import { History } from "./history";
import { euro } from "./money";
import { rewardOf, type Reward } from "./places";

export type Place = { name: string; class: string; subclass: string; rank: number; lat: number; lon: number; [k: string]: unknown };

/** XP from one level to the next: XP_PER_LEVEL times the level. */
export const XP_PER_LEVEL = 100;
export const xpToNext = (lvl: number) => XP_PER_LEVEL * lvl;
/** The save version of the base loop's economy: older saves start its money afresh. */
export const ECONOMY = 1;

export class Stats {
  /** His money, in euro cents. */
  cents = 0;
  xp = 0;
  level = 1;
  history = new History();
  /** Places he has reached, by visitKey. */
  visited = new Set<string>();
  /** Unix seconds, for history entries; tests replace it. */
  now = () => Math.floor(Date.now() / 1000);
  /** Hears every feed line as it is said; tests collect them. */
  onSay: ((line: string, t: number) => void) | null = null;

  /** True when he has never reached `place`. */
  isNew(place: Pick<Place, "name" | "lat" | "lon">): boolean {
    return !this.visited.has(visitKey(place));
  }

  /** He reached `place`: its reward lands and the feed says so. Returns the reward. */
  reach(place: Place): Reward {
    const isNew = this.isNew(place);
    const r = rewardOf(place, isNew);
    this.visited.add(visitKey(place));
    this.cents += r.cents;
    const got = [r.cents ? `+${euro(r.cents)}` : "", r.xp ? `+${r.xp} XP` : ""].filter(Boolean).join(", ");
    this.say(`${isNew ? "Found" : "Reached"} ${place.name}${got ? ` (${got})` : ""}`);
    this.addXp(r.xp);
    return r;
  }

  addXp(n: number): void {
    this.xp += n;
    while (this.xp >= xpToNext(this.level)) {
      this.xp -= xpToNext(this.level);
      this.level++;
      this.say(`Reached level ${this.level}`);
    }
  }

  say(line: string): void {
    const t = this.now();
    this.history.add(line, t);
    this.onSay?.(line, t);
  }

  toJSON() {
    return { economy: ECONOMY, cents: this.cents, xp: this.xp, level: this.level, history: this.history.toJSON(), visited: [...this.visited] };
  }

  /** A save, from this version or an older one: what the game no longer has is left out, and money from before the base loop starts at 0. */
  static fromJSON(d: Partial<ReturnType<Stats["toJSON"]>>): Stats {
    const s = new Stats();
    if (d.economy === ECONOMY && typeof d.cents === "number") s.cents = d.cents;
    if (typeof d.xp === "number") s.xp = d.xp;
    if (typeof d.level === "number") s.level = d.level;
    if (d.history) s.history = History.fromJSON(d.history);
    s.visited = new Set(d.visited ?? []);
    return s;
  }
}

/** The key a place is remembered by: its name and where it is. */
export const visitKey = (place: Pick<Place, "name" | "lat" | "lon">) => `${place.name}@${place.lat.toFixed(4)},${place.lon.toFixed(4)}`;
