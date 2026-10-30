// How he looks on the map: a face for how he feels, a bubble over his head
// with his most pressing need or the icon of the kind of place he heads for,
// and while he stays somewhere a pose for what he does there (zZz, steam, a
// note).
import { NEED_AT } from "./activities";
import type { Vehicle } from "./speeds";
import { ATTRS, DIRTY_AT, TIRED_ENERGY, type Action, type Attr, type Meter } from "./stats";

/** Below this much health he looks sick. */
export const SICK_AT = 30;
/** Mood at or above this makes him beam; below LOW_MOOD he looks down. */
export const HAPPY_MOOD = 75;
export const LOW_MOOD = 30;

export type Motion = "rise" | "pop";
export type Pose = { icon: string; motion: Motion };
/** `mount`: the fantasy mount he rides, beside his face, or "". */
export type Look = { face: string; bubble: string; pose: Pose | null; mount: string };
type Kind = { class: string; subclass: string };

/** Fantasy mounts show beside his face; everyday vehicles don't. */
export const MOUNT_ICON: Partial<Record<Vehicle, string>> = { tortoise: "🐢", broom: "🧹", carpet: "🪄", dragon: "🐉" };

/** What he needs when a meter runs low. */
const NEED_ICON: Record<Meter, string> = { health: "💊", energy: "🛏", fullness: "🍔", mood: "🎈", hygiene: "🚿", thirst: "🥤" };

/** Icons by "class/subclass", subclass or class, tried in that order. */
const PLACE_ICON: Record<string, string> = {
  cafe: "☕", "shop/coffee": "☕", restaurant: "🍽", fast_food: "🍟", bar: "🍸", "bar/nightclub": "🪩", nightclub: "🪩", beer: "🍺", pub: "🍺",
  ice_cream: "🍦", bakery: "🥐", butcher: "🥩", "shop/confectionery": "🍬", "shop/chocolate": "🍫", grocery: "🛒", supermarket: "🛒",
  "shop/kiosk": "🗞", "shop/newsagent": "🗞", "shop/convenience": "🏪", alcohol_shop: "🍷", "shop/tobacco": "🚬",
  museum: "🏛", art_gallery: "🖼", attraction: "📸", castle: "🏰", monument: "🗿", memorial: "🕯", place_of_worship: "⛪",
  theatre: "🎭", cinema: "🎬", zoo: "🦁", aquarium: "🐠", library: "📚", music: "🎵", theme_park: "🎢", water_park: "🌊",
  park: "🌳", garden: "🌷", playground: "🛝", dog_park: "🐕", picnic_site: "🧺", campsite: "⛺", cemetery: "🪦", shelter: "🛖", fountain: "⛲", bridge: "🌉",
  pitch: "⚽", sports_centre: "🏟", stadium: "🏟", fitness_centre: "🏋", swimming: "🏊", swimming_pool: "🏊", golf: "⛳",
  yoga: "🧘", climbing: "🧗", boxing: "🥊", billiards: "🎱", ice_rink: "⛸", tennis: "🎾", karting: "🏎", escape_game: "🔐", chess: "♟",
  harbor: "⚓", ferry_terminal: "⛴", railway: "🚉", bus: "🚌", aerialway: "🚡", bicycle_rental: "🚲", bicycle: "🚲", parking: "🅿",
  fuel: "⛽", car: "🚗", "car/car": "🚗", "shop/motorcycle": "🏍",
  lodging: "🏨", hospital: "🏥", doctors: "🩺", dentist: "🦷", pharmacy: "💊", "shop/chemist": "🧴", veterinary: "🐾",
  bank: "🏦", atm: "🏧", post: "📮", police: "🚓", fire_station: "🚒", town_hall: "🏛", school: "🏫", college: "🎓",
  office: "🏢", "office/employment_agency": "💼", "office/coworking": "💻", "office/government": "🏛", "office/diplomatic": "🏳",
  "office/lawyer": "⚖", "office/estate_agent": "🏠", hackerspace: "🛠",
  laundry: "🧺", "shop/beauty": "💅", hairdresser: "💇", "shop/massage": "💆", "shop/tattoo": "🖋", "shop/optician": "👓",
  toilets: "🚻", drinking_water: "🚰", information: "ℹ", recycling: "♻",
  clothing_store: "👕", "shop/shoes": "👟", "shop/sports": "🎽", "shop/outdoor": "🥾", "shop/jewelry": "💍", "shop/watches": "⌚",
  "shop/gift": "🎁", "shop/second_hand": "♻", "shop/charity": "♻", "shop/pawnbroker": "💰", "shop/antiques": "🏺", "shop/carpet": "🧶",
  "shop/hardware": "🔨", "shop/doityourself": "🔨", "shop/weapons": "🗡", "shop/hunting": "🏹", "shop/knives": "🔪",
  "shop/florist": "💐", "shop/pet": "🐾", "shop/tailor": "🧵", "shop/mobile_phone": "📱", shop: "🛍",
  notice_board: "📜", guild_hall: "🛡", old_well: "🪣", lookout: "🔭", shrine: "⛩", storyteller: "📖", wizard_tower: "🧙",
};

