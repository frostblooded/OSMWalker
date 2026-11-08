// His progress: money, XP and level, the upgrades he bought, the places he
// has been to, and his history (the feed and the trail he walked). Reaching a
// place gives the reward its card promised (see cards.ts).
import { History } from "./history";
import { euro } from "./money";
import type { Reward } from "./places";
import { LADDER, nextUpgrade, opensAt, type Upgrade, type UpgradeId } from "./upgrades";

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
  /** Upgrades he owns, by id. */
  upgrades = new Set<UpgradeId>();

  /** True when he has never reached `place`. */
  isNew(place: Pick<Place, "name" | "lat" | "lon">): boolean {
    return !this.visited.has(visitKey(place));
  }

  /** He reached `place`: reward `r` (its card's) lands and the feed says so. */
  reach(place: Place, r: Reward): void {
    const isNew = this.isNew(place);
    this.visited.add(visitKey(place));
    this.cents += r.cents;
    const got = [r.cents ? `+${euro(r.cents)}` : "", r.xp ? `+${r.xp} XP` : ""].filter(Boolean).join(", ");
    this.say(`${isNew ? "Found" : "Reached"} ${place.name}${got ? ` (${got})` : ""}`);
    this.addXp(r.xp);
  }

  /** Buys `u` if he can afford it; false when he can't (or has it). */
  buy(u: Upgrade, at: Place): boolean {
    if (this.upgrades.has(u.id) || this.cents < u.cents) return false;
    this.cents -= u.cents;
    this.upgrades.add(u.id);
    this.say(`Bought a ${u.icon} ${u.name} at ${at.name} for ${euro(u.cents)}: ${u.does}`);
    return true;
  }

  addXp(n: number): void {
    this.xp += n;
    while (this.xp >= xpToNext(this.level)) {
      this.xp -= xpToNext(this.level);
      this.level++;
      const u = opensAt(this.level);
      // Named only when it is the next to buy: upgrades are bought in order.
      const open = u && u === nextUpgrade(this.upgrades) ? u : undefined;
      this.say(open ? `Reached level ${this.level}: ${open.where} now sells a ${open.icon} ${open.name} (${euro(open.cents)})` : `Reached level ${this.level}`);
    }
  }

  say(line: string): void {
    this.history.add(line, Math.floor(Date.now() / 1000));
  }

  toJSON() {
    return { economy: ECONOMY, cents: this.cents, xp: this.xp, level: this.level, history: this.history.toJSON(), visited: [...this.visited], upgrades: [...this.upgrades] };
  }

  /** A save, from this version or an older one: what the game no longer has is left out, and money from before the base loop starts at 0. */
  static fromJSON(d: Partial<ReturnType<Stats["toJSON"]>>): Stats {
    const s = new Stats();
    if (d.economy === ECONOMY && typeof d.cents === "number") s.cents = d.cents;
    if (typeof d.xp === "number") s.xp = d.xp;
    if (typeof d.level === "number") s.level = d.level;
    if (d.history) s.history = History.fromJSON(d.history);
    s.visited = new Set(d.visited ?? []);
    // In ladder order, so an unknown id from a newer version is left out.
    s.upgrades = new Set(LADDER.filter((u) => d.upgrades?.includes(u.id)).map((u) => u.id));
    return s;
  }
}

/** The key a place is remembered by: its name and where it is. */
export const visitKey = (place: Pick<Place, "name" | "lat" | "lon">) => `${place.name}@${place.lat.toFixed(4)},${place.lon.toFixed(4)}`;
