// What each kind of place gives him: work places pay money, sights and green
// spaces give XP, more the longer the walk there (plus a fixed part per stop),
// and a place he has never been to adds bonus XP. Places of any other kind
// give nothing, so they are never offered.
import type { Place } from "./stats";

export type Kind = "work" | "sight" | "green";

/** Classes of the tiles' POI layer, by the reward they give. */
export const KINDS: Record<Kind, readonly string[]> = {
  work: ["cafe", "bakery", "restaurant", "fast_food", "bar", "beer", "ice_cream", "grocery", "shop", "clothing_store", "butcher", "alcohol_shop", "pharmacy", "hairdresser", "laundry", "office", "lodging", "cinema", "fitness_centre", "post", "library"],
  sight: ["attraction", "museum", "monument", "memorial", "castle", "art_gallery", "theatre", "lookout", "place_of_worship", "town_hall", "fountain", "zoo", "aquarium", "stadium", "theme_park", "bridge", "shrine"],
  green: ["park", "garden", "playground", "picnic_site", "dog_park"],
};
const BY_CLASS = new Map(Object.entries(KINDS).flatMap(([k, list]) => list.map((c) => [c, k as Kind])));

/** What a minute of walking there is worth (see rewardOf). */
export const WORK_CENTS_PER_MIN = 60;
export const SIGHT_XP_PER_MIN = 10;
export const GREEN_XP_PER_MIN = 5;
/**
 * Every stop is worth this many minutes on top of the walk, so a close place
 * pays more per minute (best while you keep picking) and a far one more in
 * all (best when you'll look away while he walks).
 */
export const STOP_MIN = 3;
/** Sights ranked this high or higher in their tile (1 is the top) are landmarks and give LANDMARK_BONUS times the XP. */
export const LANDMARK_RANK = 2;
export const LANDMARK_BONUS = 1.5;
/** Extra XP the first time he reaches a place. */
export const NEW_PLACE_XP = 20;

export type Reward = { cents: number; xp: number };

/** The kind of `place` by its reward, or null when it gives nothing. */
export function kindOf(place: Pick<Place, "class">): Kind | null {
  return BY_CLASS.get(place.class) ?? null;
}

/** Walk minutes, plus the stop's own. */
const worth = (min: number) => min + STOP_MIN;

/**
 * What reaching `place` gives him after a walk of `min` minutes (on foot, the
 * card's estimate): it grows with the walk, and STOP_MIN makes close pay more
 * per minute, far more in all. `isNew` when he has never been there.
 */
export function rewardOf(place: Pick<Place, "class" | "rank">, min: number, isNew: boolean): Reward {
  const kind = kindOf(place);
  if (!kind) return { cents: 0, xp: 0 };
  const w = worth(Math.max(min, 0));
  const bonus = isNew ? NEW_PLACE_XP : 0;
  if (kind === "work") return { cents: Math.round((WORK_CENTS_PER_MIN * w) / 10) * 10, xp: bonus };
  const landmark = kind === "sight" && Math.trunc(place.rank ?? 99) <= LANDMARK_RANK ? LANDMARK_BONUS : 1;
  const perMin = kind === "sight" ? SIGHT_XP_PER_MIN : GREEN_XP_PER_MIN;
  return { cents: 0, xp: Math.round(perMin * w * landmark) + bonus };
}