/** His face: the worst of sick, tired, dirty and down, else how happy he is. */
export function face(m: Record<Meter, number>): string {
  if (m.health < SICK_AT) return "🤒";
  if (m.energy < TIRED_ENERGY) return "😩";
  if (m.hygiene < DIRTY_AT) return "😖";
  if (m.mood < LOW_MOOD) return "😞";
  return m.mood >= HAPPY_MOOD ? "😄" : "🙂";
}

/** The icon of his lowest meter under NEED_AT, or "" when he needs nothing. */
export function need(m: Record<Meter, number>): string {
  let low: Meter | null = null;
  for (const k of Object.keys(NEED_ICON) as Meter[]) if (m[k] < NEED_AT && (low === null || m[k] < m[low])) low = k;
  return low ? NEED_ICON[low] : "";
}

export function placeIcon(p: Kind): string {
  return PLACE_ICON[`${p.class}/${p.subclass}`] ?? PLACE_ICON[p.subclass] ?? PLACE_ICON[p.class] ?? "📍";
}

/** Attribute gains are tenths of a point; this puts them on the meters' scale. */
const ATTR_SCALE = 50;
const POSE: Partial<Record<Meter | Attr, Pose>> = {
  energy: { icon: "💤", motion: "rise" },
  fullness: { icon: "🍴", motion: "pop" },
  thirst: { icon: "💧", motion: "rise" },
  mood: { icon: "🎵", motion: "rise" },
  hygiene: { icon: "🫧", motion: "rise" },
  health: { icon: "💗", motion: "pop" },
  wit: { icon: "💡", motion: "pop" },
  cha: { icon: "💬", motion: "pop" },
  str: { icon: "💪", motion: "pop" },
  luck: { icon: "🍀", motion: "pop" },
};

/** What shows over him while he does `a` at a place of class `cls`: what the action gives most. */
export function pose(a: Action, cls: string): Pose {
  if (a.earn || a.sell) return { icon: "💶", motion: "rise" };
  if (a.item) return { icon: "🛍", motion: "pop" };
  let best: Meter | Attr | null = null;
  let most = 0;
  for (const [k, v] of Object.entries(a.fx ?? {})) {
    if (k === "xp" || !POSE[k as Meter]) continue;
    const size = (v ?? 0) * ((ATTRS as readonly string[]).includes(k) ? ATTR_SCALE : 1);
    if (size > most) [best, most] = [k as Meter | Attr, size];
  }
  if (!best) return { icon: "✨", motion: "pop" };
  // Coffee gives energy too: steam over the cup, not a nap.
  if (best === "energy" && cls === "cafe") return { icon: "☕", motion: "rise" };
  return POSE[best]!;
}

/** `goal`: the place he heads for or stays at, null for a random spot; `doing`: the action while he stays; `ride`: how he gets about. */
export function look(m: Record<Meter, number>, goal: Kind | null, doing: Action | null, ride: Vehicle = ""): Look {
  const p = doing ? pose(doing, goal?.class ?? "") : null;
  return { face: face(m), bubble: p ? "" : need(m) || (goal ? placeIcon(goal) : ""), pose: p, mount: MOUNT_ICON[ride] ?? "" };
}
