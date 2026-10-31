// His week in numbers, for the weekly recap: how far he walked, where he
// stopped, new places and cities, and his money and level at the start. When
// a new week starts (Monday at midnight) the old one becomes the recap,
// shown once in the next reopen's welcome-back card.
export const WEEK_S = 7 * 86400;

export type Tally = {
  /** Unix seconds of the Monday midnight it started; 0 before the first count. */
  start: number;
  walkedM: number;
  stops: number;
  newPlaces: number;
  /** Stops by place class. */
  kinds: Record<string, number>;
  /** Cities he arrived in, each once. */
  cities: string[];
  /** Cents and level when the week started. */
  cents: number;
  level: number;
};
export type Recap = Tally & { endCents: number; endLevel: number };

/** Unix seconds of the last midnight before `t`, in a time zone `biasMin` minutes from UTC. */
export function dayStart(t: number, biasMin: number): number {
  const local = t + biasMin * 60;
  return local - (((local % 86400) + 86400) % 86400) - biasMin * 60;
}

/** Unix seconds of the last Monday midnight before `t`, in a time zone `biasMin` minutes from UTC. */
export function weekStart(t: number, biasMin: number): number {
  const day = dayStart(t, biasMin);
  // 1970-01-01 was a Thursday: day 0 counted from Monday is 3.
  const sinceMonday = (Math.round((day + biasMin * 60) / 86400) + 3) % 7;
  return day - sinceMonday * 86400;
}

const fresh = (start: number, cents: number, level: number): Tally => ({ start, walkedM: 0, stops: 0, newPlaces: 0, kinds: {}, cities: [], cents, level });

export class Week {
  tally: Tally = fresh(0, 0, 1);
  last: Recap | null = null;
  /** The recap of `last` has been shown. */
  shown = true;

  /** Starts a new week when `t` has passed this one; says whether it did. */
  roll(t: number, cents: number, level: number, biasMin: number): boolean {
    if (!this.tally.start) {
      this.tally = fresh(weekStart(t, biasMin), cents, level);
      return false;
    }
    if (t < this.tally.start + WEEK_S) return false;
    this.last = { ...this.tally, endCents: cents, endLevel: level };
    this.shown = this.last.stops === 0;
    this.tally = fresh(weekStart(t, biasMin), cents, level);
    return true;
  }

  walked(m: number): void {
    this.tally.walkedM += m;
  }

  stop(kind: string): void {
    this.tally.stops++;
    this.tally.kinds[kind] = (this.tally.kinds[kind] ?? 0) + 1;
  }

  newPlace(): void {
    this.tally.newPlaces++;
  }

  city(name: string): void {
    if (!this.tally.cities.includes(name)) this.tally.cities.push(name);
  }

  /** The recap still to show, or null. */
  pending(): Recap | null {
    return this.shown ? null : this.last;
  }

  seen(): void {
    this.shown = true;
  }

  /** The kind of place he stopped at most last week, and how often. */
  favourite(): [string, number] | null {
    let best: [string, number] | null = null;
    for (const [k, n] of Object.entries(this.last?.kinds ?? {})) if (!best || n > best[1]) best = [k, n];
    return best;
  }

  toJSON() {
    return { tally: this.tally, last: this.last, shown: this.shown };
  }

  static fromJSON(d: ReturnType<Week["toJSON"]> | undefined): Week {
    const w = new Week();
    if (!d) return w;
    w.tally = d.tally;
    w.last = d.last;
    w.shown = d.shown;
    return w;
  }
}
