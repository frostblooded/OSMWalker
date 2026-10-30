// Anniversaries (RimWorld's rituals, The Sims' birthdays): the day he set out
// is his birthday. Each year on it he has a party with his friends in the
// city he is in; how it goes rolls with his mood, and a great one leaves a
// long glow. On the same day of each of the other months he marks a small one:
// "Three months on the road". Pure; Stats owns one and calls it once a
// local day.
import type { Friend } from "./friends";
import type { Rng } from "./rng";
import type { Action, Fx } from "./stats";

/** Friends at a party: those in his city with this many hearts, and his partner, up to PARTY_MAX named. */
export const PARTY_AT = 3;
export const PARTY_MAX = 4;
/** A month mark's mood. */
export const MONTH_MOOD = 5;
/** A party's mood: a quiet one alone, a good one, and on top of a good one the great one's glow (mood an hour, for GLOW_MIN). */
export const ALONE_MOOD = 3;
export const PARTY_MOOD = 15;
export const GLOW_MIN = 24 * 60;
export const GLOW_PER_H = 1;
/** A party is great with his mood / 100 as the chance, at least GREAT_MIN. */
export const GREAT_MIN = 0.2;

const YEARS = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];

/** "3 months", "1 year and 2 months". */
export function span(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const unit = (n: number, w: string) => `${n} ${w}${n > 1 ? "s" : ""}`;
  return [y ? unit(y, "year") : "", m ? unit(m, "month") : ""].filter(Boolean).join(" and ");
}

/** What happened today: the feed line, fx to apply and maybe a buff. */
export type Mark = { line: string; fx: Fx; buff?: NonNullable<Action["buff"]> };

/** Whole months from `born` to `now` (both local Dates), counting a month on the same day (or the month's last, if shorter). */
export function monthsBetween(born: Date, now: Date): number {
  let m = (now.getFullYear() - born.getFullYear()) * 12 + now.getMonth() - born.getMonth();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (now.getDate() < Math.min(born.getDate(), last)) m--;
  return m;
}

/** True when `now` is a month mark of `born`: its day of the month, or the month's last day when that is shorter. */
export function isMark(born: Date, now: Date): boolean {
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return now.getDate() === Math.min(born.getDate(), last) && monthsBetween(born, now) > 0;
}

export class Anniversaries {
  /** Unix seconds he set out: his birthday. 0 until the first day counted. */
  born = 0;
  /** The local date last checked. */
  day = "";

  /**
   * A new local day `date` at unix seconds `t`: his birthday party or a
   * month mark, or null. `city` is where he is, `friends` whom he knows.
   */
  check(date: string, t: number, mood: number, city: string, friends: Friend[], partner: string, rng: Rng): Mark | null {
    if (date === this.day) return null;
    this.day = date;
    if (!this.born) this.born = t;
    const born = new Date(this.born * 1000);
    const now = new Date(t * 1000);
    if (!isMark(born, now)) return null;
    const months = monthsBetween(born, now);
    if (months % 12) return { line: `📅 ${span(months)} on the road`, fx: { mood: MONTH_MOOD } };
    const years = months / 12;
    const nth = YEARS[years] ?? `${years}th`;
    const guests = friends.filter((f) => f.id === partner || (f.city === city && f.hearts >= PARTY_AT)).sort((a, b) => b.hearts - a.hearts).slice(0, PARTY_MAX);
    const where = city.split(",")[0];
    if (!guests.length) return { line: `🎂 His ${nth} birthday on the road: a quiet one alone in ${where}`, fx: { mood: ALONE_MOOD } };
    const names = guests.map((f) => f.name);
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
    const great = rng.randf() < Math.max(mood / 100, GREAT_MIN);
    const line = `🎂 His ${nth} birthday on the road: a party in ${where} with ${list}${great ? ", a great one" : ""}`;
    return great
      ? { line, fx: { mood: PARTY_MOOD }, buff: { name: "Great birthday", min: GLOW_MIN, per_h: { mood: GLOW_PER_H } } }
      : { line, fx: { mood: PARTY_MOOD } };
  }

  toJSON() {
    return { born: this.born, day: this.day };
  }

  /** Old saves have none: `born` is when he set out, if known. */
  static fromJSON(d: unknown, setOut = 0): Anniversaries {
    const out = new Anniversaries();
    const o = (d ?? {}) as Partial<Anniversaries>;
    out.born = Number(o.born) || setOut;
    out.day = typeof o.day === "string" ? o.day : "";
    return out;
  }
}
