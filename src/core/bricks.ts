// Golden bricks (Godville's temple bricks): very rare finds at his stops, at
// most BRICKS_PER_DAY a day, so his first goal takes about a month. With
// enough for the next monument he pays for it at the next real park he
// reaches: a bench with his name, then a fountain, a statue, and then golden
// towers (the fantasy creeping into the real map). The map marks each one.

/** Chance of a brick at a stop, and the most he finds in one day (by the device's date). */
export const BRICK_CHANCE = 1 / 6;
export const BRICKS_PER_DAY = 3;

/** What he saves bricks for, in order; after the last he keeps building that one. */
export const MONUMENTS = [
  { icon: "🪑", name: "bench", bricks: 100 },
  { icon: "⛲", name: "fountain", bricks: 150 },
  { icon: "🗿", name: "statue of himself", bricks: 250 },
  { icon: "🏰", name: "little golden tower", bricks: 400 },
] as const;
export type MonumentKind = (typeof MONUMENTS)[number];

/** One he built: which (an index into MONUMENTS), in which park and city, where and when (unix seconds). */
export type Monument = { kind: number; park: string; city: string; lat: number; lon: number; t: number };

/** The class of place he builds in. */
export const BUILD_AT = "park";

export class Bricks {
  count = 0;
  /** The day `today` counts for, and bricks found that day. */
  day = "";
  today = 0;
  built: Monument[] = [];

  /** The monument he saves for now. */
  next(): MonumentKind {
    return MONUMENTS[Math.min(this.built.length, MONUMENTS.length - 1)]!;
  }

  /** A stop on `day`, with `r` in [0, 1): true when he finds a brick there. */
  find(day: string, r: number): boolean {
    if (day !== this.day) [this.day, this.today] = [day, 0];
    if (this.today >= BRICKS_PER_DAY || r >= BRICK_CHANCE) return false;
    this.count++;
    this.today++;
    return true;
  }

  /** At `place` in `city`: builds the next monument when he has the bricks and it is a real park; null otherwise. */
  build(place: { name: string; class: string; lat: number; lon: number; made?: unknown }, city: string, t: number): Monument | null {
    const next = this.next();
    if (this.count < next.bricks || place.class !== BUILD_AT || place.made) return null;
    this.count -= next.bricks;
    const m = { kind: Math.min(this.built.length, MONUMENTS.length - 1), park: place.name, city, lat: place.lat, lon: place.lon, t };
    this.built.push(m);
    return m;
  }

  toJSON() {
    return { ...this };
  }

  /** Old saves have no bricks. */
  static fromJSON(d?: Partial<Bricks>): Bricks {
    return Object.assign(new Bricks(), d ?? {});
  }
}
