// His daily comforts (The Sims' and RimWorld's): where he sleeps, what he
// eats and how pretty the streets around him are each leave a moodlet.
// Beds and meals are tiers on actions in data/actions.json (`bed`, `meal`);
// the surroundings come from the map tiles under him (map/mapView.ts
// landAt) and his places nearby, looked at every BEAUTY_EVERY_S while the
// game is open. Grim surroundings also pull his goal a little towards green
// and pretty places. Comforts counts the lavish meals and hotel nights for
// the Collection. Pure; Stats applies them.
import { distanceM } from "./geo";
import type { Place } from "./stats";

/** A moodlet: name, icon, mood an hour, hours. */
export type Feel = readonly [string, string, number, number];

export type Bed = "rough" | "open" | "bunk" | "cabin" | "hotel";
export const BEDS: Record<Bed, Feel> = {
  rough: ["Stiff neck", "🥴", -1, 2],
  open: ["Fresh-air nap", "🌳", 1, 2],
  bunk: ["Snoring dorm", "😪", -1, 3],
  cabin: ["Cosy cabin", "🛖", 1, 3],
  hotel: ["Slept like a king", "👑", 2, 4],
};
/** A night at home, whatever the hostel or hotel action was (see home.ts). */
export const HOME_BED: Feel = ["Slept in his own bed", "🏡", 2, 4];

export type Meal = "scraps" | "fine" | "lavish";
export const MEALS: Record<Meal, Feel> = {
  scraps: ["Ate scraps", "🥴", -1, 2],
  fine: ["Good meal", "😋", 1, 2],
  lavish: ["Lavish meal", "🍽", 3, 3],
};

/** How often he looks around him while the game is open, in seconds. */
export const BEAUTY_EVERY_S = 180;
/** How far around him the map and his places count, in metres. */
export const BEAUTY_M = 150;
/** Land under him that cheers him, and land that gets him down (OpenMapTiles classes of landcover, landuse, park, water and transportation). */
export const NICE_LAND = ["park", "wood", "grass", "garden", "water", "beach", "sand", "nature_reserve"];
export const GRIM_LAND = ["industrial", "quarry", "landfill", "railway", "motorway", "trunk"];
/** Places nearby that make an old town: they count like nice land, once. */
export const OLD_TOWN = ["castle", "monument", "memorial"];
export const PRETTY: Feel = ["Pretty surroundings", "🌷", 2, 0.25];
export const GRIM: Feel = ["Grim surroundings", "🏭", -1, 0.25];
/** Kinds of place grim surroundings pull his goal towards, and how hard. */
export const GREEN_KINDS = ["park", "garden", "picnic_site", "lookout", "fountain"];
export const BEAUTY_PULL = 1.3;

/** How pretty a spot is: +1 for each kind of nice land under him, +1 for an old town nearby, -1 for each kind of grim land. */
export function beautyOf(land: readonly string[], places: readonly Pick<Place, "lat" | "lon" | "class">[], at: readonly [number, number]): number {
  const kinds = new Set(land);
  let score = 0;
  for (const k of kinds) score += NICE_LAND.includes(k) ? 1 : GRIM_LAND.includes(k) ? -1 : 0;
  if (places.some((p) => OLD_TOWN.includes(p.class) && distanceM(p.lat, p.lon, at[0], at[1]) <= BEAUTY_M)) score++;
  return score;
}

/** The moodlet a spot of beauty `score` brings, if any. */
export const sceneFeel = (score: number): Feel | null => (score > 0 ? PRETTY : score < 0 ? GRIM : null);

/** How many lavish meals and hotel nights he has had, for the Collection's feats. */
export class Comforts {
  lavish = 0;
  hotel = 0;

  /** Counts a meal or bed of tier `tier`. */
  count(tier: Meal | Bed): void {
    if (tier === "lavish") this.lavish++;
    if (tier === "hotel") this.hotel++;
  }

  toJSON() {
    return { lavish: this.lavish, hotel: this.hotel };
  }

  /** A save from before comforts: none counted yet. */
  static fromJSON(d: unknown): Comforts {
    const c = new Comforts();
    const o = (d ?? {}) as Partial<Comforts>;
    c.lavish = Number(o.lavish) || 0;
    c.hotel = Number(o.hotel) || 0;
    return c;
  }
}
