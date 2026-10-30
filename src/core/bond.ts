// His bond with you, the unseen friend (Godville's hero and god): how much he
// trusts you, which way he leans (kind or rascal), and the whispers you may
// send him. Trust grows when you check in and send care packages, fades a
// little when you stay away, and never drops sharply. Now and then he writes
// to you in his History. Whispers and praise or scold are optional taps: he
// lives the same without them, and may ignore a whisper.
import type { Rng } from "./rng";

/** Trust runs from 0 to TRUST_MAX. */
export const TRUST_MAX = 100;
export const TRUST_START = 20;
/** Trust a check-in that earned a clover adds, and an opened care package. */
export const TRUST_PER_CHECKIN = 4;
export const TRUST_PER_GIFT = 6;
/** Trust lost per whole day away after the first, but never more than TRUST_FADE_MAX in one go. */
export const TRUST_FADE_PER_DAY = 2;
export const TRUST_FADE_MAX = 6;
/** He writes to you each time trust crosses one of these. */
export const LETTER_AT = [30, 50, 70, 90] as const;
/** Chance he writes a thank-you letter after opening a care package. */
export const THANKS_CHANCE = 1 / 3;

export const WHISPERS = ["eat", "rest", "explore", "save"] as const;
export type Whisper = (typeof WHISPERS)[number];
export const WHISPERS_PER_DAY = 3;
/** He heeds a whisper with HEED_MIN, plus HEED_PER_TRUST a point of trust. */
export const HEED_MIN = 0.3;
export const HEED_PER_TRUST = 0.006;
/** A heeded whisper lasts this many game minutes. */
export const NUDGE_MIN = 120;

/** Lean runs from -LEAN_MAX (rascal) to +LEAN_MAX (kind); past LEAN_AT either way it shows. */
export const LEAN_MAX = 100;
export const LEAN_AT = 30;
/** What praise or scold moves it, and what one of his own kind or rascal deeds does. */
export const JUDGE_STEP = 10;
export const DEED_STEP = 2;
/** A rascal's sales pay this much more; on a bus he may dodge the fare, and be fined double if caught. */
export const RASCAL_SELL = 1.15;
export const DODGE_CHANCE = 0.25;
export const CAUGHT_CHANCE = 0.3;
export const FINE_MULT = 2;
/** A kind walker's kind deeds weigh this much more when he picks what to do. */
export const KIND_DEED_WEIGHT = 2;

export type Lean = "kind" | "rascal" | "";

/** Letters from data/letters.json: one list per trust step, and a thank-you per gift id. */
export type Letters = { tiers: string[][]; thanks: Record<string, string> };

/** How his letters to you and your whispers start in his History, so lines about his own deeds can be told apart (see isNote). */
export const LETTER_MARK = "✉";
export const WHISPER_HEARD = "Heard a whisper";

/** His History line for your whisper `word`, heeded or not. */
export function whisperLine(word: Whisper, heeded: boolean): string {
  const w = word[0]!.toUpperCase() + word.slice(1);
  return `${WHISPER_HEARD}: "${w}". ${heeded ? "He nods and does just that for a while" : "He shrugs it off"}`;
}

/** True for a History line that is a letter to you or a whisper from you, not one of his deeds. */
export const isNote = (text: string) => text.startsWith(LETTER_MARK) || text.startsWith(WHISPER_HEARD);

const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);

export class Bond {
  trust = TRUST_START;
  lean = 0;
  /** The day `whispered` counts for, and whispers sent that day. */
  day = "";
  whispered = 0;
  /** The whisper he is following, and game minutes left. */
  nudge: Whisper | "" = "";
  nudgeLeft = 0;
  /** Unix seconds of the last check-in, for fading. */
  seen = 0;
  /** The time of the last line you praised or scolded, so each line counts once. */
  judged = 0;

  leaning(): Lean {
    return this.lean >= LEAN_AT ? "kind" : this.lean <= -LEAN_AT ? "rascal" : "";
  }

  whispersLeft(day: string): number {
    return WHISPERS_PER_DAY - (day === this.day ? this.whispered : 0);
  }

  /** Adds `n` trust; returns the letter step crossed going up, or -1. */
  addTrust(n: number): number {
    const before = this.trust;
    this.trust = clamp(this.trust + n, 0, TRUST_MAX);
    return LETTER_AT.findLastIndex((at) => before < at && this.trust >= at);
  }

  /** A reopen at unix seconds `t`: trust fades for whole days away after the first, then a clover check-in adds some. Returns the letter step crossed, or -1. */
  checkIn(t: number, earned: boolean): number {
    if (this.seen) {
      const days = Math.floor((t - this.seen) / 86400);
      if (days > 1) this.trust = Math.max(this.trust - Math.min(TRUST_FADE_PER_DAY * (days - 1), TRUST_FADE_MAX), 0);
    }
    this.seen = t;
    return earned ? this.addTrust(TRUST_PER_CHECKIN) : -1;
  }

  /** You whisper `word` on `day`; he heeds it (true) by his trust, or shrugs it off. Null when today's whispers are used up. */
  whisper(word: Whisper, day: string, rng: Rng): boolean | null {
    if (this.whispersLeft(day) <= 0) return null;
    this.whispered = (day === this.day ? this.whispered : 0) + 1;
    this.day = day;
    if (rng.randf() >= HEED_MIN + HEED_PER_TRUST * this.trust) return false;
    this.nudge = word;
    this.nudgeLeft = NUDGE_MIN;
    return true;
  }

  /** Lets game minutes pass for the whisper he follows. */
  pass(minutes: number): void {
    if (!this.nudge) return;
    this.nudgeLeft -= minutes;
    if (this.nudgeLeft <= 0) [this.nudge, this.nudgeLeft] = ["", 0];
  }

  /** You praise (+1) or scold (-1) the line said at `t`; false if that line was already judged. */
  judge(sign: 1 | -1, t: number): boolean {
    if (t <= this.judged) return false;
    this.judged = t;
    this.lean = clamp(this.lean + sign * JUDGE_STEP, -LEAN_MAX, LEAN_MAX);
    return true;
  }

  /** One of his own deeds: +1 kind, -1 rascal. */
  deed(sign: number): void {
    this.lean = clamp(this.lean + Math.sign(sign) * DEED_STEP, -LEAN_MAX, LEAN_MAX);
  }

  toJSON() {
    return { trust: this.trust, lean: this.lean, day: this.day, whispered: this.whispered, nudge: this.nudge, nudgeLeft: this.nudgeLeft, seen: this.seen, judged: this.judged };
  }

  /** Old saves have no bond: he starts at TRUST_START and leans neither way. */
  static fromJSON(d?: Partial<ReturnType<Bond["toJSON"]>>): Bond {
    return Object.assign(new Bond(), d ?? {});
  }
}

/** The line he writes on crossing letter step `step`, picked with `r` in [0, 1); "" with no letters loaded. */
export function letter(letters: Letters | null, step: number, r: number): string {
  const list = letters?.tiers[step] ?? [];
  return list.length ? `${LETTER_MARK} ${list[Math.floor(r * list.length)]}` : "";
}
