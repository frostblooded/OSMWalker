// His hidden tastes (The Sims 4 likes and dislikes): LIKES kinds of place he
// loves and DISLIKES he can't stand, rolled once for each walker and secret
// until he first does something at one ("Turns out he loves zoos"). Known or
// not, a liked kind pulls his goal LIKE_PULL times as hard and a disliked one
// DISLIKE_PULL, and each visit brings a small moodlet. Unlike quirks they are
// never earned, only found. Pure; Stats owns one and rolls its own dice.
import type { Emotion } from "./emotion";
import { noun } from "./mind";
import type { Rng } from "./rng";

export const LIKES = 3;
export const DISLIKES = 2;
export const LIKE_PULL = 1.5;
export const DISLIKE_PULL = 0.5;
/** The moodlet a visit brings: mood an hour, for how many hours. */
export const LIKE_MOOD: [number, number] = [1, 2];
export const DISLIKE_MOOD: [number, number] = [-1, 2];

/** Map classes a taste can be for. */
export const KINDS = ["cafe", "bakery", "restaurant", "fast_food", "bar", "beer", "cinema", "library", "museum", "art_gallery", "theatre", "zoo", "aquarium", "park", "garden", "castle", "lookout", "stadium", "swimming_pool", "theme_park", "dog_park", "escape_game"];

/** "cafes", "libraries", "galleries". */
export function plural(kind: string): string {
  const n = noun(kind);
  return /[^aeiou]y$/.test(n) ? `${n.slice(0, -1)}ies` : `${n}s`;
}

export class Tastes {
  likes: string[] = [];
  dislikes: string[] = [];
  /** Tastes he has found out. */
  known: string[] = [];

  /** Rolls his tastes once, with dice from `dice` (only made when needed). */
  roll(dice: () => Rng): void {
    if (this.likes.length) return;
    const rng = dice();
    const pool = [...KINDS];
    const take = () => pool.splice(rng.randiRange(0, pool.length - 1), 1)[0]!;
    this.likes = Array.from({ length: LIKES }, take);
    this.dislikes = Array.from({ length: DISLIKES }, take);
  }

  pull(kind: string): number {
    return this.likes.includes(kind) ? LIKE_PULL : this.dislikes.includes(kind) ? DISLIKE_PULL : 1;
  }

  /**
   * He did something at a place of map class `kind`: the moodlet it brings
   * (or null, for a kind he has no taste for) and, the first time, the feed
   * line that tells you.
   */
  did(kind: string): { moodlet: [string, string, number, number, Emotion?]; line: string } | null {
    const like = this.likes.includes(kind);
    if (!like && !this.dislikes.includes(kind)) return null;
    const first = !this.known.includes(kind);
    if (first) this.known.push(kind);
    const p = plural(kind);
    if (like) return { moodlet: [`Loves ${p}`, "💛", ...LIKE_MOOD], line: first ? `💛 Turns out he loves ${p}` : "" };
    return { moodlet: [`Can't stand ${p}`, "💢", ...DISLIKE_MOOD, "tense"], line: first ? `💢 Turns out he can't stand ${p}` : "" };
  }

  toJSON() {
    return { likes: this.likes, dislikes: this.dislikes, known: this.known };
  }

  static fromJSON(d?: Partial<ReturnType<Tastes["toJSON"]>>): Tastes {
    const t = new Tastes();
    t.likes = [...(d?.likes ?? [])];
    t.dislikes = [...(d?.dislikes ?? [])];
    t.known = [...(d?.known ?? [])];
    return t;
  }
}
