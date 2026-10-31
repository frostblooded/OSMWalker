// The shop after midnight: between midnight and 3 the real antique and
// second-hand shops sell to those who knock. Half the time the shelf holds
// an enchanted item (items.ts ENCHANTMENTS: Magic for each km he walks),
// otherwise a one-off trinket used on the spot. He pays in euros plus a
// little Magic.
import type { Kind } from "./items";
import type { Action, Fx } from "./stats";

/** The odds the shelf holds an enchanted item rather than a trinket. */
export const ENCHANTED_CHANCE = 0.5;
/** The kinds of shop stock an enchanted item comes from. */
export const ENCHANTED_KINDS: readonly Kind[] = ["weapons", "clothes", "trinkets"];
/** Magic an enchanted item costs on top of its price. */
export const ENCHANTED_MAGIC = 20;
/** An enchanted item costs this many times its usual price. */
export const ENCHANTED_PRICE = 1.5;

export type Trinket = {
  id: string;
  icon: string;
  name: string;
  /** Price in cents. */
  cents: number;
  /** Magic it costs on top. */
  magic: number;
  /** What he says when he uses it. */
  say: string;
  fx?: Fx;
  buff?: NonNullable<Action["buff"]>;
};

export const TRINKETS: Trinket[] = [
  { id: "star", icon: "🌟", name: "Bottled star", cents: 1500, magic: 0, say: "uncorked a bottled star", fx: { magic: 30 } },
  { id: "bone", icon: "🦴", name: "Lucky wishbone", cents: 800, magic: 5, say: "snapped a lucky wishbone", buff: { name: "Wishbone luck", min: 120, attrs: { luck: 2 } } },
  { id: "moth", icon: "🦋", name: "Moth in a jar", cents: 600, magic: 5, say: "let a glowing moth out of its jar", fx: { mood: 15 } },
  { id: "tea", icon: "🍵", name: "Dream tea", cents: 500, magic: 5, say: "drank a cup of dream tea", fx: { energy: 30 } },
];

/** What he found after midnight: enchantments and trinkets, by name and id. */
export class Finds {
  got: string[] = [];

  note(id: string): void {
    if (!this.got.includes(id)) this.got.push(id);
  }

  toJSON() {
    return { got: this.got };
  }

  static fromJSON(d?: { got?: string[] }): Finds {
    const f = new Finds();
    f.got = [...(d?.got ?? [])];
    return f;
  }
}
