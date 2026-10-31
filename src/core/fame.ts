// His fame, city by city: how well people there know his face, good or bad
// (Fable's renown). Time spent in a city and every deed, kind or rascal, add
// points; past each tier he is Known, a Regular, then a Local hero. Fame
// never falls. Where they know him, people at his stops greet him now and
// then, and a Local hero gets a story in the local paper. The karma gate on discounts lives in Stats.shopDiscount, so
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

/** At a stop, the chance someone greets him is this much for each tier. */
export const GREET_PER_TIER = 0.03;
/** Greetings by tier (Known, Regular, Local hero); {PLACE} is the stop. */
export const GREETINGS: readonly (readonly string[])[] = [
  ["Someone at {PLACE} nods at him: \"You again!\"", "A face at {PLACE} seems to know him", "At {PLACE} they wave as he comes in"],
  ["At {PLACE} they know what he'll have before he asks", "The staff at {PLACE} call him by his name", "\"The usual?\" they ask at {PLACE}"],
  ["Everyone at {PLACE} stops to say hello", "At {PLACE} someone asks for a selfie with him", "Children at {PLACE} point: \"It's him, from the paper!\""],
];
/** The local paper's story when a city makes him its Local hero; {CITY} is the city. */
export const PAPER = ["Local hero walks every street of {CITY}", "{CITY}'s favourite walker: we met him", "Who is the man everyone in {CITY} knows?"];

/** A greeting at `place` where he is at `tier`, or "" when nobody greets him this time (`r` and `pick` from 0 to 1). */
export function greeting(tier: number, place: string, r: number, pick: number): string {
  const lines = GREETINGS[tier - 1];
  if (!lines || r >= GREET_PER_TIER * tier) return "";
  return `👋 ${lines[Math.floor(pick * lines.length)]!.replace("{PLACE}", place)}`;
}

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
