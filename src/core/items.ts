// Procedural items: a base from the shop's kind, a material that unlocks
// with his level, and 0-3 modifiers that add stats and name the item
// ("Mighty Bronze Sword of the Fox"). More modifiers are rarer.
// There is no combat: gear only adds to his attributes (and speed).
import { toCents } from "./money";
import type { Rng } from "./rng";
import type { Vehicle } from "./speeds";

export const SLOTS = ["weapon", "offhand", "head", "body", "feet", "bag", "trinket", "vehicle"] as const;
export type Slot = (typeof SLOTS)[number];
export const RARITY = ["Common", "Uncommon", "Rare", "Legendary"] as const;
export type Rarity = (typeof RARITY)[number];
/** Each Luck point lifts the rarity roll this much, up to LUCK_RARITY_CAP. */
export const LUCK_RARITY_PER = 0.01;
export const LUCK_RARITY_CAP = 0.15;
export const rarityBoost = (luck: number) => Math.min(LUCK_RARITY_PER * luck, LUCK_RARITY_CAP);
/** Roll thresholds for 1, 2 and 3 modifiers: 60% none, 28% one, 10% two, 2% three. */
export const MOD_ROLLS = [0.6, 0.88, 0.98];
/** Each modifier adds this share of the price. */
export const MOD_PRICE = 0.6;
/** Main stat per point of material power. */
export const POWER_TO_STAT = 0.5;
/** Speed percent per point of material power on a vehicle. */
export const SPEED_PER_POWER = 2;
/** Ranks vehicles by kind first, so any car beats any bike. */
const VEHICLE_POWER: Record<string, number> = { bike: 100, motorcycle: 200, car: 300 };

export type Stats = Partial<Record<"str" | "cha" | "wit" | "luck" | "speed", number>>;
/** Where an item came from and what it has been through with him. */
export type Story = { from: string; t: number; countries: string[]; km: number };
export type Item = { name: string; slot: Slot; stats: Stats; rarity: Rarity; price: number; vehicle?: Exclude<Vehicle, "">; story?: Story };
/** An item worn through this many countries is treasured: he keeps it instead of selling it. */
export const TREASURED_COUNTRIES = 3;
export const isTreasured = (item: Item) => (item.story?.countries.length ?? 0) >= TREASURED_COUNTRIES;
export type Base = { base: string; slot: Slot; stat: keyof Stats; price: number; cloth?: boolean; vehicle?: Exclude<Vehicle, ""> };
export type Material = { metal: string; cloth: string; level: number; power: number; price: number };
export type Modifier = { name: string; stats: Stats };

const b = (base: string, slot: Slot, stat: keyof Stats, price: number, extra: Partial<Base> = {}): Base => ({ base, slot, stat, price, ...extra });
const cloth = { cloth: true };

/** Bases by the kind of shop that sells them, with the real price in euros of a typical (Bronze/Linen) one. Vehicles raise his speed by a percentage. */
export const KINDS = {
  weapons: [
    b("Sword", "weapon", "str", 40), b("Sabre", "weapon", "str", 60), b("Dagger", "weapon", "str", 15), b("Mace", "weapon", "str", 35),
    b("Axe", "weapon", "str", 25), b("Spear", "weapon", "str", 30), b("Hammer", "weapon", "str", 30), b("Bow", "weapon", "wit", 80),
    b("Buckler", "offhand", "str", 40), b("Kite Shield", "offhand", "str", 60), b("Tower Shield", "offhand", "str", 80),
    b("Helmet", "head", "str", 50), b("Mail Shirt", "body", "str", 150),
  ],
  improvised: [
    b("Crowbar", "weapon", "str", 12), b("Wrench", "weapon", "wit", 10), b("Frying Pan", "weapon", "str", 15),
    b("Rolling Pin", "weapon", "str", 8), b("Umbrella", "weapon", "cha", 12), b("Bin Lid", "offhand", "str", 6),
  ],
  clothes: [
    b("Shirt", "body", "cha", 25, cloth), b("Jacket", "body", "cha", 70, cloth), b("Coat", "body", "cha", 120, cloth),
    b("Hoodie", "body", "luck", 35, cloth), b("Boots", "feet", "str", 80, cloth), b("Trainers", "feet", "str", 70, cloth),
    b("Sandals", "feet", "luck", 25, cloth), b("Cap", "head", "cha", 15, cloth), b("Beanie", "head", "wit", 12, cloth),
    b("Backpack", "bag", "str", 40, cloth),
  ],
  trinkets: [
    b("Ring", "trinket", "luck", 40), b("Amulet", "trinket", "luck", 25), b("Bracelet", "trinket", "cha", 15),
    b("Earring", "trinket", "cha", 12), b("Pocket Watch", "trinket", "wit", 30), b("Lucky Charm", "trinket", "luck", 5),
  ],
  instruments: [
    b("Lute", "trinket", "cha", 300), b("Guitar", "trinket", "cha", 120), b("Harmonica", "trinket", "cha", 25),
    b("Drum", "trinket", "str", 80), b("Violin", "trinket", "wit", 170),
  ],
  bicycles: [b("Bike", "vehicle", "speed", 300, { vehicle: "bike" }), b("Racing Bike", "vehicle", "speed", 900, { vehicle: "bike" })],
  motorcycles: [b("Scooter", "vehicle", "speed", 2500, { vehicle: "motorcycle" }), b("Motorbike", "vehicle", "speed", 6000, { vehicle: "motorcycle" })],
  cars: [b("Hatchback", "vehicle", "speed", 15000, { vehicle: "car" }), b("Saloon", "vehicle", "speed", 25000, { vehicle: "car" })],
} satisfies Record<string, Base[]>;
export type Kind = keyof typeof KINDS;

