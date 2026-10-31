// His mind (The Sims' wants and fears, RimWorld's named thoughts): moodlets,
// wants and fears. A moodlet is a named, timed piece that nudges his mood a
// little each hour on top of the usual drift ("Wish come true +2/h"). He
// always holds a long and a short want for a kind of place, and after a
// mishap a want to shake it off; a wanted kind pulls his goal WANT_PULL times
// as hard and doing anything there makes the wish come true. A mishap may
// leave a fear of that kind of place, which pulls FEAR_PULL as hard, until a
// want to face it again brings him back and a visit with no mishap beats it.
// All of it happens by itself. Pure; Stats owns one and rolls its own dice.
import type { Emotion } from "./emotion";
import type { Rng } from "./rng";

export const WANT_PULL = 4;
export const FEAR_PULL = 0.25;
/** A short want he hasn't met in this many hours makes way for a new one; a mishap's want lasts SHAKE_H. */
export const SHORT_H = 8;
/** Hours a long want, or the want to face a fear, lasts: the city may have no such place. A fear goes with its want. */
export const LONG_H = 72;
export const SHAKE_H = 3;
/** Odds a mishap at a kind of place leaves a fear of it, and the most fears he holds at once. */
export const FEAR_CHANCE = 0.25;
export const MAX_FEARS = 2;
/** XP for each kind of want coming true; beating a fear is a "face" want. */
export const WANT_XP: Record<WantKind, number> = { long: 150, short: 40, shake: 30, face: 200 };
/** The moodlet each brings: mood an hour, for how many hours. */
export const WANT_MOOD: Record<WantKind, [number, number]> = { long: [3, 4], short: [1, 3], shake: [2, 2], face: [3, 6] };
/** A mishap rattles him (and a new fear shakes him more): mood an hour, for how many hours. */
export const RATTLED: [number, number] = [-1, 1];
export const SHAKEN: [number, number] = [-2, 3];
/** Most moodlets kept at once; the one nearest its end makes room. */
export const MAX_MOODLETS = 8;

/** Long wants: the sights a traveller dreams of. Short wants: everyday treats. Shake: where he cheers up. By map class. */
export const LONG_KINDS = ["castle", "museum", "zoo", "aquarium", "lookout", "theme_park", "theatre", "stadium", "monument", "garden", "harbor", "water_park"];
export const SHORT_KINDS = ["cafe", "bakery", "ice_cream", "restaurant", "park", "bar", "cinema", "library", "fast_food", "beer", "art_gallery", "swimming_pool"];
export const SHAKE_KINDS = ["cafe", "ice_cream", "bar", "park", "bakery"];
/** Classes whose name reads badly as a noun. */
const NOUNS: Record<string, string> = { beer: "pub", harbor: "harbour", lookout: "viewpoint", fast_food: "snack bar", art_gallery: "gallery", lodging: "hotel", place_of_worship: "church", grocery: "supermarket", clothing_store: "clothes shop", shop: "shop", alcohol_shop: "off-licence", ice_cream: "ice cream parlour" };
export const noun = (kind: string) => NOUNS[kind] ?? kind.replace(/_/g, " ");
/** "bakery" -> "bakeries", "church" -> "churches", "place of worship" -> "places of worship". */
export const plural = (noun: string): string => {
  const [head, ...rest] = noun.split(" of ");
  const p = /[^aeiou]y$/.test(head!) ? `${head!.slice(0, -1)}ies` : /(s|x|ch|sh)$/.test(head!) ? `${head}es` : `${head}s`;
  return [p, ...rest].join(" of ");
};
const a = (n: string) => `${/^[aeiou]/.test(n) ? "an" : "a"} ${n}`;

export type WantKind = "long" | "short" | "shake" | "face";
/** A want for a kind of place (map class); `until` is unix seconds (0 only in saves from before LONG_H, mended in refill). */
export type Want = { kind: WantKind; place: string; until: number };
/** `emo`: the emotion it counts towards (see emotion.ts); untagged, Happy or Sad by its sign. */
export type Moodlet = { name: string; icon: string; per_h: number; left: number; emo?: Emotion };

const WANT_ICON: Record<WantKind, string> = { long: "🌠", short: "✨", shake: "🌧", face: "💪" };
export const wantIcon = (w: Want) => WANT_ICON[w.kind];
/** What he says he wants: "see a castle", "a cafe", "cheer up at a park", "face the dog park again". */
export function wantText(w: Want): string {
  const n = noun(w.place);
  if (w.kind === "long") return `See ${a(n)}`;
  if (w.kind === "short") return `Go to ${a(n)}`;
  if (w.kind === "shake") return `Cheer up at ${a(n)}`;
  return `Face the ${n} again`;
}

export class Mind {
  moodlets: Moodlet[] = [];
  wants: Want[] = [];
  /** Map classes he is afraid of. */
  fears: string[] = [];

  /** Adds `name` (or renews it, if he has it). */
  feel(name: string, icon: string, per_h: number, hours: number, emo?: Emotion): void {
    this.moodlets = this.moodlets.filter((m) => m.name !== name);
    this.moodlets.push(emo ? { name, icon, per_h, left: hours * 60, emo } : { name, icon, per_h, left: hours * 60 });
    if (this.moodlets.length > MAX_MOODLETS) {
      this.moodlets.sort((a, b) => b.left - a.left);
      this.moodlets.length = MAX_MOODLETS;
    }
  }

