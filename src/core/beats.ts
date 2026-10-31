// Little moments between the bigger ones: once his History has been quiet
// for a random BEAT_MIN_S to BEAT_MAX_S seconds of play, a beat from the deck
// (data/beats.json) happens: something on the street, on board, at the place
// he stays at, a thought, or a word about a place he walks past. Each shows
// as a speech bubble over him and a History line, with a small nudge to his
// meters. Pure: the game says what he is doing, applies and says the line.
import { fill } from "./diary";
import { effect } from "./gifts";
import type { Rng } from "./rng";
import { isCold, isHot, isSunny, isWet, type Sky } from "./sky";
import type { Fx, Meter } from "./stats";

/** Seconds of quiet before a beat: random in between, so it never ticks like a clock. */
export const BEAT_MIN_S = 40;
export const BEAT_MAX_S = 80;
/** The last this many beats aren't dealt again while others fit. */
export const RECENT = 60;
/** Below this a meter brings its thoughts. */
export const LOW_AT = 30;
/** A place this close that isn't his goal may get a word, this share of the time he walks. */
export const NEAR_M = 60;
export const COMMENT_SHARE = 0.25;
/** Seconds his speech bubble shows. */
export const SAY_S = 6;

export type At = "walk" | "ride" | "rest" | "any";
export type SkyGate = "wet" | "snow" | "sunny" | "hot" | "cold" | "night" | "day";
/** One beat: `text` is the History line ({CITY}, {STREET}, {PLACE}), `say` his words in the bubble. `modes` limits a ride beat to ways of travel (a trip mode, or taxi and metro across town). */
export type Beat = { id: string; icon: string; at: At; text: string; say: string; fx?: Fx; modes?: string[]; sky?: SkyGate; low?: Meter };
/** A word about a place he walks past ({NEAR}). */
export type Comment = { id: string; text: string; say: string };
export type Deck = { beats: Beat[]; comments: Comment[] };

/** What he is doing now. `mode` is his way of travel on a ride; `near` a named place he walks past. */
export type Now = { at: Exclude<At, "any">; mode?: string; sky: Sky | null; meters: Record<Meter, number>; city: string; street: string; place: string; near: { name: string; icon: string } | null };
/** A beat that happened: the History line (fx included) and his words. */
export type Said = { id: string; line: string; say: string; fx: Fx };

const skyOk = (g: SkyGate, sky: Sky | null): boolean =>
  g === "wet" ? isWet(sky) : g === "snow" ? sky?.weather?.kind === "snow" : g === "sunny" ? isSunny(sky) : g === "hot" ? isHot(sky) : g === "cold" ? isCold(sky) : g === "night" ? !!sky && sky.dark >= 0.5 : !!sky && sky.dark < 0.5;

/** True when `b` fits what he is doing now. */
export function fits(b: Beat, now: Now): boolean {
  if (b.at !== "any" && b.at !== now.at) return false;
  if (b.modes && !b.modes.includes(now.mode ?? "")) return false;
  if (b.sky && !skyOk(b.sky, now.sky)) return false;
  if (b.low && now.meters[b.low] >= LOW_AT) return false;
  const words = `${b.text} ${b.say}`;
  if (words.includes("{STREET}") && !now.street) return false;
  return !(words.includes("{PLACE}") && !now.place);
}

export class Beats {
  /** Seconds of quiet left before the next beat. */
  leftS = BEAT_MAX_S;
  /** Ids of every beat he has had (the Collection counts them). */
  seen = new Set<string>();
  /** Ids of the last RECENT beats, newest last. */
  recent: string[] = [];

  /** Something went in his History: the next beat waits a new quiet spell. */
  heard(rng: Rng): void {
    this.leftS = rng.randfRange(BEAT_MIN_S, BEAT_MAX_S);
  }

  /** Lets `dt` seconds of play pass; true when a beat is due. */
  tick(dt: number): boolean {
    this.leftS -= dt;
    return this.leftS <= 0;
  }

  /** Deals a beat that fits `now` (beats he hasn't had lately first, the most specific weighing more), or null when none does. */
  deal(deck: Deck, now: Now, rng: Rng): Said | null {
    const vars = { CITY: now.city.split(",")[0]!, STREET: now.street, PLACE: now.place };
    if (now.near && now.at === "walk" && deck.comments.length && rng.randf() < COMMENT_SHARE) {
      const c = this.pickFresh(deck.comments, () => 1, rng)!;
      return this.said(c.id, `${now.near.icon} ${fill(c.text, { ...vars, NEAR: now.near.name })}`, fill(c.say, { ...vars, NEAR: now.near.name }), {});
    }
    const fit = deck.beats.filter((b) => fits(b, now));
    // A beat for this very moment (a mode, the sky, a low meter) weighs more than one for anywhere.
    const b = this.pickFresh(fit, (x) => 1 + 2 * (Number(!!x.modes) + Number(!!x.sky) + Number(!!x.low)), rng);
    if (!b) return null;
    const fx = b.fx ?? {};
    const parts = effect({ fx });
    return this.said(b.id, `${b.icon} ${fill(b.text, vars)}${parts ? ` (${parts})` : ""}`, fill(b.say, vars), fx);
  }

  private pickFresh<T extends { id: string }>(list: T[], weight: (x: T) => number, rng: Rng): T | null {
    const fresh = list.filter((x) => !this.recent.includes(x.id));
    const pool = fresh.length ? fresh : list;
    let r = rng.randf() * pool.reduce((s, x) => s + weight(x), 0);
    for (const x of pool) if ((r -= weight(x)) < 0) return x;
    return pool.at(-1) ?? null;
  }

  private said(id: string, line: string, say: string, fx: Fx): Said {
    this.seen.add(id);
    this.recent = [...this.recent.filter((x) => x !== id), id].slice(-RECENT);
    return { id, line, say, fx };
  }

  toJSON() {
    return { seen: [...this.seen], recent: this.recent };
  }

  static fromJSON(d: Partial<ReturnType<Beats["toJSON"]>> | undefined): Beats {
    const b = new Beats();
    b.seen = new Set(d?.seen ?? []);
    b.recent = d?.recent ?? [];
    return b;
  }
}
