// Giants seen from afar: rare spectacle with no fighting. A sea serpent's
// coils off a ferry pier or a swimming lake, a kraken's arm in the harbour, a
// giant asleep on the far hills seen from a viewpoint. When he reaches such
// a real place, now and then (at most once a day) one shows: he stops to
// watch, which lifts his mood, and keeps a legendary photo of it in the
// Collection. The first time he sees each one goes in his life story.
import type { Fx, Place } from "./stats";

/** The odds a giant shows when he reaches a place it is seen from, until he has seen one today. */
export const GIANT_CHANCE = 0.1;
/** What watching one does. */
export const GIANT_FX: Fx = { mood: 25, xp: 30 };

export type Giant = {
  id: string;
  icon: string;
  name: string;
  /** Place classes, or class/subclass kinds, it is seen from. */
  at: readonly string[];
  /** Where it is seen from, for Help and the Collection hint. */
  where: string;
  /** What he sees; {PLACE} is the place's name. */
  say: string;
};

export const GIANTS: readonly Giant[] = [
  { id: "serpent", icon: "🐍", name: "Sea serpent", at: ["ferry_terminal", "swimming/swimming_area"], where: "from a ferry terminal or a swimming lake", say: "A sea serpent's coils rose out of the water off {PLACE}, shining, and slid back under" },
  { id: "kraken", icon: "🦑", name: "Kraken", at: ["harbor"], where: "in a harbour or marina", say: "A kraken's arm curled up between the boats at {PLACE}, waved once, and sank" },
  { id: "giant", icon: "⛰", name: "Sleeping giant", at: ["attraction/viewpoint"], where: "from a viewpoint", say: "From {PLACE} he saw a giant asleep on the far hills, breathing as slowly as the clouds" },
];

/** The giant seen from a place like `p`, if any; made-up places show none. */
export const giantAt = (p: Pick<Place, "class" | "subclass"> & { made?: unknown }): Giant | undefined =>
  p.made ? undefined : GIANTS.find((g) => g.at.includes(p.class) || g.at.includes(`${p.class}/${p.subclass}`));

/** One photo: where and when he first saw it. */
export type Photo = { place: string; city: string; t: number };

/** The giants he has seen: how often, his photo of each, and the day (gifts.ts dayOf) of the last sighting. */
export class Sightings {
  seen: Record<string, number> = {};
  photos: Record<string, Photo> = {};
  day = "";

  /** At a place like `p` on `day`: the giant that shows for dice `r`, or null. Marks the day once one does. */
  roll(p: Pick<Place, "class" | "subclass"> & { made?: unknown }, day: string, r: number): Giant | null {
    const g = giantAt(p);
    if (!g || this.day === day || r >= GIANT_CHANCE) return null;
    this.day = day;
    return g;
  }

  /** He saw `g` from `place` in `city` at `t`; true the first time. */
  note(g: Giant, place: string, city: string, t: number): boolean {
    this.seen[g.id] = (this.seen[g.id] ?? 0) + 1;
    if (this.photos[g.id]) return false;
    this.photos[g.id] = { place, city, t };
    return true;
  }

  toJSON() {
    return { seen: this.seen, photos: this.photos, day: this.day };
  }

  static fromJSON(d?: Partial<ReturnType<Sightings["toJSON"]>>): Sightings {
    const s = new Sightings();
    s.seen = { ...(d?.seen ?? {}) };
    s.photos = { ...(d?.photos ?? {}) };
    s.day = d?.day ?? "";
    return s;
  }
}
