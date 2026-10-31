// Clothes wear out (RimWorld's tattered apparel): cloth gear on his head,
// body and feet wears with every km he walks, twice as fast in the rain.
// Worn thin, the feed says so; worn through, it is tattered: it adds
// nothing, costs him Charm and mood, and clothes shops pull him until he
// buys something new there (anything beats a tattered piece). A tailor's
// mending makes his clothes as good as new. Pure; Stats applies it.
import { type Item, MATERIALS, type Slot } from "./items";

/** The slots whose cloth gear wears out. */
export const WEAR_SLOTS: readonly Slot[] = ["head", "body", "feet"];
/** Km on foot until a piece is tattered; rain wears it RAIN_WEAR times as fast. */
export const WEAR_KM = 300;
export const RAIN_WEAR = 2;
/** Share of WEAR_KM at which the feed says it is wearing thin. */
export const THIN_AT = 0.75;
/** Charm each tattered piece costs, and its moodlet: mood an hour, hours (again each day while he wears it). */
export const TATTERED_CHA = 0.5;
export const TATTERED: readonly [string, string, number, number] = ["Tattered clothes", "🧵", -1, 24];
/** How hard clothes shops pull him while anything he wears is tattered. */
export const TATTERED_PULL = 2;
export const CLOTHES_KINDS = ["clothing_store"];

const CLOTHS = new Set(MATERIALS.map((m) => m.cloth));

/** True for cloth gear that wears out: a head, body or feet piece of a cloth material. */
export const isCloth = (item: Item) => WEAR_SLOTS.includes(item.slot) && item.name.split(" ").some((w) => CLOTHS.has(w));
export const isTattered = (item: Item | undefined) => !!item && (item.wear ?? 0) >= WEAR_KM;

/** Wears his cloth `gear` by `km` on foot (`wet`: in rain or snow); returns the feed lines for pieces that got thin or tattered, and whether one tattered. */
export function wear(gear: Partial<Record<Slot, Item>>, km: number, wet: boolean): { lines: string[]; tattered: boolean } {
  const lines: string[] = [];
  let tattered = false;
  for (const slot of WEAR_SLOTS) {
    const item = gear[slot];
    if (!item || !isCloth(item) || isTattered(item)) continue;
    const before = item.wear ?? 0;
    item.wear = before + km * (wet ? RAIN_WEAR : 1);
    if (isTattered(item)) {
      lines.push(`🧵 His ${item.name} is worn through`);
      tattered = true;
    } else if (before < WEAR_KM * THIN_AT && item.wear >= WEAR_KM * THIN_AT) lines.push(`🧵 His ${item.name} is wearing thin`);
  }
  return { lines, tattered };
}
