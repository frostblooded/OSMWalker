// The upgrade ladder: seven unlocks, bought in order at real shops that turn
// up among his cards once he is high enough level and has the money. Each one
// changes what the cards can offer (a 4th card, farther places, new kinds of
// card), never just a number. Pure data and logic, so it is easy to test.
import type { Place } from "./stats";

export type UpgradeId = "map" | "bike" | "guide" | "bag" | "scooter" | "metro" | "train";

type Match = (p: Pick<Place, "class" | "subclass">) => boolean;

export type Upgrade = {
  id: UpgradeId;
  icon: string;
  name: string;
  /** The level his shop opens at. */
  level: number;
  cents: number;
  /** Who sells it, in world words: "a bike shop". */
  where: string;
  /** What it does, for the cards, the level-up line and Help. */
  does: string;
  /** Places that sell it, best first; the first that has a place in reach is used. */
  sellers: readonly Match[];
};

const sub =
  (...subs: string[]): Match =>
  (p) =>
    subs.includes(p.subclass);
const cls =
  (...classes: string[]): Match =>
  (p) =>
    classes.includes(p.class);
/** Any shop: sells what has no shop of its own in reach, so the ladder never stalls for want of one. */
const anyShop = cls("shop");

/** Stations the metro and train cards start from. */
export const isMetroStation: Match = (p) => (p.class === "railway" && ["station", "subway", "halt"].includes(p.subclass)) || p.subclass === "bus_station";
export const isTrainStation: Match = (p) => (p.class === "railway" && ["station", "halt"].includes(p.subclass)) || p.subclass === "bus_station";

/** Speed and reach on a bike and on a scooter, times walking. */
export const BIKE_SPEED_X = 3;
export const BIKE_REACH_X = 2;
export const SCOOTER_SPEED_X = 5;
export const SCOOTER_REACH_X = 4;
/** The Guidebook's sight gives this many times the XP. */
export const GUIDE_XP_X = 2;
/** A delivery pays this many times what the walk from pick-up to drop-off would pay. */
export const PARCEL_PAY_X = 2;
/** A metro ride takes him at least this far (straight line). */
export const METRO_MIN_M = 2000;

export const LADDER: readonly Upgrade[] = [
  { id: "map", icon: "🗺", name: "City map", level: 2, cents: 500, where: "a bookshop or newsagent", does: "a 4th card at every stop", sellers: [sub("books", "newsagent", "kiosk", "stationery"), anyShop] },
  { id: "bike", icon: "🚲", name: "Bike", level: 3, cents: 2500, where: "a bike shop", does: `cards reach ${BIKE_REACH_X} times as far and he rides ${BIKE_SPEED_X} times as fast`, sellers: [(p) => p.class === "bicycle" || p.subclass === "bicycle", sub("sports", "outdoor"), anyShop] },
  { id: "guide", icon: "📕", name: "Guidebook", level: 4, cents: 4000, where: "a bookshop", does: `one card is a sight he has never seen, for ${GUIDE_XP_X} times the XP`, sellers: [sub("books"), cls("library"), anyShop] },
  { id: "bag", icon: "📦", name: "Courier bag", level: 5, cents: 6000, where: "a post office", does: `delivery cards: pick up a parcel at one place, get ${PARCEL_PAY_X} times the pay at another`, sellers: [cls("post"), anyShop] },
  { id: "scooter", icon: "🛵", name: "Scooter", level: 7, cents: 9000, where: "a motorbike shop", does: `cards reach ${SCOOTER_REACH_X} times as far and he rides ${SCOOTER_SPEED_X} times as fast`, sellers: [sub("motorcycle"), cls("car"), anyShop] },
  { id: "metro", icon: "🚇", name: "Metro pass", level: 8, cents: 9000, where: "a station", does: "metro cards: ride from a station near him to a far part of the city", sellers: [isMetroStation] },
  { id: "train", icon: "🚆", name: "Train ticket", level: 10, cents: 15000, where: "a train station", does: "train cards: ride from a station to any other city", sellers: [isTrainStation] },
];

export const upgradeOf = (id: string): Upgrade | undefined => LADDER.find((u) => u.id === id);

/** The next upgrade he can buy, whether or not its shop is open yet; null at the top. */
export function nextUpgrade(owned: ReadonlySet<string>): Upgrade | null {
  return LADDER.find((u) => !owned.has(u.id)) ?? null;
}

/** The upgrade whose shop opens at `level`, if any. */
export const opensAt = (level: number): Upgrade | undefined => LADDER.find((u) => u.level === level);

/** The upgrade his cards can offer a shop for now: open by level and affordable. */
export function shopFor(owned: ReadonlySet<string>, level: number, cents: number): Upgrade | null {
  const u = nextUpgrade(owned);
  return u && level >= u.level && cents >= u.cents ? u : null;
}

/** What the upgrades he owns let him do. */
export type Powers = { cards: number; speedX: number; reachX: number; guide: boolean; parcels: boolean; metro: boolean; train: boolean };

export function powers(owned: ReadonlySet<string>): Powers {
  const has = (id: UpgradeId) => owned.has(id);
  return {
    cards: has("map") ? 4 : 3,
    speedX: has("scooter") ? SCOOTER_SPEED_X : has("bike") ? BIKE_SPEED_X : 1,
    reachX: has("scooter") ? SCOOTER_REACH_X : has("bike") ? BIKE_REACH_X : 1,
    guide: has("guide"),
    parcels: has("bag"),
    metro: has("metro"),
    train: has("train"),
  };
}

/** How he gets about, for the screens. */
export const ride = (owned: ReadonlySet<string>) => (owned.has("scooter") ? "🛵" : owned.has("bike") ? "🚲" : "🚶");
