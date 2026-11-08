// What each kind of place gives him: work places pay money, sights and green
// spaces give XP, and a place he has never been to adds bonus XP. Places of
// any other kind give nothing, so he never heads for them.
import type { Place } from "./stats";

export type Kind = "work" | "sight" | "green";

/** Classes of the tiles' POI layer, by the reward they give. */
export const KINDS: Record<Kind, readonly string[]> = {
  work: ["cafe", "bakery", "restaurant", "fast_food", "bar", "beer", "ice_cream", "grocery", "shop", "clothing_store", "butcher", "alcohol_shop", "pharmacy", "hairdresser", "laundry", "office", "lodging", "cinema", "fitness_centre", "post", "library"],
  sight: ["attraction", "museum", "monument", "memorial", "castle", "art_gallery", "theatre", "lookout", "place_of_worship", "town_hall", "fountain", "zoo", "aquarium", "stadium", "theme_park", "bridge", "shrine"],
  green: ["park", "garden", "playground", "picnic_site", "dog_park"],
};
const BY_CLASS = new Map(Object.entries(KINDS).flatMap(([k, list]) => list.map((c) => [c, k as Kind])));

/** Cents a shift at a work place pays. */
export const WORK_CENTS = 300;
/** XP a sight and a green space give. */
export const SIGHT_XP = 30;
export const GREEN_XP = 15;
/** Extra XP the first time he reaches a place. */
export const NEW_PLACE_XP = 20;

export type Reward = { cents: number; xp: number };

/** The kind of `place` by its reward, or null when it gives nothing. */
export function kindOf(place: Pick<Place, "class">): Kind | null {
  return BY_CLASS.get(place.class) ?? null;
}

/** What reaching `place` gives him; `isNew` when he has never been there. */
export function rewardOf(place: Pick<Place, "class">, isNew: boolean): Reward {
  const kind = kindOf(place);
  const bonus = isNew && kind ? NEW_PLACE_XP : 0;
  if (kind === "work") return { cents: WORK_CENTS, xp: bonus };
  if (kind === "sight") return { cents: 0, xp: SIGHT_XP + bonus };
  if (kind === "green") return { cents: 0, xp: GREEN_XP + bonus };
  return { cents: 0, xp: 0 };
}
