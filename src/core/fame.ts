// His fame, city by city: how well people there know his face, good or bad
// (Fable's renown). Time spent in a city and every deed, kind or rascal, add
// points; past each tier he is Known, a Regular, then a Local hero. Fame
// never falls. The karma gate on discounts lives in Stats.shopDiscount, so
// this file knows nothing of karma.

/** Points at which each tier starts: Stranger, Known, Regular, Local hero. */
export const FAME_TIERS = [0, 50, 200, 600] as const;
export const FAME_NAMES = ["Stranger", "Known", "Regular", "Local hero"] as const;
/** Shop discount at each tier. */
export const FAME_DISCOUNT = [0, 0.05, 0.1, 0.15] as const;
/** Points stop at this many in a city. */
export const FAME_MAX = 1000;
/** Points an hour in a city adds; a deed adds a point for each point of karma it moves, good or bad (Stats.karma). */
export const FAME_PER_H = 1;

/** The key a city's fame is kept under, e.g. "Sofia|BG". */
export const cityKey = (city: string, code: string) => `${city}|${code}`;
/** The tier `points` reach. */
export const tierOf = (points: number) => FAME_TIERS.findLastIndex((at) => points >= at);

export class Fame {
  pts: Record<string, number> = {};

  /** Adds `n` points (never below 0, never past FAME_MAX) in `key`; returns the new tier when it changed, else null. */
  add(key: string, n: number): number | null {
    if (!key || n <= 0) return null;
    const before = this.tier(key);
    this.pts[key] = Math.min((this.pts[key] ?? 0) + n, FAME_MAX);
    const after = this.tier(key);
    return after !== before ? after : null;
  }

  points(key: string): number {
    return this.pts[key] ?? 0;
  }

  /** 0 Stranger to 3 Local hero. */
  tier(key: string): number {
    return tierOf(this.points(key));
  }

  discount(key: string): number {
    return FAME_DISCOUNT[this.tier(key)]!;
  }

  /** Points over all of country `code`'s cities. */
  country(code: string): number {
    let n = 0;
    for (const [k, v] of Object.entries(this.pts)) if (k.endsWith(`|${code}`)) n += v;
    return n;
  }

  /** Points over every city. */
  total(): number {
    return Object.values(this.pts).reduce((a, b) => a + b, 0);
  }

  /** Cities where he is at least tier `t`. */
  citiesAt(t: number): number {
    return Object.keys(this.pts).filter((k) => this.tier(k) >= t).length;
  }

  toJSON() {
    return { pts: this.pts };
  }

  /** Old saves have no fame: he is a stranger everywhere. */
  static fromJSON(d?: Partial<ReturnType<Fame["toJSON"]>>): Fame {
    const f = new Fame();
    f.pts = { ...(d?.pts ?? {}) };
    return f;
  }
}
