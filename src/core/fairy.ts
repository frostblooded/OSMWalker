// Fairy rings: at dawn in a real park or garden he may lie down in a ring of
// mushrooms for a nap, and wake hours later, rested, with either a fairy
// gift (a trinket spun with a little fairy luck and Magic) or a burst of
// Magic and a strange story he can't quite tell. At most once every
// FAIRY_GAP_DAYS, the same watched and away (Stats.fairyAt).
import * as Items from "./items";
import type { Rng } from "./rng";
import type { Fx, Place } from "./stats";

/** Place classes with lawns a fairy ring grows on. */
export const RING_CLASSES: readonly string[] = ["park", "garden"];
/** Dawn: from FAIRY_FROM_H to FAIRY_TO_H (local hours). */
export const FAIRY_FROM_H = 5;
export const FAIRY_TO_H = 8;
/** The odds he naps in a ring when he reaches such a place at dawn, once the last nap is FAIRY_GAP_DAYS behind him. */
export const FAIRY_CHANCE = 0.15;
export const FAIRY_GAP_DAYS = 3;
/** The nap lasts NAP_MIN_MIN to NAP_MAX_MIN minutes and leaves him rested. */
export const NAP_MIN_MIN = 120;
export const NAP_MAX_MIN = 180;
export const NAP_FX: Fx = { energy: 100 };
/** The odds he wakes with a gift rather than Magic and a story. */
export const GIFT_CHANCE = 0.5;
export const STORY_MAGIC = 25;
/** The modifier on every fairy gift. */
export const FAIRY_MOD: Items.Modifier = { name: "Fairy-spun", stats: { luck: 1, magic: 1 } };
const DAY_S = 86_400;

export type Story = { id: string; name: string; say: string };
export const STORIES: readonly Story[] = [
  { id: "dance", name: "The dance", say: "He dreamt he danced all night with small people dressed in green, and can't remember the tune" },
  { id: "feast", name: "The feast", say: "He remembers a feast under the grass, and that he mustn't eat anything. He isn't sure he didn't" },
  { id: "years", name: "The hundred years", say: "He woke sure a hundred years had passed. The bus timetable says otherwise" },
  { id: "name", name: "The true name", say: "Someone in the dream asked his true name. He gave them his middle one" },
];

export const isRingPlace = (p: Pick<Place, "class"> & { made?: unknown }) => !p.made && RING_CLASSES.includes(p.class);
export const isDawn = (hour: number) => hour >= FAIRY_FROM_H && hour < FAIRY_TO_H;

/** A fairy gift for a walker of `level`, and its base: a trinket of a material he could buy, with FAIRY_MOD. */
export function fairyGift(level: number, rng: Rng): { item: Items.Item; base: string } {
  const base = rng.pick(Items.KINDS.trinkets);
  const mat = rng.pick(Items.MATERIALS.filter((m) => m.level <= level));
  return { item: Items.build(base, mat, [FAIRY_MOD]), base: base.base };
}

/** His naps in fairy rings: when the last was (unix seconds, 0 for never), and the gifts (by base) and stories he came back with. */
export class Rings {
  last = 0;
  naps = 0;
  gifts: string[] = [];
  stories: string[] = [];

  /** True when a ring place he reaches at `now` takes him for dice `r`. */
  takes(now: number, r: number): boolean {
    return (this.last === 0 || now - this.last >= FAIRY_GAP_DAYS * DAY_S) && r < FAIRY_CHANCE;
  }

  /** He napped at `now`, coming back with `got` (a gift base or a story id, noted once). */
  note(now: number, got: { gift: string } | { story: string }): void {
    this.last = now;
    this.naps++;
    const [list, id] = "gift" in got ? [this.gifts, got.gift] : [this.stories, got.story];
    if (!list.includes(id)) list.push(id);
  }

  toJSON() {
    return { last: this.last, naps: this.naps, gifts: this.gifts, stories: this.stories };
  }

  static fromJSON(d?: Partial<ReturnType<Rings["toJSON"]>>): Rings {
    const r = new Rings();
    r.last = d?.last ?? 0;
    r.naps = d?.naps ?? 0;
    r.gifts = [...(d?.gifts ?? [])];
    r.stories = [...(d?.stories ?? [])];
    return r;
  }
}
