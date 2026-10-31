// His pet (Godville's hero pet): a stray from the incident deck, a dog or a
// cat that follows him, may stay for good. It gets a name, eats a little of
// his money each day, gives a steady mood lift while fed, and grows a level
// with the km it walks at his side; each level makes its perk a little
// bigger (a dog sniffs out coins, a cat keeps mishaps away). A pet high
// enough may show at a real old place that it was a fairy creature all
// along, which doubles its perk. After many months it grows old and passes,
// and a new stray can come.
import type { Rng } from "./rng";

export type PetKind = "dog" | "cat";

/** Chance a stray stays with him for good, when he has no pet. */
export const ADOPT_CHANCE = 0.3;
/** Cents of pet food he pays each day; unfed, the pet is grumpy and gives no mood lift that day. */
export const PET_FOOD = 300;
/** Mood a fed pet adds an hour, plus PET_MOOD_PER_LEVEL a level above 1. */
export const PET_MOOD_PER_H = 0.5;
export const PET_MOOD_PER_LEVEL = 0.05;
/** Level L takes PET_KM_PER_LEVEL x (1 + 2 + ... + L-1) km walked together, up to PET_MAX_LEVEL. */
export const PET_KM_PER_LEVEL = 10;
export const PET_MAX_LEVEL = 10;
/** A dog makes money on the street this much likelier per level; a cat makes mishaps this much rarer per level. */
export const DOG_FIND_PER_LEVEL = 0.05;
export const CAT_RISK_PER_LEVEL = 0.02;
/** From this level, at a real old place (see FAIRY_AT) it may show its fairy self, this often per stop; that doubles its perk. */
export const FAIRY_LEVEL = 8;
export const FAIRY_CHANCE = 0.1;
/** Place classes where the old folk live: castles (ruins too) and old monuments. */
export const FAIRY_AT = ["castle", "monument"];
/** How many days a pet lives with him, rolled when it stays. */
export const LIFE_DAYS: [number, number] = [240, 420];
/** After a pet passes he misses it: this much mood an hour for MISSING_MIN minutes. */
export const MISSING_MOOD_PER_H = -1;
export const MISSING_MIN = 24 * 60;

export const KINDS: Record<PetKind, { icon: string; perk: string; fairy: { name: string; icon: string; where: string } }> = {
  dog: { icon: "🐕", perk: "sniffs out money on the street", fairy: { name: "cù sìth", icon: "🐺", where: "its coat turned moss green and it howled three times" } },
  cat: { icon: "🐈", perk: "keeps mishaps away", fairy: { name: "cat sìth", icon: "🐈‍⬛", where: "a white star showed on its black chest and it spoke one word" } },
};
const NAMES: Record<PetKind, string[]> = {
  dog: ["Rex", "Bobi", "Luna", "Max", "Sharo", "Fido", "Bella", "Toby", "Kaya", "Bruno"],
  cat: ["Mitzi", "Tom", "Luna", "Pisu", "Felix", "Nala", "Simba", "Mochi", "Oscar", "Zara"],
};

export type Pet = {
  kind: PetKind;
  name: string;
  /** Km walked together. */
  km: number;
  /** Unix seconds it stayed, and the days it will live. */
  since: number;
  lives: number;
  /** The local day it was last fed (see gifts.ts dayOf). */
  fed: string;
  /** It showed its fairy self. */
  fairy: boolean;
};
/** A pet that passed: who, and from when to when (unix seconds). */
export type Remembered = { kind: PetKind; name: string; since: number; until: number; fairy: boolean };

/** The level a pet with `km` walked together is at. */
export function levelAt(km: number): number {
  let lvl = 1;
  while (lvl < PET_MAX_LEVEL && km >= (PET_KM_PER_LEVEL * lvl * (lvl + 1)) / 2) lvl++;
  return lvl;
}

/** Km walked together that level `lvl` takes. */
export const kmFor = (lvl: number) => (PET_KM_PER_LEVEL * lvl * (lvl - 1)) / 2;

export class Pets {
  pet: Pet | null = null;
  past: Remembered[] = [];

  /** A stray of `kind` stays with him at unix second `t`, fed for `day`. */
  adopt(kind: PetKind, t: number, day: string, rng: Rng): Pet {
    const name = rng.pick(NAMES[kind]);
    this.pet = { kind, name, km: 0, since: t, lives: rng.randiRange(LIFE_DAYS[0], LIFE_DAYS[1]), fed: day, fairy: false };
    return this.pet;
  }

  level(): number {
    return this.pet ? levelAt(this.pet.km) : 0;
  }

  /** "Rex the dog", or "Rex the cù sìth" once it showed its fairy self. */
  title(): string {
    const p = this.pet;
    return p ? `${p.name} the ${p.fairy ? KINDS[p.kind].fairy.name : p.kind}` : "";
  }

  /** Its icon beside him on the map, or "". */
  icon(): string {
    const p = this.pet;
    return p ? (p.fairy ? KINDS[p.kind].fairy.icon : KINDS[p.kind].icon) : "";
  }

  /** How much its perk counts: its level, doubled once it is a fairy creature. */
  private perk(kind: PetKind): number {
    const p = this.pet;
    return p?.kind === kind ? this.level() * (p.fairy ? 2 : 1) : 0;
  }

  /** Multiplies his chance to find money on the street. */
  findMult(): number {
    return 1 + DOG_FIND_PER_LEVEL * this.perk("dog");
  }

  /** Multiplies his mishap odds. */
  riskMult(): number {
    return 1 - CAT_RISK_PER_LEVEL * this.perk("cat");
  }

  /** Mood an hour it adds on `day`: only when it was fed that day. */
  moodPerH(day: string): number {
    return this.pet?.fed === day ? PET_MOOD_PER_H + PET_MOOD_PER_LEVEL * (this.level() - 1) : 0;
  }

  /** Walked `m` meters together; returns the new level when it went up, else 0. */
  walked(m: number): number {
    if (!this.pet) return 0;
    const was = this.level();
    this.pet.km += m / 1000;
    const now = this.level();
    return now > was ? now : 0;
  }

  /** True when at unix second `t` its days are over. */
  oldAt(t: number): boolean {
    return !!this.pet && t - this.pet.since >= this.pet.lives * 86400;
  }

  /** It passes at `t`; it is remembered. */
  pass(t: number): Remembered | null {
    const p = this.pet;
    if (!p) return null;
    const r = { kind: p.kind, name: p.name, since: p.since, until: t, fairy: p.fairy };
    this.past.push(r);
    this.pet = null;
    return r;
  }

  toJSON() {
    return { pet: this.pet, past: this.past };
  }

  /** Old saves have no pet. */
  static fromJSON(d?: Partial<Pets>): Pets {
    return Object.assign(new Pets(), d ?? {});
  }
}

/** True at a place where the old folk live (see FAIRY_AT); never at a made-up place. */
export const isFairyPlace = (p: { class: string; made?: unknown }) => !p.made && FAIRY_AT.includes(p.class);
