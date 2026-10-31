// Side businesses (Godville's investments, Stardew's sheds): once he has a
// business's price to spare past what he saves up for, he buys the next one,
// cheapest first, in the city he is in. A local partner runs it, so it brings
// in money by the hour wherever he is, and pays him once a day. The last one is
// a small fantasy touch: a potion stall. He also buys a share in his spot (see
// spot.ts) in each city that has one: it pays a little each day, and more for
// each time he dropped by since, so it is a reason to come back. All by
// himself. Pure; Stats owns one.

import { same } from "./spot";
import { list } from "./travelKit";

export type BusinessKind = { id: string; icon: string; name: string; /** Price, in cents. */ cents: number; /** Cents it brings in an hour. */ perH: number };

/** What he can own, one of each, bought in this order. Each pays for itself in about four weeks. */
export const BUSINESSES: BusinessKind[] = [
  { id: "cart", icon: "☕", name: "coffee cart", cents: 30_000, perH: 45 },
  { id: "kiosk", icon: "📰", name: "newspaper kiosk", cents: 100_000, perH: 150 },
  { id: "hostel", icon: "🛏", name: "room at a hostel", cents: 300_000, perH: 450 },
  { id: "truck", icon: "🚚", name: "food truck", cents: 800_000, perH: 1200 },
  { id: "potions", icon: "🧪", name: "potion stall", cents: 2_000_000, perH: 3000 },
];

export type Owned = { id: string; city: string; since: number };
/** A share in his spot `place` (at `lat`, `lon`; shares bought before those were kept match by name) in `city`, and his visits there since the last payout. */
export type Share = { city: string; place: string; lat?: number; lon?: number; since: number; visits: number };
type Spot = { name: string; lat: number; lon: number };

/** What a share costs, and what it pays a day: SHARE_BASE, plus SHARE_PER_VISIT for each of up to SHARE_VISITS_MAX visits since the last payout (cents). */
export const SHARE_PRICE = 15_000;
export const SHARE_BASE = 100;
export const SHARE_PER_VISIT = 150;
export const SHARE_VISITS_MAX = 3;

export const kindOf = (id: string) => BUSINESSES.find((b) => b.id === id);

export class Business {
  owned: Owned[] = [];
  shares: Share[] = [];
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

  /** The share he holds in `city`, if any. */
  share(city: string): Share | undefined {
    return this.shares.find((x) => x.city === city);
  }

  buyShare(city: string, spot: Spot, t: number): void {
    this.shares.push({ city, place: spot.name, lat: spot.lat, lon: spot.lon, since: t, visits: 0 });
  }

  /** He reached `place` in `city`: a visit for the share he holds in it, but not for another place of the same name (a chain's other shop). */
  visited(city: string, place: Spot): void {
    const x = this.share(city);
    if (x && (x.lat === undefined || x.lon === undefined ? x.place === place.name : same({ name: x.place, lat: x.lat, lon: x.lon }, place))) x.visits++;
  }

  /** `h` hours of takings. */
  pass(h: number): void {
    this.pending += this.perH() * h;
  }

  /** Pays out the whole cents taken in so far, and a day's pay for each share; returns them. */
  payout(): number {
    let c = Math.floor(this.pending);
    this.pending -= c;
    for (const x of this.shares) {
      c += SHARE_BASE + SHARE_PER_VISIT * Math.min(x.visits, SHARE_VISITS_MAX);
      x.visits = 0;
    }
    this.earned += c;
    return c;
  }

  toJSON() {
    return { owned: this.owned, shares: this.shares, pending: this.pending, earned: this.earned };
  }

  /** Old saves own none; unknown kinds are dropped. */
  static fromJSON(d: unknown): Business {
    const out = new Business();
    const v = d as { owned?: unknown; shares?: unknown; pending?: unknown; earned?: unknown } | null;
    if (Array.isArray(v?.shares))
      out.shares = (v.shares as Share[]).filter((x) => x && typeof x.city === "string" && typeof x.place === "string").map((x) => ({ city: x.city, place: x.place, ...(Number.isFinite(x.lat) && Number.isFinite(x.lon) ? { lat: x.lat, lon: x.lon } : {}), since: Number(x.since) || 0, visits: Math.max(Number(x.visits) || 0, 0) }));
    if (Array.isArray(v?.owned)) out.owned = (v.owned as Owned[]).filter((o) => o && kindOf(o.id) && typeof o.city === "string").map((o) => ({ id: o.id, city: o.city, since: Number(o.since) || 0 }));
    out.pending = Math.max(Number(v?.pending) || 0, 0);
    out.earned = Math.max(Number(v?.earned) || 0, 0);
    return out;
  }
}

/** "coffee cart, newspaper kiosk and share in Cafe Rila", or "... and 3 shares in his spots". */
export function namesOf(owned: readonly Owned[], shares: readonly Share[] = []): string {
  const held = shares.length > 1 ? [`${shares.length} shares in his spots`] : shares.map((x) => `share in ${x.place}`);
  return list([...owned.map((o) => kindOf(o.id)!.name), ...held]);
}
