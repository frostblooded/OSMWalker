// The storyteller (RimWorld's AI storytellers): a tension number that rises
// while his life is calm, faster the richer he is, and paces the incidents
// that happen to him. Above FIRE_AT each stop may bring one, likelier the
// higher the tension; a bad one sets it back to zero and starts a lucky
// stretch with only good or odd ones. It remembers the last few incidents so
// they don't come round again too soon. Calm, Classic or Chaotic sets how
// fast it rises and how often an incident is bad. Pure; Stats owns one.
import type { Rng } from "./rng";

export const STYLES = ["calm", "classic", "chaotic"] as const;
export type Style = (typeof STYLES)[number];
export type Tone = "good" | "bad" | "odd";

/** How each storyteller paces: tension per hour of calm, and the share of incidents that are bad. */
export const STYLE: Record<Style, { icon: string; name: string; per_h: number; bad: number }> = {
  calm: { icon: "🌤", name: "Calm", per_h: 8, bad: 0.25 },
  classic: { icon: "📖", name: "Classic", per_h: 15, bad: 0.45 },
  chaotic: { icon: "🌪", name: "Chaotic", per_h: 30, bad: 0.65 },
};
export const DEFAULT_STYLE: Style = "classic";
export const TENSION_MAX = 100;
/** Below this tension no incident happens. */
export const FIRE_AT = 30;
/** Chance per stop at full tension; it grows in a straight line from 0 at FIRE_AT. */
export const FIRE_MAX = 0.5;
/** Extra tension per hour for each WEALTH_STEP cents he has, up to WEALTH_CAP an hour. */
export const WEALTH_STEP = 50000;
export const WEALTH_CAP = 5;
/** Hours after a bad incident with only good or odd ones. */
export const LUCKY_H = 6;
/** Share of the tension a good or odd incident leaves (a bad one leaves none). */
export const KEEP_AFTER_GOOD = 0.5;
/** The last this many incidents aren't dealt again while others fit. */
export const RECENT = 12;

export class Storyteller {
  style: Style = DEFAULT_STYLE;
  tension = 0;
  /** Minutes of the lucky stretch left. */
  luckyMin = 0;
  /** Ids of the last RECENT incidents, newest last. */
  recent: string[] = [];

  /** Lets `minutes` of his life pass with `cents` in his pocket. */
  pass(minutes: number, cents: number): void {
    const wealth = Math.min(Math.floor(Math.max(cents, 0) / WEALTH_STEP), WEALTH_CAP);
    this.tension = Math.min(this.tension + ((STYLE[this.style].per_h + wealth) * minutes) / 60, TENSION_MAX);
    this.luckyMin = Math.max(this.luckyMin - minutes, 0);
  }

  /** The chance that this stop brings an incident. */
  chance(): number {
    return Math.max(this.tension - FIRE_AT, 0) / (TENSION_MAX - FIRE_AT) * FIRE_MAX;
  }

  /** The tone of the incident this stop brings, or null for none; `badMult` (his Luck) makes bad ones rarer. */
  roll(rng: Rng, badMult = 1): Tone | null {
    if (rng.randf() >= this.chance()) return null;
    if (this.luckyMin <= 0 && rng.randf() < STYLE[this.style].bad * badMult) return "bad";
    return rng.randf() < 0.5 ? "good" : "odd";
  }

  /** After incident `id` of `tone`: a bad one empties the tension and starts a lucky stretch. */
  after(id: string, tone: Tone): void {
    this.recent = [...this.recent.filter((r) => r !== id), id].slice(-RECENT);
    if (tone === "bad") {
      this.tension = 0;
      this.luckyMin = LUCKY_H * 60;
    } else this.tension *= KEEP_AFTER_GOOD;
  }

  toJSON() {
    return { style: this.style, tension: this.tension, luckyMin: this.luckyMin, recent: this.recent };
  }

  static fromJSON(d: unknown): Storyteller {
    const s = new Storyteller();
    if (!d || typeof d !== "object") return s;
    const o = d as Record<string, unknown>;
    if (STYLES.includes(o.style as Style)) s.style = o.style as Style;
    s.tension = Math.min(Math.max(Number(o.tension) || 0, 0), TENSION_MAX);
    s.luckyMin = Math.max(Number(o.luckyMin) || 0, 0);
    if (Array.isArray(o.recent)) s.recent = o.recent.filter((r): r is string => typeof r === "string").slice(-RECENT);
    return s;
  }
}
