// Sight notes: at a big sight (map rank 1 or 2) he reads up on it, the first
// sentence of its Wikipedia article. English Wikipedia first, then the one in
// the country's language (data/words.json). Each sight is looked up once, a
// few an hour, and only while you watch, as it needs the network.

/** Sights of this map rank or better (1 is the most important) get a note. */
export const NOTE_RANK = 2;
/** How far from the sight an article may stand. */
export const RADIUS_M = 200;
/** Longest note in the feed; a longer sentence is cut at a word. */
export const MAX_CHARS = 220;
/** Most lookups an hour. */
export const PER_HOUR = 6;
/** Sights with no article that are kept, so they are not asked again. */
export const NONE_KEEP = 300;
export const NOTE_WIT = 0.05;
export const NOTE_XP = 5;

/** The lookup times (unix ms) of the past hour with `now` added, or null when PER_HOUR are already in it. */
export function ask(asks: number[], now: number): number[] | null {
  const hour = asks.filter((t) => now - t < 3_600_000);
  return hour.length < PER_HOUR ? [...hour, now] : null;
}

/** Wikipedia's articles within RADIUS_M of a point, nearest first, each with the first sentence of its intro. */
export const url = (wiki: string, lat: number, lon: number) =>
  `https://${wiki}.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=geosearch&ggscoord=${lat.toFixed(5)}|${lon.toFixed(5)}&ggsradius=${RADIUS_M}&ggslimit=10&prop=extracts&exintro=1&explaintext=1&exsentences=1&exlimit=10`;

/** The Wikipedia for a language key from data/words.json ("pt-BR" reads pt, Filipino reads tl). */
export const wikiOf = (lang: string) => (lang === "fil" ? "tl" : lang.split("-")[0]!);

/** Lower case, no accents, words only: "Cathédrale St. Alexandre" -> "cathedrale st alexandre". */
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Whether an article title names the place: the same, or one holds the other of at least two words (not just "Museum"). */
export function matches(title: string, name: string): boolean {
  const [t, n] = [fold(title), fold(name)];
  if (!t || !n) return false;
  if (t === n) return true;
  const [short, long] = t.length < n.length ? [t, n] : [n, t];
  return short.includes(" ") && ` ${long} `.includes(` ${short} `);
}

/** A first sentence made short: no brackets (spellings, dates), cut at a word past MAX_CHARS. */
export function tidy(extract: string): string {
  let s = extract.replace(/\s+/g, " ").trim();
  for (let was = ""; was !== s; ) {
    was = s;
    s = s.replace(/\s*\([^()]*\)/g, "").replace(/\s*\[[^[\]]*\]/g, "");
  }
  s = s.replace(/\s+([,.;:])/g, "$1").trim();
  if (s.length <= MAX_CHARS) return s;
  const cut = s.slice(0, MAX_CHARS);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:]$/, "")}…`;
}

type Page = { title?: unknown; extract?: unknown; index?: unknown };

/** From a geosearch answer: the note for the article nearest `name` that names it, or null. */
export function pick(data: unknown, name: string): string | null {
  const pages = (data as { query?: { pages?: Record<string, Page> } } | null)?.query?.pages;
  if (!pages || typeof pages !== "object") return null;
  const near = Object.values(pages).sort((a, b) => Number(a.index ?? 0) - Number(b.index ?? 0));
  for (const p of near) {
    if (typeof p.title !== "string" || typeof p.extract !== "string" || !matches(p.title, name)) continue;
    const note = tidy(p.extract);
    if (note) return note;
  }
  return null;
}

/** Sights he read up on, and sights with no article, by visit key. */
export class SightNotes {
  read: string[] = [];
  none: string[] = [];

  /** Whether `key` was looked up already, with or without a note. */
  knows(key: string): boolean {
    return this.read.includes(key) || this.none.includes(key);
  }

  noted(key: string): void {
    if (!this.read.includes(key)) this.read.push(key);
  }

  /** No article for `key`; only the latest NONE_KEEP are kept. */
  missed(key: string): void {
    if (!this.none.includes(key)) this.none = [...this.none, key].slice(-NONE_KEEP);
  }

  toJSON() {
    return { read: this.read, none: this.none };
  }

  static fromJSON(d?: Partial<ReturnType<SightNotes["toJSON"]>>): SightNotes {
    const n = new SightNotes();
    const strings = (l: unknown) => (Array.isArray(l) ? l.filter((k): k is string => typeof k === "string") : []);
    n.read = strings(d?.read);
    n.none = strings(d?.none).slice(-NONE_KEEP);
    return n;
  }
}
