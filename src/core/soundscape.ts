// Which soundscape the optional city sound plays: cafe chatter where he eats
// or drinks, birdsong in green places, the street hum anywhere else, and
// nothing while he rides between cities. The sound itself is app/sound.ts.
export type Soundscape = "street" | "cafe" | "park" | "";

const CAFE = new Set(["cafe", "restaurant", "bar", "beer", "fast_food", "bakery", "ice_cream"]);
const PARK = new Set(["park", "garden", "playground", "dog_park", "picnic_site", "campsite", "cemetery", "golf", "zoo"]);

/** `cls`: the class of the place he heads for or stays at, null for a random spot. */
export function soundscape(cls: string | null, resting: boolean, riding: boolean): Soundscape {
  if (riding) return "";
  if (resting && cls && CAFE.has(cls)) return "cafe";
  if (resting && cls && PARK.has(cls)) return "park";
  return "street";
}