/** Materials in order of power; each unlocks at a level. */
export const MATERIALS: Material[] = [
  { metal: "Wooden", cloth: "Cotton", level: 1, power: 1, price: 0.5 },
  { metal: "Copper", cloth: "Wool", level: 1, power: 2, price: 0.75 },
  { metal: "Bronze", cloth: "Linen", level: 3, power: 3, price: 1 },
  { metal: "Iron", cloth: "Leather", level: 5, power: 4, price: 1.5 },
  { metal: "Steel", cloth: "Silk", level: 10, power: 6, price: 2 },
  { metal: "Silver", cloth: "Velvet", level: 15, power: 7, price: 4 },
  { metal: "Mithril", cloth: "Dragonhide", level: 25, power: 10, price: 10 },
];

export const PREFIXES: Modifier[] = [
  { name: "Mighty", stats: { str: 2 } }, { name: "Charming", stats: { cha: 2 } }, { name: "Clever", stats: { wit: 2 } },
  { name: "Lucky", stats: { luck: 2 } }, { name: "Sharp", stats: { str: 1, wit: 1 } }, { name: "Gleaming", stats: { cha: 1, luck: 1 } },
  { name: "Swift", stats: { speed: 4 } },
];
export const SUFFIXES: Modifier[] = [
  { name: "of the Bear", stats: { str: 2 } }, { name: "of the Fox", stats: { wit: 2 } }, { name: "of the Peacock", stats: { cha: 2 } },
  { name: "of Fortune", stats: { luck: 2 } }, { name: "of the Owl", stats: { wit: 1, luck: 1 } }, { name: "of the Hare", stats: { speed: 4 } },
];

/** How many modifiers a roll r in [0, 1) gives. */
export function modifierCount(r: number): number {
  return MOD_ROLLS.filter((t) => r >= t).length;
}

/** A random item from a shop of `kind` for a walker of `level`; `luck` lifts the rarity roll (see stats.rarityBoost). */
export function make(kind: Kind, level: number, rng: Rng, luck = 0): Item {
  const base = rng.pick(KINDS[kind]);
  const mat = rng.pick(MATERIALS.filter((m) => m.level <= level));
  const n = modifierCount(Math.min(rng.randf() + rarityBoost(luck), 0.999999));
  const mods: Modifier[] = [];
  // At most one suffix; the rest are prefixes, never the same one twice.
  if (n > 0) mods.push(rng.pick(SUFFIXES));
  const prefixes = [...PREFIXES];
  for (let i = 0; i < n - 1; i++) mods.unshift(prefixes.splice(rng.randiRange(0, prefixes.length - 1), 1)[0]!);
  return build(base, mat, mods);
}

/** The item made of `base`, material `mat` and modifiers `mods` (prefixes first, then the suffix). */
export function build(base: Base, mat: Material, mods: Modifier[]): Item {
  const stats: Stats = { [base.stat]: mat.power * (base.stat === "speed" ? SPEED_PER_POWER : POWER_TO_STAT) };
  const before: string[] = [];
  const after: string[] = [];
  for (const m of mods) {
    (m.name.startsWith("of ") ? after : before).push(m.name);
    for (const [k, v] of Object.entries(m.stats) as [keyof Stats, number][]) stats[k] = (stats[k] ?? 0) + v;
  }
  const item: Item = {
    name: [...before, base.cloth ? mat.cloth : mat.metal, base.base, ...after].join(" "),
    slot: base.slot,
    stats,
    rarity: RARITY[mods.length]!,
    price: toCents(base.price * mat.price * (1 + MOD_PRICE * mods.length)),
  };
  if (base.vehicle) item.vehicle = base.vehicle;
  return item;
}

/** The cheapest item a shop of `kind` sells: its cheapest base in the cheapest material, with no modifiers. */
export function cheapest(kind: Kind): Item {
  const all = KINDS[kind].map((b) => build(b, MATERIALS[0]!, []));
  return all.reduce((a, b) => (b.price < a.price ? b : a));
}

/** Vehicle shops, slowest vehicle first. */
export const VEHICLE_SHOPS = [["bike", "bicycles"], ["motorcycle", "motorcycles"], ["car", "cars"]] as const;
export type VehicleGoal = { name: string; kind: Kind; cents: number };

/** The cheapest vehicle a step above `has` (a bike on foot, a scooter on a bike...), or null in a car. */
export function nextVehicle(has: Vehicle): VehicleGoal | null {
  const at = VEHICLE_SHOPS.findIndex(([v]) => v === has);
  const next = VEHICLE_SHOPS[at + 1];
  if (!next) return null;
  const kind = next[1];
  const item = cheapest(kind);
  return { name: KINDS[kind].find((b) => item.name.endsWith(b.base))!.base, kind, cents: item.price };
}

/** Total of an item's stat bonuses, to compare gear. */
export function power(item: Item | undefined): number {
  if (!item) return 0;
  let p = VEHICLE_POWER[item.vehicle ?? ""] ?? 0;
  for (const v of Object.values(item.stats)) p += v ?? 0;
  return p;
}
