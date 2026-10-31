// His records over a whole life: longest stretch between stops, most walked
// and most places in a day, most money held, longest run without fainting,
// and totals (countries, cities, mishaps, faints). Stats feeds it, so a
// record counts every minute he lives.
// Beating a best may get a feed line, at most one a day.
import { euro } from "./money";

/** Records with a best that can be beaten, in the order the Stats sheet shows them. */
export const BESTS = ["stretchM", "dayM", "dayStops", "cents", "noFaintS"] as const;
export type Best = (typeof BESTS)[number];
/** A best must be at least this before beating it is worth a feed line, so a new life doesn't brag about its first steps. */
export const BRAG_FROM: Record<Best, number> = { stretchM: 2000, dayM: 5000, dayStops: 10, cents: 50000, noFaintS: 86400 };

export type Day = { day: string; m: number; stops: number };

export class Records {
  best: Record<Best, number> = { stretchM: 0, dayM: 0, dayStops: 0, cents: 0, noFaintS: 0 };
  /** Metres since his last stop. */
  stretchM = 0;
  /** Today's tally. */
  today: Day = { day: "", m: 0, stops: 0 };
  /** Unix seconds of his last faint, or of when the records began. */
  sinceFaint = 0;
  faints = 0;
  mishaps = 0;
  countries: string[] = [];
  cities: string[] = [];
  /** The day of the last record feed line. */
  braggedOn = "";

  /** Raises a best; returns the line to say when it beat an old best worth bragging about and none was said today. */
  private beat(k: Best, v: number, day: string): string {
    const old = this.best[k];
    if (v <= old) return "";
    this.best[k] = v;
    if (old < BRAG_FROM[k] || this.braggedOn === day) return "";
    this.braggedOn = day;
    return `New record: ${BEST_LINE[k](v)}!`;
  }

  private roll(day: string): void {
    if (this.today.day !== day) this.today = { day, m: 0, stops: 0 };
  }

  /** Counts `m` metres walked at `t` on `day`; returns a record line or "". */
  walked(m: number, cents: number, t: number, day: string): string {
    this.roll(day);
    if (!this.sinceFaint) this.sinceFaint = t;
    this.stretchM += m;
    this.today.m += m;
    let line = "";
    for (const [k, v] of [["stretchM", this.stretchM], ["dayM", this.today.m], ["cents", cents], ["noFaintS", t - this.sinceFaint]] as const)
      line = this.beat(k, v, day) || line;
    return line;
  }

  /** He stopped at a place; returns a record line or "". */
  stopped(day: string): string {
    this.roll(day);
    this.stretchM = 0;
    this.today.stops++;
    return this.beat("dayStops", this.today.stops, day);
  }

  fainted(t: number): void {
    this.faints++;
    this.sinceFaint = t;
    this.stretchM = 0;
  }

  mishap(): void {
    this.mishaps++;
  }

  arrived(city: string, code: string): void {
    if (code && !this.countries.includes(code)) this.countries.push(code);
    if (city && !this.cities.includes(city)) this.cities.push(city);
  }

  toJSON() {
    return { best: this.best, stretchM: this.stretchM, today: this.today, sinceFaint: this.sinceFaint, faints: this.faints, mishaps: this.mishaps, countries: this.countries, cities: this.cities, braggedOn: this.braggedOn };
  }

  static fromJSON(d: Partial<ReturnType<Records["toJSON"]>> | undefined): Records {
    const r = new Records();
    if (!d) return r;
    Object.assign(r.best, d.best);
    r.stretchM = d.stretchM ?? 0;
    r.today = d.today ?? r.today;
    r.sinceFaint = d.sinceFaint ?? 0;
    r.faints = d.faints ?? 0;
    r.mishaps = d.mishaps ?? 0;
    r.countries = d.countries ?? [];
    r.cities = d.cities ?? [];
    r.braggedOn = d.braggedOn ?? "";
    return r;
  }
}

const km = (m: number) => `${(m / 1000).toFixed(1)} km`;
/** "3 days 4 h", "5 h", for the no-faint run. */
export const span = (s: number) => {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return d ? `${d} day${d === 1 ? "" : "s"}${h ? ` ${h} h` : ""}` : `${h} h`;
};
const BEST_LINE: Record<Best, (v: number) => string> = {
  stretchM: (v) => `${km(v)} without a stop`,
  dayM: (v) => `${km(v)} in one day`,
  dayStops: (v) => `${v} places in one day`,
  cents: (v) => `${euro(v)} in his pocket`,
  noFaintS: (v) => `${span(v)} without fainting`,
};
