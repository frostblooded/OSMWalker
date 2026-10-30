// Packing: as he boards a bus, plane or his car for another city he packs a
// travel kit on his own, by need: snacks when he is getting hungry, a water
// bottle when thirsty, a phrasebook when the trip goes abroad. Each is a
// timed buff that keeps working in the new city. He only packs what leaves
// him his reserve after the fare.
import type { Action, Meter } from "./stats";

/** He packs food or water when that meter is under this. */
export const PACK_BELOW = 80;

export type KitItem = { name: string; cents: number; buff: NonNullable<Action["buff"]>; meter?: Meter; abroad?: boolean };

export const KIT: readonly KitItem[] = [
  { name: "snacks", cents: 400, meter: "fullness", buff: { name: "Packed snacks", min: 120, per_h: { fullness: 10 } } },
  { name: "a water bottle", cents: 150, meter: "thirst", buff: { name: "Water bottle", min: 120, per_h: { thirst: 12 } } },
  { name: "a phrasebook", cents: 800, abroad: true, buff: { name: "Phrasebook", min: 180, attrs: { cha: 1 } } },
];

/** What he packs for a trip: the kit items he needs, while each leaves him `keep` cents. */
export function choose(meters: Record<Meter, number>, cents: number, abroad: boolean, keep: number): KitItem[] {
  const out: KitItem[] = [];
  for (const k of KIT) {
    if (k.meter ? meters[k.meter] >= PACK_BELOW : !(k.abroad && abroad)) continue;
    if (cents - k.cents < keep) continue;
    cents -= k.cents;
    out.push(k);
  }
  return out;
}

/** "snacks, a water bottle and a phrasebook". */
export const list = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);
