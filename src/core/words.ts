// Local words: in a country whose language is in data/words.json he now and
// then picks up an everyday word at a place that fits it ("кафе (kafe)" at a
// café, "hello" anywhere), and keeps what he learned per language.

/** data/words.json: where each meaning is learned, each language's words, and each country's language. */
export type WordBook = {
  /** Meaning -> place classes where it is learned; a meaning not listed is learned anywhere. */
  at: Record<string, string[]>;
  languages: Record<string, { name: string; words: [word: string, meaning: string][] }>;
  /** Country code (data/cities.tsv) -> language key. */
  countries: Record<string, string>;
};

export type Learned = { language: string; word: string; meaning: string };

/** Share of stops in such a country where he learns a word. */
export const LEARN_CHANCE = 0.25;
export const WORD_WIT = 0.05;
export const WORD_XP = 5;

/** The words he knows, by language key, as meanings in the order he learned them. */
export class Words {
  known: Record<string, string[]> = {};

  /** At a place of class `cls` in country `code`: the word he learns with dice `r` in [0, 1), or null. A word for this kind of place comes before one for anywhere. */
  learn(book: WordBook, code: string, cls: string, r: number): Learned | null {
    const key = book.countries[code];
    const lang = key === undefined ? undefined : book.languages[key];
    if (!key || !lang || r >= LEARN_CHANCE) return null;
    const known = this.known[key] ?? [];
    const left = lang.words.filter(([, m]) => !known.includes(m));
    const w = left.find(([, m]) => book.at[m]?.includes(cls)) ?? left.find(([, m]) => !book.at[m]);
    if (!w) return null;
    this.known[key] = [...known, w[1]];
    return { language: lang.name, word: w[0], meaning: w[1] };
  }

  /** Every word he knows, over all languages. */
  count(): number {
    return Object.values(this.known).reduce((n, l) => n + l.length, 0);
  }

  toJSON() {
    return { known: this.known };
  }

  static fromJSON(d?: Partial<ReturnType<Words["toJSON"]>>): Words {
    const w = new Words();
    for (const [k, l] of Object.entries(d?.known ?? {})) if (Array.isArray(l)) w.known[k] = l.filter((m) => typeof m === "string");
    return w;
  }
}