  /** Lets `minutes` pass; returns the mood the moodlets add over them. */
  pass(minutes: number): number {
    let mood = 0;
    for (const m of this.moodlets) {
      mood += (m.per_h * Math.min(minutes, m.left)) / 60;
      m.left -= minutes;
    }
    this.moodlets = this.moodlets.filter((m) => m.left > 0);
    return mood;
  }

  /** Mood an hour from moodlets now. */
  moodPerH(): number {
    return this.moodlets.reduce((s, m) => s + m.per_h, 0);
  }

  /** How hard a place of map class `kind` pulls his goal: WANT_PULL for each want of it, FEAR_PULL if he fears it. */
  pull(kind: string): number {
    let w = 1;
    for (const want of this.wants) if (want.place === kind) w *= WANT_PULL;
    if (this.fears.includes(kind)) w *= FEAR_PULL;
    return w;
  }

  /** At `now`: drops wants that ran out and fills the empty long and short slots, with dice from `dice` (only made when needed). */
  refill(now: number, dice: () => Rng): void {
    // Saves from before LONG_H hold long and face wants that never end: they start counting now.
    for (const w of this.wants) if (!w.until) w.until = now + LONG_H * 3600;
    const gone = this.wants.filter((w) => w.until <= now);
    if (gone.length) {
      this.wants = this.wants.filter((w) => !gone.includes(w));
      // A fear he never got to face fades with its want.
      this.fears = this.fears.filter((f) => !gone.some((w) => w.kind === "face" && w.place === f));
    }
    const long = !this.wants.some((w) => w.kind === "long");
    const short = !this.wants.some((w) => w.kind === "short");
    if (!long && !short) return;
    const rng = dice();
    if (long) this.wants.push({ kind: "long", place: this.fresh(LONG_KINDS, rng), until: now + LONG_H * 3600 });
    if (short) this.wants.push({ kind: "short", place: this.fresh(SHORT_KINDS, rng), until: now + SHORT_H * 3600 });
  }

  /** A kind he doesn't want or fear yet. */
  private fresh(kinds: string[], rng: Rng): string {
    const free = kinds.filter((k) => !this.fears.includes(k) && !this.wants.some((w) => w.place === k));
    return rng.pick(free.length ? free : kinds);
  }

  /**
   * He did something at a place of map class `kind` at `now`, with a mishap
   * or not. Wants of that kind come true (a "face" want only with no mishap,
   * which also beats the fear); a mishap rattles him, wants him to shake it
   * off and may leave a fear. Returns what came true, the feed lines and whether a new fear came.
   */
  did(kind: string, mishap: boolean, now: number, rng: Rng): { met: Want[]; lines: string[]; feared: boolean } {
    const met: Want[] = [];
    const lines: string[] = [];
    let feared = false;
    for (const w of this.wants) {
      if (w.place !== kind || (w.kind === "face" && mishap)) continue;
      met.push(w);
      const [per_h, hours] = WANT_MOOD[w.kind];
      if (w.kind === "face") {
        this.fears = this.fears.filter((f) => f !== kind);
        this.feel(`Faced his fear of the ${noun(kind)}`, "💪", per_h, hours);
        lines.push(`${wantIcon(w)} Faced his fear: the ${noun(kind)} is fine after all (+${WANT_XP.face} XP)`);
      } else {
        this.feel("Wish come true", "🌠", per_h, hours);
        lines.push(`${wantIcon(w)} Wish come true: ${wantText(w).toLowerCase()} (+${WANT_XP[w.kind]} XP)`);
      }
    }
    this.wants = this.wants.filter((w) => !met.includes(w));
    if (mishap) {
      this.feel("Rattled", "😖", ...RATTLED, "tense");
      this.wants = this.wants.filter((w) => w.kind !== "shake");
      this.wants.push({ kind: "shake", place: this.fresh(SHAKE_KINDS.filter((k) => k !== kind), rng), until: now + SHAKE_H * 3600 });
      if (!this.fears.includes(kind) && this.fears.length < MAX_FEARS && !met.length && rng.randf() < FEAR_CHANCE) {
        this.fears.push(kind);
        this.wants = this.wants.filter((w) => w.place !== kind);
        this.wants.push({ kind: "face", place: kind, until: now + LONG_H * 3600 });
        this.feel(`Scared of the ${noun(kind)}`, "😨", ...SHAKEN, "tense");
        feared = true;
        lines.push(`😨 Now he is wary of ${plural(noun(kind))}`);
      }
    }
    return { met, lines, feared };
  }

  toJSON() {
    return { moodlets: this.moodlets, wants: this.wants, fears: this.fears };
  }

  static fromJSON(d?: Partial<ReturnType<Mind["toJSON"]>>): Mind {
    const m = new Mind();
    // A save from before emotions: its Rattled and Scared moodlets count towards Tense, as new ones do.
    m.moodlets = (d?.moodlets ?? []).map((x) => (x.emo || !(x.name === "Rattled" || x.name.startsWith("Scared of")) ? { ...x } : { ...x, emo: "tense" as const }));
    m.wants = (d?.wants ?? []).map((x) => ({ ...x }));
    m.fears = [...(d?.fears ?? [])];
    return m;
  }
}
