// Letters and gifts from his friends (Animal Crossing's letters, Neko
// Atsume's gifts). On the first minute of a local day, a friend in another
// city (LETTER_AT hearts or more) may write to him about the place where they
// met; the letter waits in his mailbox, so after a long time away you find
// it there. A friend in a city where he has a spot (GIFT_AT hearts or more)
// may leave a gift at his spot; he finds it the next time he gets there. His
// partner is with him, so never writes or leaves one.
// Lines and gifts live in data/mail.json. Pure; Stats owns one.
import type { Friend } from "./friends";
import type { Fx } from "./stats";
import type { Rng } from "./rng";

export const LETTER_CHANCE = 0.2;
export const LETTER_AT = 2;
export const GIFT_CHANCE = 0.2;
export const GIFT_AT = 3;
/** Letters the mailbox keeps; older ones are thrown away. */
export const KEEP_LETTERS = 20;

/** data/mail.json: letter lines ({NAME}, {PLACE}, {CITY}) and the gifts a friend may leave. */
export type Gift = { name: string; icon: string; fx: Fx; line: string };
export type MailData = { letters: string[]; gifts: Gift[] };

export type Letter = { from: string; icon: string; city: string; text: string; t: number };
/** A gift waiting at his spot in `city`. */
export type Waiting = { from: string; city: string; gift: Gift };

const fill = (line: string, v: Record<string, string>) => line.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);

export class Mailbox {
  letters: Letter[] = [];
  /** Gifts waiting at his spots, at most one a city. */
  waiting: Waiting[] = [];

  /**
   * A new local day at unix seconds `t`, in `here`: maybe a letter from a
   * friend elsewhere, and maybe a gift at one of `spots` (cities where he has
   * one) from a friend there, never `partner` (an id, "" for none). Returns the feed lines.
   */
  day(t: number, here: string, friends: Friend[], partner: string, spots: string[], data: MailData | null, rng: Rng): string[] {
    if (!data) return [];
    const out: string[] = [];
    // His partner is always with him, so never writes or leaves a gift.
    const far = friends.filter((f) => f.id !== partner && f.hearts >= LETTER_AT && f.city !== here);
    if (far.length && data.letters.length && rng.randf() < LETTER_CHANCE) {
      const f = rng.pick(far);
      const town = f.city.split(",")[0]!;
      this.letters.push({ from: f.name, icon: f.icon, city: f.city, text: fill(rng.pick(data.letters), { NAME: f.name, PLACE: f.place.name, CITY: town }), t });
      if (this.letters.length > KEEP_LETTERS) this.letters.shift();
      out.push(`📬 A letter from ${f.name} in ${town}`);
    }
    const givers = friends.filter((f) => f.id !== partner && f.hearts >= GIFT_AT && spots.includes(f.city) && !this.waiting.some((w) => w.city === f.city));
    if (givers.length && data.gifts.length && rng.randf() < GIFT_CHANCE) {
      const f = rng.pick(givers);
      this.waiting.push({ from: f.name, city: f.city, gift: rng.pick(data.gifts) });
    }
    return out;
  }

  /** He reached his spot in `city`: the gift waiting there, if any, now his. */
  pickUp(city: string): Waiting | null {
    const i = this.waiting.findIndex((w) => w.city === city);
    return i < 0 ? null : this.waiting.splice(i, 1)[0]!;
  }

  toJSON() {
    return { letters: this.letters, waiting: this.waiting };
  }

  static fromJSON(d?: Partial<ReturnType<Mailbox["toJSON"]>>): Mailbox {
    const m = new Mailbox();
    m.letters = (d?.letters ?? []).map((l) => ({ ...l }));
    m.waiting = (d?.waiting ?? []).map((w) => ({ ...w }));
    return m;
  }
}
