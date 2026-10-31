// Side businesses (Godville's investments, Stardew's sheds): once he has a
// business's price to spare past what he saves up for, he buys the next one,
// cheapest first, in the city he is in. A local partner runs it, so it brings
// in money by the hour wherever he is, also while you're away, and pays him
// once a day. The last one is a small fantasy touch: a potion stall. All by
// himself. Pure; Stats owns one.

export type BusinessKind = { id: string; icon: string; name: string; /** Price, in cents. */ cents: number; /** Cents it brings in an hour. */ perH: number };

/** What he can own, one of each, bought in this order. Each pays for itself in about 17 to 19 days. */
export const BUSINESSES: BusinessKind[] = [
  { id: "cart", icon: "☕", name: "coffee cart", cents: 30_000, perH: 75 },
  { id: "kiosk", icon: "📰", name: "newspaper kiosk", cents: 100_000, perH: 250 },
  { id: "hostel", icon: "🛏", name: "room at a hostel", cents: 300_000, perH: 700 },
  { id: "truck", icon: "🚚", name: "food truck", cents: 800_000, perH: 1800 },
  { id: "potions", icon: "🧪", name: "potion stall", cents: 2_000_000, perH: 4500 },
];

export type Owned = { id: string; city: string; since: number };

export const kindOf = (id: string) => BUSINESSES.find((b) => b.id === id);

export class Business {
  owned: Owned[] = [];
  /** Cents taken in since the last payout, with fractions. */
  pending = 0;
  /** Cents his businesses have paid him in all. */
  earned = 0;

  /** The next one he would buy, or null once he owns them all. */
  next(): BusinessKind | null {
    return BUSINESSES.find((b) => !this.owned.some((o) => o.id === b.id)) ?? null;
  }

  /** Cents they bring in an hour, all together. */
  perH(): number {
    return this.owned.reduce((sum, o) => sum + (kindOf(o.id)?.perH ?? 0), 0);
  }

  buy(k: BusinessKind, city: string, t: number): void {
    this.owned.push({ id: k.id, city, since: t });
  }

  /** `h` hours of takings. */
  pass(h: number): void {
    this.pending += this.perH() * h;
  }

  /** Pays out the whole cents taken in so far; returns them. */
  payout(): number {
    const c = Math.floor(this.pending);
    this.pending -= c;
    this.earned += c;
    return c;
  }

  toJSON() {
    return { owned: this.owned, pending: this.pending, earned: this.earned };
  }

  /** Old saves own none; unknown kinds are dropped. */
  static fromJSON(d: unknown): Business {
    const out = new Business();
    const v = d as { owned?: unknown; pending?: unknown; earned?: unknown } | null;
    if (Array.isArray(v?.owned)) out.owned = (v.owned as Owned[]).filter((o) => o && kindOf(o.id) && typeof o.city === "string").map((o) => ({ id: o.id, city: o.city, since: Number(o.since) || 0 }));
    out.pending = Math.max(Number(v?.pending) || 0, 0);
    out.earned = Math.max(Number(v?.earned) || 0, 0);
    return out;
  }
}

/** "coffee cart and newspaper kiosk". */
export function namesOf(owned: readonly Owned[]): string {
  const names = owned.map((o) => kindOf(o.id)!.name);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "");
}
