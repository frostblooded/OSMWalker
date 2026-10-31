// His diary (Godville's hero diary): once a local day he writes a few
// first-person lines about the day that ended, from fill-in templates over
// what he noted that day (a wish come true, a fear, a new spot, a faint...).
// When he naps or sleeps he may dream: a short, odd remix of the places of
// his day. No AI model, only templates from data/diary.json. Pure; Stats
// owns one.
import type { Rng } from "./rng";

/** Days the diary keeps; older ones are torn out. */
export const KEEP_DAYS = 60;
/** Lines about the day under each entry's opening line, at most. */
export const DAY_LINES = 3;
/** Notes kept per day; later ones are skipped. */
export const MAX_NOTES = 12;
/** Odds a nap or a night's sleep brings a dream he remembers. */
export const DREAM_CHANCE = 0.5;

/** What he may note in a day, most worth writing first. */
export const NOTE_KINDS = ["faint", "arrive", "brave", "fear", "quirk", "spot", "wish", "first", "mishap", "work"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

/** data/diary.json: lines with {CITY}, {DAY}, {PLACE}, {A} and {B}. */
export type DiaryData = { open: string[]; notes: Record<NoteKind, string[]>; quiet: string[]; dreams: string[]; things: string[] };

export type Note = { kind: NoteKind; place: string };
export type DiaryEntry = { date: string; city: string; day: number; lines: string[]; dreams: string[] };

const fill = (line: string, v: Record<string, string>) => line.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);

export class Diary {
  /** Written days, oldest first. */
  entries: DiaryEntry[] = [];
  /** The day he is living: its local date, city, notes and dreams so far. */
  today: { date: string; city: string; notes: Note[]; dreams: string[] } = { date: "", city: "", notes: [], dreams: [] };
  /** Days written in each city. */
  days: Record<string, number> = {};

  /** Notes that `kind` happened at `place` (a place or city name) today. Past MAX_NOTES, it takes the place of the note that matters least, if it matters more. */
  note(kind: NoteKind, place: string): void {
    const notes = this.today.notes;
    if (notes.length < MAX_NOTES) {
      notes.push({ kind, place });
      return;
    }
    const rank = (k: NoteKind) => NOTE_KINDS.indexOf(k);
    const worst = notes.reduce((w, n, i) => (rank(n.kind) >= rank(notes[w]!.kind) ? i : w), 0);
    if (rank(kind) < rank(notes[worst]!.kind)) notes[worst] = { kind, place };
  }

  /**
   * A new local day `date` began in `city`: writes the entry for the day that
   * ended (if one was under way), and starts the new one. Returns the entry
   * written, or null.
   */
  close(date: string, city: string, data: DiaryData | null, rng: Rng): DiaryEntry | null {
    const was = this.today;
    // No day under way yet (a new game): what he noted so far starts this one.
    this.today = { date, city, notes: was.date ? [] : was.notes, dreams: was.date ? [] : was.dreams };
    if (!was.date || was.date === date || !data) return null;
    const town = was.city.split(",")[0] || "Somewhere";
    const day = (this.days[was.city] = (this.days[was.city] ?? 0) + 1);
    const lines = [fill(rng.pick(data.open), { CITY: town, DAY: String(day) })];
    const seen = new Set<NoteKind>();
    const notes = [...was.notes].sort((a, b) => NOTE_KINDS.indexOf(a.kind) - NOTE_KINDS.indexOf(b.kind));
    for (const n of notes) {
      if (lines.length > DAY_LINES || seen.has(n.kind) || !data.notes[n.kind]?.length) continue;
      seen.add(n.kind);
      lines.push(fill(rng.pick(data.notes[n.kind]), { PLACE: n.place, CITY: town }));
    }
    if (lines.length === 1) lines.push(fill(rng.pick(data.quiet), { CITY: town }));
    const entry: DiaryEntry = { date: was.date, city: was.city, day, lines, dreams: was.dreams };
    this.entries.push(entry);
    if (this.entries.length > KEEP_DAYS) this.entries.shift();
    return entry;
  }

  /** He naps or sleeps: with DREAM_CHANCE, a dream remixing today's places (or the city). Returns it, or "". */
  dream(data: DiaryData | null, rng: Rng): string {
    if (!data?.dreams.length || rng.randf() >= DREAM_CHANCE) return "";
    const places = [...new Set(this.today.notes.map((n) => n.place))];
    const a = places.length ? rng.pick(places) : this.today.city.split(",")[0] || "the city";
    const line = fill(rng.pick(data.dreams), { A: a, B: rng.pick(data.things) });
    this.today.dreams.push(line);
    return line;
  }

  toJSON() {
    return { entries: this.entries, today: this.today, days: this.days };
  }

  static fromJSON(d?: Partial<ReturnType<Diary["toJSON"]>>): Diary {
    const x = new Diary();
    x.entries = (d?.entries ?? []).map((e) => ({ ...e, lines: [...e.lines], dreams: [...e.dreams] }));
    if (d?.today) x.today = { ...d.today, notes: d.today.notes.map((n) => ({ ...n })), dreams: [...d.today.dreams] };
    x.days = { ...(d?.days ?? {}) };
    return x;
  }
}
