// His spot (Stardew's schedules): the real place he has reached most in a
// city, once he has been there SPOT_MIN times, is his spot. It shows a
// house on the map, pulls his goal SPOT_PULL times as hard in the morning
// and gives him a regular's discount there. Each city keeps its top
// SPOT_KEEP places by visits; a new place pushes out the least recently
// reached of the least visited. Pure; Stats owns one.
import type { Place } from "./stats";

export const SPOT_MIN = 3;
export const SPOT_PULL = 3;
/** Hours that count as morning for the pull (the local hour, from SPOT_FROM up to SPOT_TO). */
export const SPOT_FROM = 6;
export const SPOT_TO = 11;
/** Share off what he pays at his spot. */
export const SPOT_DISCOUNT = 0.1;
export const SPOT_KEEP = 12;

/** `t` counts up with each visit in the city, so the least recently reached place can go. */
export type Visits = { name: string; lat: number; lon: number; n: number; t: number };

const same = (a: Pick<Place, "name" | "lat" | "lon">, b: Pick<Place, "name" | "lat" | "lon">) => a.name === b.name && a.lat.toFixed(4) === b.lat.toFixed(4) && a.lon.toFixed(4) === b.lon.toFixed(4);

export class Spots {
  /** City -> its most visited places, most visits first. */
  cities: Record<string, Visits[]> = {};

  /** He reached `place` in `city`; returns a feed line when it just became his spot, else "". */
  visit(city: string, place: Pick<Place, "name" | "lat" | "lon">): string {
    const list = (this.cities[city] ??= []);
    const was = this.spot(city);
    const t = Math.max(0, ...list.map((x) => x.t)) + 1;
    let v = list.find((x) => same(x, place));
    if (!v) {
      if (list.length >= SPOT_KEEP) {
        // Never his spot, so it only changes with a visit (and its line).
        const rest = list.filter((x) => x !== was);
        const low = Math.min(...rest.map((x) => x.n));
        const old = rest.filter((x) => x.n === low).reduce((a, b) => (b.t < a.t ? b : a));
        list.splice(list.indexOf(old), 1);
      }
      v = { name: place.name, lat: place.lat, lon: place.lon, n: 0, t };
      list.push(v);
    }
    v.n++;
    v.t = t;
    // Stable, so a tie keeps the old spot.
    list.sort((a, b) => b.n - a.n);
    const now = this.spot(city);
    return now === v && was !== v ? `🏠 ${v.name} is his spot now. He feels at home there` : "";
  }

  /** His spot in `city`, or null. */
  spot(city: string): Visits | null {
    const top = this.cities[city]?.[0];
    return top && top.n >= SPOT_MIN ? top : null;
  }

  /** True when `place` is his spot in `city`. */
  isSpot(city: string, place: Pick<Place, "name" | "lat" | "lon">): boolean {
    const s = this.spot(city);
    return !!s && same(s, place);
  }

  /** How hard `place` pulls his goal at local `hour`: SPOT_PULL for his spot in the morning, else 1. */
  pull(city: string, place: Pick<Place, "name" | "lat" | "lon">, hour: number): number {
    return hour >= SPOT_FROM && hour < SPOT_TO && this.isSpot(city, place) ? SPOT_PULL : 1;
  }

  toJSON() {
    return { cities: this.cities };
  }

  static fromJSON(d?: Partial<ReturnType<Spots["toJSON"]>>): Spots {
    const s = new Spots();
    for (const [c, list] of Object.entries(d?.cities ?? {})) s.cities[c] = list.map((v) => ({ ...v }));
    return s;
  }
}
