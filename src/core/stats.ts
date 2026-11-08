// His progress: money, deliveries made, the upgrades he bought, the places he
// has been to, and his history (the feed and the trail he walked).
import { History } from "./history";
import { euro } from "./money";
import { count, isOpen, priceOf, type Owned, type Upgrade, UPGRADES } from "./upgrades";

export type Place = { name: string; class: string; subclass: string; rank: number; lat: number; lon: number; [k: string]: unknown };

/** The save version of the economy: older saves start their money afresh. */
export const ECONOMY = 2;

export class Stats {
  /** His money, in euro cents. */
  cents = 0;
  /** Orders delivered. */
  deliveries = 0;
  history = new History();
  /** Places he has reached, by visitKey. */
  visited = new Set<string>();
  /** How many of each upgrade he owns. */
  upgrades: Owned = {};

  /** True when he has never reached `place`. */
  isNew(place: Pick<Place, "name" | "lat" | "lon">): boolean {
    return !this.visited.has(visitKey(place));
  }

  /** He reached `place`; it counts as visited. */
  reach(place: Pick<Place, "name" | "lat" | "lon">): void {
    this.visited.add(visitKey(place));
  }

  /** He handed over an order worth `cents`. */
  deliver(cents: number): void {
    this.cents += cents;
    this.deliveries++;
  }

  /** Buys one more `u` if it is open and he can afford it; false when not. */
  buy(u: Upgrade): boolean {
    const price = priceOf(u, this.upgrades);
    if (!isOpen(u, this.upgrades) || this.cents < price) return false;
    this.cents -= price;
    const n = count(this.upgrades, u.id) + 1;
    this.upgrades[u.id] = n;
    this.say(`Bought ${u.icon} ${u.name} #${n} for ${euro(price)}: ${u.does}`);
    return true;
  }

  say(line: string): void {
    this.history.add(line, Math.floor(Date.now() / 1000));
  }

  toJSON() {
    return { economy: ECONOMY, cents: this.cents, deliveries: this.deliveries, history: this.history.toJSON(), visited: [...this.visited], upgrades: this.upgrades };
  }

  /** A save, from this version or an older one: what the game no longer has (XP, levels, old upgrades) is left out, and money from an older economy starts at 0. */
  static fromJSON(d: Partial<Record<keyof ReturnType<Stats["toJSON"]>, unknown>>): Stats {
    const s = new Stats();
    if (d.economy === ECONOMY) {
      if (typeof d.cents === "number") s.cents = d.cents;
      if (typeof d.deliveries === "number") s.deliveries = d.deliveries;
      const up = (d.upgrades ?? {}) as Record<string, unknown>;
      for (const u of UPGRADES) if (typeof up[u.id] === "number" && (up[u.id] as number) > 0) s.upgrades[u.id] = Math.floor(up[u.id] as number);
    }
    if (d.history) s.history = History.fromJSON(d.history as Parameters<typeof History.fromJSON>[0]);
    if (Array.isArray(d.visited)) s.visited = new Set(d.visited.filter((v): v is string => typeof v === "string"));
    return s;
  }
}

/** The key a place is remembered by: its name and where it is. */
export const visitKey = (place: Pick<Place, "name" | "lat" | "lon">) => `${place.name}@${place.lat.toFixed(4)},${place.lon.toFixed(4)}`;
