// Lifetime rewards (The Sims 3): wishes that come true and levels he reaches
// give lifetime points, and he spends them himself on lasting perks. As soon
// as he can afford one he takes the one that suits him best: the perk of his
// best attribute among those he can pay for (one with no attribute counts his
// average), the cheaper on a tie. Pure; Stats asks what he owns.
import type { WantKind } from "./mind";

export type PerkId = "iron_stomach" | "bargain_eye" | "silver_tongue" | "lucky_streak" | "never_weary" | "quick_study";
type Attrs = Record<"str" | "cha" | "wit" | "luck", number>;
export type Perk = { id: PerkId; name: string; icon: string; cost: number; attr?: keyof Attrs; what: string };

/** Lifetime points for each kind of want that comes true, and for each level. */
export const WANT_POINTS: Record<WantKind, number> = { long: 3, short: 1, shake: 1, face: 3 };
export const LEVEL_POINTS = 2;
/** What the perks do. */
export const BARGAIN_CUT = 0.1;
export const SILVER_PAY = 0.1;
export const LUCKY_FIND = 2;
export const WEARY_CUT = 0.25;
export const STUDY_XP = 0.1;

export const PERKS: Perk[] = [
  { id: "iron_stomach", name: "Iron stomach", icon: "🍲", cost: 10, attr: "str", what: "no mishaps from food and drink" },
  { id: "bargain_eye", name: "Bargain eye", icon: "🔍", cost: 10, attr: "wit", what: `paid actions cost ${BARGAIN_CUT * 100}% less` },
  { id: "silver_tongue", name: "Silver tongue", icon: "🗣", cost: 15, attr: "cha", what: `jobs pay ${SILVER_PAY * 100}% more` },
  { id: "lucky_streak", name: "Lucky streak", icon: "🍀", cost: 15, attr: "luck", what: `finds money on the street ${LUCKY_FIND} times as often` },
  { id: "never_weary", name: "Never weary", icon: "🥾", cost: 20, what: `getting about tires him ${WEARY_CUT * 100}% less` },
  { id: "quick_study", name: "Quick study", icon: "📚", cost: 25, what: `${STUDY_XP * 100}% more XP from actions` },
];

export class Perks {
  points = 0;
  owned: PerkId[] = [];

  has(id: PerkId): boolean {
    return this.owned.includes(id);
  }

  /** The cheapest perk he doesn't have yet, if any. */
  next(): Perk | undefined {
    return PERKS.filter((p) => !this.has(p.id)).sort((a, b) => a.cost - b.cost)[0];
  }

  /** Adds `n` points, then buys every perk he can afford, best suited first; returns the feed lines. */
  earn(n: number, attrs: Attrs): string[] {
    this.points += n;
    const lines: string[] = [];
    const avg = (attrs.str + attrs.cha + attrs.wit + attrs.luck) / 4;
    for (;;) {
      const can = PERKS.filter((p) => !this.has(p.id) && p.cost <= this.points);
      if (!can.length) return lines;
      const suits = (p: Perk) => (p.attr ? attrs[p.attr] : avg);
      const best = can.reduce((a, b) => (suits(b) > suits(a) || (suits(b) === suits(a) && b.cost < a.cost) ? b : a));
      this.points -= best.cost;
      this.owned.push(best.id);
      lines.push(`🏆 Spent ${best.cost} lifetime points on ${best.name}: ${best.what}`);
    }
  }

  toJSON() {
    return { points: this.points, owned: this.owned };
  }

  static fromJSON(d?: Partial<ReturnType<Perks["toJSON"]>>): Perks {
    const p = new Perks();
    p.points = d?.points ?? 0;
    p.owned = (d?.owned ?? []).filter((id) => PERKS.some((x) => x.id === id));
    return p;
  }
}
