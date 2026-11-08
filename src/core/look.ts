// How he looks on the map: a bubble over his head with the icon of where he
// heads (the food place, or a house for the customer's door), and for a
// moment after he is paid a pop with the money.
export type Motion = "rise" | "pop";
export type Pose = { icon: string; motion: Motion };
export type Look = { bubble: string; pose: Pose | null };
type PlaceClass = { class: string; subclass: string };

/** The pop over him when he is paid. */
export const MONEY_POSE: Pose = { icon: "💶", motion: "rise" };

/** Icons by "class/subclass", subclass or class, tried in that order. */
const PLACE_ICON: Record<string, string> = {
  cafe: "☕", "shop/coffee": "☕", restaurant: "🍽", fast_food: "🍟", bar: "🍸", "bar/nightclub": "🪩", nightclub: "🪩", beer: "🍺", pub: "🍺", ice_cream: "🍦",
  bakery: "🥐", butcher: "🥩", "shop/confectionery": "🍬", "shop/chocolate": "🍫", grocery: "🛒", supermarket: "🛒", "shop/kiosk": "🗞",
  "shop/newsagent": "🗞", "shop/convenience": "🏪", alcohol_shop: "🍷", "shop/tobacco": "🚬", museum: "🏛", art_gallery: "🖼", attraction: "📸", castle: "🏰",
  monument: "🗿", memorial: "🕯", place_of_worship: "⛪", theatre: "🎭", cinema: "🎬", zoo: "🦁", aquarium: "🐠", library: "📚", music: "🎵", theme_park: "🎢",
  park: "🌳", garden: "🌷", playground: "🛝", dog_park: "🐕", picnic_site: "🧺", fountain: "⛲", bridge: "🌉", stadium: "🏟", fitness_centre: "🏋",
  bicycle: "🚲", car: "🚗", "shop/motorcycle": "🏍", lodging: "🏨", pharmacy: "💊", "shop/chemist": "🧴", post: "📮", town_hall: "🏛", office: "🏢",
  "office/employment_agency": "💼", "office/coworking": "💻", "office/government": "🏛", "office/diplomatic": "🏳", "office/lawyer": "⚖",
  "office/estate_agent": "🏠", laundry: "🧺", "shop/beauty": "💅", hairdresser: "💇", "shop/massage": "💆", "shop/tattoo": "🖋", "shop/optician": "👓",
  clothing_store: "👕", "shop/shoes": "👟", "shop/sports": "🎽", "shop/outdoor": "🥾", "shop/jewelry": "💍", "shop/watches": "⌚", "shop/gift": "🎁",
  "shop/second_hand": "♻", "shop/charity": "♻", "shop/pawnbroker": "💰", "shop/antiques": "🏺", "shop/carpet": "🧶", "shop/hardware": "🔨",
  "shop/doityourself": "🔨", "shop/weapons": "🗡", "shop/hunting": "🏹", "shop/knives": "🔪", "shop/florist": "💐", "shop/pet": "🐾", "shop/tailor": "🧵",
  "shop/mobile_phone": "📱", shop: "🛍", home: "🏠", pizza: "🍕",
};

export function placeIcon(p: PlaceClass): string {
  return PLACE_ICON[`${p.class}/${p.subclass}`] ?? PLACE_ICON[p.subclass] ?? PLACE_ICON[p.class] ?? "📍";
}

/** `goal`: the place he heads for, null while he wanders; `pose`: the pop when he is paid, or null. */
export function look(goal: PlaceClass | null, pose: Pose | null): Look {
  return { bubble: pose ? "" : goal ? placeIcon(goal) : "", pose };
}
