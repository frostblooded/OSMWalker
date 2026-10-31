// Visas that grow (The Sims 3's World Adventures visas): each country he
// spends days in gives him a better visa there, from Tourist up to Citizen.
// A visa caps how long one stay in the country may last; as he nears the
// cap his trip dice lean abroad, so he moves on by himself, and a better
// visa allows longer stays and better pay at local jobs. Nothing is forced:
// he never has to leave, the odds just grow.

/** Each visa: the days he must have spent in the country, how many days one stay may last, and the extra share of pay at work there. */
export const VISAS = [
  { name: "Tourist", from: 0, stay: 3, pay: 0 },
  { name: "Long stay", from: 7, stay: 10, pay: 0.05 },
  { name: "Resident", from: 30, stay: 30, pay: 0.1 },
  { name: "Citizen", from: 90, stay: Infinity, pay: 0.15 },
] as const;
export type Visa = (typeof VISAS)[number];
/** On the last day of a stay his odds of a trip abroad are this many times higher; past it, VISA_PUSH times. */
export const VISA_URGE = 4;
export const VISA_PUSH = 10;

/** The visa that `days` in a country give. */
export function visaFor(days: number): Visa {
  let v: Visa = VISAS[0];
  for (const x of VISAS) if (days >= x.from) v = x;
  return v;
}

export class Visas {
  /** Days spent in each country, by country code. */
  days: Record<string, number> = {};
  /** The country of this stay and its days so far. */
  code = "";
  stay = 0;

  /** The visa he has in `code`. */
  visa(code: string): Visa {
    return visaFor(this.days[code] ?? 0);
  }

  /** He is now in country `code`: a new country starts a new stay. */
  enter(code: string): void {
    if (code && code !== this.code) [this.code, this.stay] = [code, 0];
  }

  /** A new local day in country `code`: counts it, and returns his new visa when it got better, else null. */
  day(code: string): Visa | null {
    if (!code) return null;
    this.enter(code);
    const was = this.visa(code);
    this.days[code] = (this.days[code] ?? 0) + 1;
    this.stay++;
    const now = this.visa(code);
    return now !== was ? now : null;
  }

  /** Days of this stay left on his visa: 0 on its last day, below 0 past it, Infinity as a citizen. */
  left(): number {
    return this.code ? this.visa(this.code).stay - this.stay : Infinity;
  }

  /** How much likelier a trip abroad is now. */
  urge(): number {
    const left = this.left();
    return left < 0 ? VISA_PUSH : left === 0 ? VISA_URGE : 1;
  }

  /** Extra pay at work in `code`, as a multiple. */
  payMult(code: string): number {
    return 1 + (code ? this.visa(code).pay : 0);
  }

  toJSON() {
    return { days: this.days, code: this.code, stay: this.stay };
  }

  /** Old saves have no visas: every country starts on Tourist. */
  static fromJSON(d?: Partial<ReturnType<Visas["toJSON"]>>): Visas {
    return Object.assign(new Visas(), d ?? {});
  }
}
