// Care packages, the one small thing the player can do for him. Opening the
// game after at least CLOVER_AWAY_S away earns a clover, at most
// CLOVERS_PER_DAY a day, and a missed day costs nothing. Clovers buy one gift
// at a time, which he opens at his next stop: a snack, or a boost for a few
// hours. All of it is optional: he never waits for a gift, and you never
// choose where he goes.
import type { Action, Fx, Stats } from "./stats";

/** Shortest time away that earns a clover on reopen. */
export const CLOVER_AWAY_S = 3600;
export const CLOVERS_PER_DAY = 3;
/** Clovers one check-in earns. */
export const CLOVERS_PER_CHECKIN = 1;

export type Gift = { id: string; icon: string; name: string; cost: number; fx?: Fx; buff?: NonNullable<Action["buff"]> };

export const GIFTS: Gift[] = [
  { id: "snack", icon: "🥪", name: "Snack", cost: 1, fx: { fullness: 30, thirst: 15 } },
  { id: "coffee", icon: "☕", name: "Coffee", cost: 1, fx: { energy: 25 } },
  { id: "umbrella", icon: "☂", name: "Umbrella", cost: 1, buff: { name: "Dry and cosy", min: 240, per_h: { mood: 3 } } },
  { id: "guide", icon: "📖", name: "City guide", cost: 2, buff: { name: "City guide", min: 240, attrs: { wit: 2 } } },
  { id: "clover", icon: "🍀", name: "Four-leaf clover", cost: 2, buff: { name: "Four-leaf clover", min: 240, attrs: { luck: 2 } } },
];

const NAMES: Record<string, string> = { health: "health", energy: "energy", fullness: "fullness", mood: "mood", hygiene: "hygiene", thirst: "thirst", str: "Strength", cha: "Charm", wit: "Wits", luck: "Luck", xp: "XP" };

/** What a gift does, in a few words: "+30 fullness, +15 thirst" or "+2 Wits for 4 h". */
export function effect(g: Gift): string {
  const parts = Object.entries(g.fx ?? {}).map(([k, v]) => `+${v} ${NAMES[k]}`);
  const b = g.buff;
  if (b) {
    const h = `${b.min / 60} h`;
    for (const [k, v] of Object.entries(b.per_h ?? {})) parts.push(`+${v} ${NAMES[k]} an hour for ${h}`);
    for (const [k, v] of Object.entries(b.attrs ?? {})) parts.push(`+${v} ${NAMES[k]} for ${h}`);
  }
  return parts.join(", ");
}

/** The local date of unix ms, "2026-10-30": clovers count per day. */
export function dayOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export class Care {
  clovers = 0;
  /** The day `today` counts for. */
  day = "";
  /** Clovers earned on `day`. */
  today = 0;
  /** The gift on its way to him, by id; "" when none. */
  parcel = "";

  /** Earned today, counting a new day as none yet. */
  earnedOn(day: string): number {
    return day === this.day ? this.today : 0;
  }

  /** A reopen on `day` after `awayS` away: a clover unless it was too short or today's are used up. Returns true when earned. */
  checkIn(awayS: number, day: string): boolean {
    if (awayS < CLOVER_AWAY_S || this.earnedOn(day) >= CLOVERS_PER_DAY) return false;
    this.today = this.earnedOn(day) + CLOVERS_PER_CHECKIN;
    this.day = day;
    this.clovers += CLOVERS_PER_CHECKIN;
    return true;
  }

  /** Why `gift` can't be sent now, or "". */
  whyNot(gift: Gift): string {
    if (this.parcel) return "One is already on its way";
    if (this.clovers < gift.cost) return `Needs ${gift.cost} clovers`;
    return "";
  }

  /** Pays for `id` and sends it; returns false when it can't go. */
  send(id: string): boolean {
    const gift = GIFTS.find((g) => g.id === id);
    if (!gift || this.whyNot(gift)) return false;
    this.clovers -= gift.cost;
    this.parcel = id;
    return true;
  }

  /** The gift on its way, if any. */
  pending(): Gift | null {
    return GIFTS.find((g) => g.id === this.parcel) ?? null;
  }

  /** At a stop: he opens the parcel, if there is one. Returns the feed line, or "". */
  open(stats: Stats): string {
    const gift = this.pending();
    this.parcel = "";
    if (!gift) return "";
    stats.applyFx(gift.fx ?? {});
    if (gift.buff) stats.addBuff(gift.buff);
    return stats.say(`Opened your care package: ${gift.icon} ${gift.name}! Thank you! (${effect(gift)})`);
  }

  toJSON() {
    return { clovers: this.clovers, day: this.day, today: this.today, parcel: this.parcel };
  }

  static fromJSON(d: Partial<ReturnType<Care["toJSON"]>> | undefined): Care {
    return Object.assign(new Care(), d ?? {});
  }
}
