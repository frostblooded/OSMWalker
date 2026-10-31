// His beliefs (RimWorld's ideoligion, kept small): now and then something
// he does at a place takes root as a belief, such as finding faith at a
// church or swearing by fresh air in a park. He holds at most MAX_BELIEFS.
// A belief pulls his goal to its kinds of place, weighs up the actions it
// favours, and cheers him when he lives by it. Unlike a quirk it comes
// from one moment, not a count, and it fades when he hasn't lived by it
// for FADE_DAYS; a faded belief may come back. Pure; Stats owns one.
import type { Rng } from "./rng";

export const MAX_BELIEFS = 2;
/** Chance per thing he does at one of a belief's `seeds` that it takes root. */
export const BELIEF_CHANCE = 0.03;
export const BELIEF_PULL = 1.3;
export const BELIEF_LEAN = 1.3;
/** Its moodlet when he lives by it: mood an hour, hours. */
export const BELIEF_MOOD: readonly [number, number] = [1, 1];
export const FADE_DAYS = 10;

/** What an action looks like to a belief. */
export type Deed = { earn?: unknown; cost?: number; fx?: { wit?: number }; item?: unknown; midnight?: boolean; bounty?: boolean; steal?: boolean; risk?: { cost?: number } };
/** A belief: where it takes root (`seeds`), the places it pulls him to (`kinds`), the actions it favours (`favours`), and its moodlet. */
export type Belief = { id: string; name: string; icon: string; what: string; seeds: string[]; kinds: string[]; favours?: (d: Deed) => boolean; /** `favours` in words, for Help. */ likes?: string; treat: string };

export const BELIEFS: Belief[] = [
  { id: "faith", name: "Faith", icon: "🙏", what: "has found faith", seeds: ["place_of_worship"], kinds: ["place_of_worship"], treat: "At peace" },
  { id: "fresh_air", name: "Fresh air", icon: "🌿", what: "swears by fresh air", seeds: ["park", "garden"], kinds: ["park", "garden", "picnic_site"], treat: "A lungful of air" },
  { id: "hard_work", name: "Hard work", icon: "💼", what: "believes in hard work", seeds: ["office", "college"], kinds: [], favours: (d) => d.earn !== undefined, likes: "paid work", treat: "An honest day's work" },
  { id: "thrift", name: "Thrift", icon: "🪙", what: "believes in thrift", seeds: ["shop"], kinds: [], favours: (d) => !d.cost && !d.risk?.cost && !d.item && !d.midnight && !d.bounty && !d.steal, likes: "what is free", treat: "Money well kept" },
  { id: "knowledge", name: "Knowledge", icon: "📚", what: "believes knowledge is power", seeds: ["library", "museum"], kinds: ["library", "museum"], favours: (d) => (d.fx?.wit ?? 0) > 0, likes: "what trains Wits", treat: "Something learned" },
  { id: "carpe_diem", name: "Carpe diem", icon: "🎉", what: "lives for the moment", seeds: ["bar", "theme_park"], kinds: ["bar", "theme_park", "water_park"], treat: "Seized the day" },
  { id: "old_magic", name: "The old magic", icon: "✨", what: "believes in the old magic", seeds: ["castle", "monument"], kinds: ["castle", "monument", "memorial"], treat: "Felt the old magic" },
];

export const belief = (id: string) => BELIEFS.find((b) => b.id === id);
/** True when `b` is lived by doing `deed` at a place of map class `kind`. */
const livedBy = (b: Belief, kind: string, deed: Deed) => b.kinds.includes(kind) || !!b.favours?.(deed);

export class Beliefs {
  /** The beliefs he holds, by id, with when he last lived by each (unix s). */
  held: Record<string, number> = {};
  /** Every belief he has ever held, by id, for the Collection. */
  ever: string[] = [];

  has(id: string): boolean {
    return id in this.held;
  }

  /**
   * He did `deed` at a place of map class `kind` (`where`, its name) at `t`:
   * the beliefs he lives by there (for their moodlet), and a new one that
   * takes root on `dice`, if any, with its feed line.
   */
  did(kind: string, deed: Deed, where: string, t: number, dice: () => Rng): { lived: Belief[]; line: string } {
    const lived: Belief[] = [];
    for (const id of Object.keys(this.held)) {
      const b = belief(id);
      if (b && livedBy(b, kind, deed)) {
        this.held[id] = t;
        lived.push(b);
      }
    }
    let line = "";
    const seeds = BELIEFS.filter((b) => b.seeds.includes(kind) && !this.has(b.id));
    if (seeds.length && Object.keys(this.held).length < MAX_BELIEFS) {
      const rng = dice();
      if (rng.randf() < BELIEF_CHANCE) {
        const b = rng.pick(seeds);
        this.held[b.id] = t;
        if (!this.ever.includes(b.id)) this.ever.push(b.id);
        line = `${b.icon} At ${where} he ${b.what}`;
      }
    }
    return { lived, line };
  }

  /** A new day at `t`: beliefs he hasn't lived by for FADE_DAYS fade; returns their feed lines. */
  day(t: number): string[] {
    const out: string[] = [];
    for (const [id, last] of Object.entries(this.held)) {
      if (t - last < FADE_DAYS * 86400) continue;
      delete this.held[id];
      const b = belief(id);
      if (b) out.push(`${b.icon} His belief in ${b.name.toLowerCase()} has faded`);
    }
    return out;
  }

  /** How hard a place of map class `kind` pulls him: BELIEF_PULL for each belief it is a kind of. */
  pull(kind: string): number {
    let w = 1;
    for (const id of Object.keys(this.held)) if (belief(id)?.kinds.includes(kind)) w *= BELIEF_PULL;
    return w;
  }

  /** How his beliefs weigh `deed`: BELIEF_LEAN for each that favours it. */
  lean(deed: Deed): number {
    let w = 1;
    for (const id of Object.keys(this.held)) if (belief(id)?.favours?.(deed)) w *= BELIEF_LEAN;
    return w;
  }

  toJSON() {
    return { held: this.held, ever: this.ever };
  }

  /** A save from before beliefs: none held yet. */
  static fromJSON(d?: Partial<ReturnType<Beliefs["toJSON"]>>): Beliefs {
    const b = new Beliefs();
    b.held = { ...(d?.held ?? {}) };
    b.ever = [...(d?.ever ?? [])];
    return b;
  }
}
