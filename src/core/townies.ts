// Townies live on (The Sims 3's story progression): the friends he made keep
// living their own lives. Once a day there is a NEWS_CHANCE that one of them (NEWS_AT hearts or more, never his partner,
// who is with him) has news: they took up the guitar, got married, or moved
// to another city, where he may run into them from then on. Big news comes
// as a letter to him, small news as a line in the feed. Each piece of news
// happens to a friend once. The news lives in data/friends.json. Pure;
// Stats owns one.
import { FRIEND_LETTER_MARK } from "./bond";
import { type Friend, PER_CITY } from "./friends";
import type { Rng } from "./rng";

/** Chance per day that one friend has news. */
export const NEWS_CHANCE = 0.3;
/** Hearts a friend needs before their news reaches him. */
export const NEWS_AT = 2;
/** How a friend's letter to him starts, apart from his own letters to you (✉); bond.ts skips both when you praise or scold. */
export const LETTER_MARK = FRIEND_LETTER_MARK;

/** One piece of news: the feed line ({NAME}, {CITY}), and for big news the letter. A move sends them to another city. */
export type News = { id: string; icon: string; line: string; letter?: string; move?: boolean };

export class Townies {
  /** The local date news was last rolled for. */
  day = "";
  /** Per friend id, the news ids that already happened to them. */
  done: Record<string, string[]> = {};
  /** The letter the last roll brought, for his mailbox (mail.ts); not saved. */
  letter: { friend: Friend; city: string; text: string } | null = null;

  /**
   * A new local day `date`: maybe news from one friend. `cities` are where a
   * friend may move ("Porto, Portugal"). Returns the feed line, or "".
   */
  roll(date: string, friends: Friend[], partner: string, news: readonly News[], cities: readonly string[], rng: Rng): string {
    this.letter = null;
    if (date === this.day) return "";
    const first = !this.day;
    this.day = date;
    // The first day counted (a new game, or a save from before townies) brings none.
    if (first || !news.length || rng.randf() >= NEWS_CHANCE) return "";
    // A friend moves only to a city with room for one more (PER_CITY friends a city).
    const room = (f: Friend) => cities.filter((c) => c !== f.city && friends.filter((g) => g.city === c).length < PER_CITY);
    const open = (f: Friend) => news.filter((n) => !(this.done[f.id] ?? []).includes(n.id) && (!n.move || room(f).length));
    const who = friends.filter((f) => f.id !== partner && f.hearts >= NEWS_AT && open(f).length);
    if (!who.length) return "";
    const f = rng.pick(who);
    const n = rng.pick(open(f));
    (this.done[f.id] ??= []).push(n.id);
    const home = f.city;
    const from = home.split(",")[0]!;
    if (n.move) f.city = rng.pick(room(f));
    const fill = (s: string) => s.replaceAll("{NAME}", f.name).replaceAll("{CITY}", f.city.split(",")[0]!);
    if (n.letter) {
      this.letter = { friend: f, city: home, text: fill(n.letter) };
      return `${LETTER_MARK} A letter from ${f.name} in ${from}: "${this.letter.text}"`;
    }
    return `${n.icon} News from ${from}: ${fill(n.line)}`;
  }

  /** Forgets news of friends he no longer knows, so the save stays small. */
  prune(friends: Friend[]): void {
    for (const id of Object.keys(this.done)) if (!friends.some((f) => f.id === id)) delete this.done[id];
  }

  toJSON() {
    return { day: this.day, done: this.done };
  }

  /** Old saves have no townies: the next day starts counting. */
  static fromJSON(d: unknown): Townies {
    const out = new Townies();
    if (!d || typeof d !== "object") return out;
    const o = d as Record<string, unknown>;
    out.day = typeof o.day === "string" ? o.day : "";
    if (o.done && typeof o.done === "object")
      for (const [id, list] of Object.entries(o.done as Record<string, unknown>)) if (Array.isArray(list)) out.done[id] = list.filter((x): x is string => typeof x === "string");
    return out;
  }
}
