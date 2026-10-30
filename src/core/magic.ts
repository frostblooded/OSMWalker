// Ley lines and small spells: a little magic on the real map. Every church,
// monument, memorial and castle he knows of is joined by a ley line to the
// nearest other one. Walking along a line slowly fills his Magic meter and
// charms his luck; reaching a place on one gives a burst, once a day each.
// Old books in real libraries and bookshops now and then teach him a spell,
// which he casts on his own for Magic: a few fix a low meter, the others are
// short buffs he spends spare Magic on. The spells are data (data/spells.json).
import { offsetM } from "./geo";
import type { LatLon } from "./trips";
import type { Action, Fx, Meter, Place } from "./stats";

/** Place classes ley lines join. */
export const LEY_CLASSES: readonly string[] = ["place_of_worship", "monument", "memorial", "castle"];
/** How close to a line, in meters, counts as walking along it. */
export const LEY_NEAR_M = 40;
/** Magic for each km walked along a line. */
export const LEY_PER_KM = 5;
/** Magic for reaching a place on a line, once a day for each place. */
export const LEY_BURST = 10;
/** While he walks along a line, and a while after: a little luck. */
export const LEY_CHARM: NonNullable<Action["buff"]> = { name: "Ley-charmed", min: 30, attrs: { luck: 1 } };
export const MAGIC_MAX = 100;
/** The odds an old book at a library or bookshop teaches him a spell he doesn't know yet. */
export const LEARN_CHANCE = 0.3;
/** Place classes with old books. */
export const BOOK_CLASSES: readonly string[] = ["library"];
/** A meter spell is cast once its meter is below this. */
export const SPELL_AT = 30;
/** Buff spells are cast only with at least this much Magic, so the meter spells still have some. */
export const SPARE_MAGIC = 80;

export type Spell = {
  id: string;
  icon: string;
  name: string;
  /** Magic it costs. */
  cost: number;
  /** What he says when he casts it. */
  say: string;
  /** The meter it tops up (cast when that meter is low), with `fx`. */
  meter?: Meter;
  fx?: Fx;
  /** A buff spell's buff (cast with spare Magic while it isn't on). */
  buff?: NonNullable<Action["buff"]>;
};

/** A ley line: from one place of `LEY_CLASSES` to the nearest other. */
export type Ley = [LatLon, LatLon];

export const isLeyPlace = (p: Pick<Place, "class">) => LEY_CLASSES.includes(p.class);

/** The ley lines between `places`: each place of LEY_CLASSES joins the nearest other one, a line drawn once. */
export function leyLines(places: readonly Pick<Place, "class" | "lat" | "lon">[]): Ley[] {
  const pts = places.filter(isLeyPlace).sort((a, b) => a.lat - b.lat);
  const seen = new Set<string>();
  const out: Ley[] = [];
  const m = (a: (typeof pts)[number], b: (typeof pts)[number]) => Math.hypot(...offsetM(a.lat, a.lon, b.lat, b.lon));
  // Sorted by latitude, the search stops once the latitude alone is farther than the nearest so far.
  const degM = offsetM(0, 0, 1, 0)[1];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    let best = -1;
    let bestM = Infinity;
    for (const dir of [-1, 1]) {
      for (let j = i + dir; j >= 0 && j < pts.length; j += dir) {
        const b = pts[j]!;
        if (Math.abs(b.lat - a.lat) * degM > bestM) break;
        const d = m(a, b);
        if (d > 0 && d < bestM) [best, bestM] = [j, d];
      }
    }
    if (best < 0) continue;
    const key = `${Math.min(i, best)}:${Math.max(i, best)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const b = pts[best]!;
    out.push([
      [a.lat, a.lon],
      [b.lat, b.lon],
    ]);
  }
  return out;
}

/** True when `at` is within LEY_NEAR_M of one of `lines`. */
export function onLey(lines: readonly Ley[], at: LatLon): boolean {
  for (const [a, b] of lines) {
    const [px, py] = offsetM(a[0], a[1], at[0], at[1]);
    const [bx, by] = offsetM(a[0], a[1], b[0], b[1]);
    const len = bx * bx + by * by;
    const t = len ? Math.min(Math.max((px * bx + py * by) / len, 0), 1) : 0;
    if (Math.hypot(px - t * bx, py - t * by) <= LEY_NEAR_M) return true;
  }
  return false;
}

/** The spell he casts now, or null: a known meter spell whose meter is low, else with spare Magic a known buff spell that isn't on. */
export function toCast(spells: readonly Spell[], known: readonly string[], magic: number, meters: Record<Meter, number>, buffs: readonly string[]): Spell | null {
  const mine = spells.filter((s) => known.includes(s.id) && s.cost <= magic);
  return mine.find((s) => s.meter && meters[s.meter] < SPELL_AT) ?? (magic >= SPARE_MAGIC ? (mine.find((s) => s.buff && !buffs.includes(s.buff.name)) ?? null) : null);
}

/** What he knows of magic: the spells he learned in order, how often he cast each, and the places on lines he drew a burst from today. */
export class Magic {
  known: string[] = [];
  casts: Record<string, number> = {};
  day = "";
  tapped: string[] = [];

  /** At ley place `key` on `day`: true the first time today, when it gives a burst. */
  tap(key: string, day: string): boolean {
    if (this.day !== day) [this.day, this.tapped] = [day, []];
    if (this.tapped.includes(key)) return false;
    this.tapped.push(key);
    return true;
  }

  /** At a place with old books: the spell he learns with dice `r`, or null. */
  learn(spells: readonly Spell[], r: number): Spell | null {
    const left = spells.filter((s) => !this.known.includes(s.id));
    if (!left.length || r >= LEARN_CHANCE) return null;
    const s = left[Math.floor((r / LEARN_CHANCE) * left.length)]!;
    this.known.push(s.id);
    return s;
  }

  toJSON() {
    return { known: this.known, casts: this.casts, day: this.day, tapped: this.tapped };
  }

  static fromJSON(d?: Partial<ReturnType<Magic["toJSON"]>>): Magic {
    const m = new Magic();
    m.known = [...(d?.known ?? [])];
    m.casts = { ...(d?.casts ?? {}) };
    m.day = d?.day ?? "";
    m.tapped = [...(d?.tapped ?? [])];
    return m;
  }
}
