// When places are open: shops, offices, museums and other day businesses
// close at night by the city's own clock (and all day on a holiday); bars,
// fast food, hotels, kiosks, parks and the rest stay open. Pure.
import type { Place } from "./stats";

/** Day businesses open at this local hour and close at CLOSE_H. */
export const OPEN_H = 8;
export const CLOSE_H = 20;

/** Kinds of place ("class" or "class/subclass") that close at night. */
export const DAY_ONLY = new Set([
  "shop", "office", "museum", "art_gallery", "castle", "zoo", "aquarium", "library", "clothing_store", "grocery", "bakery", "butcher",
  "hairdresser", "bank", "post", "town_hall", "school", "college", "doctors", "dentist", "laundry", "alcohol_shop", "music", "bicycle",
  "bicycle_rental", "car", "veterinary", "theme_park", "water_park", "ice_cream", "cafe", "yoga", "escape_game", "karting",
]);
/** Kinds that stay open although their class closes. */
export const ALL_NIGHT = new Set(["shop/kiosk", "shop/convenience"]);

/** True when a place of `place`'s kind closes at night. */
export function dayOnly(place: Pick<Place, "class" | "subclass">): boolean {
  const full = `${place.class}/${place.subclass}`;
  return !ALL_NIGHT.has(full) && (DAY_ONLY.has(full) || DAY_ONLY.has(place.class));
}

/** True when `place` is open at local clock `hour` (0-24), on a `holiday` or not. */
export function isOpen(place: Pick<Place, "class" | "subclass">, hour: number, holiday = false): boolean {
  if (!dayOnly(place)) return true;
  return !holiday && hour >= OPEN_H && hour < CLOSE_H;
}
