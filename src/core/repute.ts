// His good or bad name and the law. Karma is his lean in bond.ts (kind to
// rascal, -100 to +100); fame is fame.ts. This file holds what they do:
// kind walkers get discounts, gifts and free rides, rascals sell loot at
// fence prices but pay more. Crimes raise one police heat that follows him
// everywhere (GTA's wanted stars, Red Dead's bounty), the more so the better
// people know his face. Heat fades by itself; he can pay it off at a police
// station. Wanted, he may be spotted at a stop and chased: he gives up,
// runs, hides or bribes the officer, and if caught he pays a fine, or short
// of money sits in jail, and loses what he stole. All of it runs by itself.
import type { Moment } from "./moments";
import type { Fx } from "./stats";

/** Heat runs from 0 to HEAT_MAX; each STAR_HEAT of it is a wanted star. */
export const HEAT_MAX = 100;
export const STAR_HEAT = 20;
export const STARS_MAX = HEAT_MAX / STAR_HEAT;
/** Heat a crime adds per point of karma it costs, times 1 + FAME_HEAT a fame tier of the city (they know his face). */
export const HEAT_PER_KARMA = 1;
export const FAME_HEAT = 0.5;
/** Heat lost per hour of his time. */
export const HEAT_FADE_PER_H = 2;
/** Chance per stop, a wanted star, that the police spot him, times 1 + FAME_SPOT a fame tier of all his fame. */
export const SPOT_PER_STAR = 0.03;
export const FAME_SPOT = 0.25;
/** A chase on the map lasts this many real seconds before it ends. */
export const CHASE_S = 40;
/** Cents of the fine per point of heat; paying off at a police station costs PAYOFF_SHARE of it. */
export const FINE_PER_HEAT = 150;
export const PAYOFF_SHARE = 0.75;
/** He pays off at a police station with this many stars or more, if he can spare it. */
export const PAYOFF_STARS = 2;
/** Jail when he can't pay: this many minutes per star (at least one). */
export const JAIL_MIN_PER_STAR = 60;
/** A bribe costs this many cents per point of heat, clears it if taken, and costs this much karma. */
export const BRIBE_PER_HEAT = 60;
export const BRIBE_KARMA = 5;
/** Odds a run, a hide or a bribe works: a base plus a share per point of the attribute that helps, never above ESCAPE_CAP. */
export const RUN_BASE = 0.3;
export const HIDE_BASE = 0.3;
export const BRIBE_BASE = 0.4;
export const PER_POINT = 0.05;
export const ESCAPE_CAP = 0.85;
/** Getting away makes them want him more. */
export const ESCAPE_HEAT = 5;
/** Karma from giving himself up. */
export const SURRENDER_KARMA = 2;
/** Shoplifting: what it costs in karma. */
export const STEAL_KARMA = 5;

/** A kind walker gets this off in shops on top of his fame's discount; a rascal pays RASCAL_MARKUP more and gets no fame discount. */
export const KIND_DISCOUNT = 0.05;
export const RASCAL_MARKUP = 0.1;
/** A kind walker on a bus or train: chance the driver or conductor waves him on for free. */
export const FREE_RIDE_CHANCE = 0.1;
/** A kind walker at a stop: chance, times 1 + his fame tier there, a local gives him something. */
export const GIFT_CHANCE = 0.02;
/** What a local may give a kind walker; {PLACE} is where. */
export const GIFTS: readonly { say: string; cents?: number; fx?: Fx }[] = [
  { say: "A baker at {PLACE} pressed a warm bun into his hand, for being so kind", fx: { fullness: 15, mood: 5 } },
  { say: "An old lady at {PLACE} thanked him for his good deeds and slipped him a coin", cents: 500 },
  { say: "Someone at {PLACE} who'd heard of him bought him a coffee", fx: { energy: 10, thirst: 10, mood: 5 } },
  { say: "A kid at {PLACE} gave him a drawing of himself with a halo", fx: { mood: 15 } },
];
/** Karma at or past which he shows a halo or horns. */
export const AURA_AT = 70;

export type Pick = "surrender" | "run" | "hide" | "bribe";

/** What a chase needs to know about him. */
export type Him = { heat: number; cents: number; str: number; wit: number; luck: number; cha: number; energy: number };

export const starsOf = (heat: number) => Math.floor(Math.max(heat, 0) / STAR_HEAT);
export const fineOf = (heat: number) => Math.round(heat * FINE_PER_HEAT);
export const payoffOf = (heat: number) => Math.round(fineOf(heat) * PAYOFF_SHARE);
export const bribeOf = (heat: number) => Math.round(heat * BRIBE_PER_HEAT);

/** Heat a crime costing `karma` adds where he is fame tier `tier`. */
export const crimeHeat = (karma: number, tier: number) => Math.abs(karma) * HEAT_PER_KARMA * (1 + FAME_HEAT * tier);

/** Chance at a stop that the police spot him, with all his fame at tier `tier`. */
export const spotChance = (heat: number, tier: number) => starsOf(heat) * SPOT_PER_STAR * (1 + FAME_SPOT * tier);

/** The odds `pick` gets him away (a bribe taken counts as away). */
export function escapeOdds(pick: Pick, h: Him): number {
  const cap = (v: number) => Math.min(v, ESCAPE_CAP);
  if (pick === "run") return cap(RUN_BASE + PER_POINT * (h.str - 1) + (h.energy - 50) / 500);
  if (pick === "hide") return cap(HIDE_BASE + PER_POINT * (h.wit - 1) + (PER_POINT / 2) * (h.luck - 1));
  if (pick === "bribe") return h.cents >= bribeOf(h.heat) ? cap(BRIBE_BASE + PER_POINT * (h.cha - 1)) : 0;
  return 0;
}

/** A rascal's own pick: the way out with the best odds. */
export function bestWayOut(h: Him): Pick {
  let best: Pick = "run";
  for (const p of ["hide", "bribe"] as const) if (escapeOdds(p, h) > escapeOdds(best, h)) best = p;
  return best;
}

/** The chase as a timed moment: a kind walker gives up by himself, a rascal takes his best way out (see moments.ts defaultPick). */
export function chaseMoment(h: Him): Moment {
  const options = [
    { id: "surrender", label: "🙌 Give up" },
    { id: "run", label: "🏃 Run" },
    { id: "hide", label: "🫣 Hide" },
  ];
  if (h.cents >= bribeOf(h.heat)) options.push({ id: "bribe", label: "💶 Bribe" });
  return { id: "police_chase", icon: "🚓", ask: "The police are after him!", options, default: "surrender", rascal: bestWayOut(h) };
}

/** What happened in a chase: away, or caught with a fine paid or jail minutes to sit. */
export type Chase = { pick: Pick; away: boolean; fine: number; jailMin: number };

/** The police after him; one record of it all for Help, the Stats sheet and the Collection. */
export class Law {
  heat = 0;
  /** The most stars he ever had, and karma's best and worst. */
  topStars = 0;
  bestKarma = 0;
  worstKarma = 0;
  chases = 0;
  escapes = 0;
  caught = 0;
  jailed = 0;
  bribes = 0;
  payoffs = 0;
  /** Cents paid in fines and pay-offs. */
  paid = 0;

  stars(): number {
    return starsOf(this.heat);
  }

  /** Adds `n` heat, and notes his top stars. */
  addHeat(n: number): void {
    this.heat = Math.min(Math.max(this.heat + n, 0), HEAT_MAX);
    this.topStars = Math.max(this.topStars, this.stars());
  }

  /** Notes his karma, for its best and worst. */
  karma(lean: number): void {
    this.bestKarma = Math.max(this.bestKarma, lean);
    this.worstKarma = Math.min(this.worstKarma, lean);
  }

  pass(minutes: number): void {
    if (this.heat > 0) this.heat = Math.max(this.heat - (HEAT_FADE_PER_H * minutes) / 60, 0);
  }

  /** How the chase ends for `pick` and dice `r` in [0, 1); the caller moves money, karma and items. */
  chase(pick: Pick, h: Him, r: number): Chase {
    this.chases++;
    const away = r < escapeOdds(pick, h);
    if (away) {
      if (pick === "bribe") {
        this.bribes++;
        this.heat = 0;
      } else {
        this.escapes++;
        this.addHeat(ESCAPE_HEAT);
      }
      return { pick, away, fine: 0, jailMin: 0 };
    }
    this.caught++;
    const fine = fineOf(this.heat);
    const jailMin = h.cents >= fine ? 0 : Math.max(this.stars(), 1) * JAIL_MIN_PER_STAR;
    if (jailMin) this.jailed++;
    else this.paid += fine;
    this.heat = 0;
    return { pick, away, fine: jailMin ? 0 : fine, jailMin };
  }

  /** Pays the heat off at a police station: what it cost. */
  payOff(): number {
    const n = payoffOf(this.heat);
    this.paid += n;
    this.payoffs++;
    this.heat = 0;
    return n;
  }

  toJSON() {
    return { ...this };
  }

  /** Old saves have no law: nobody is after him. */
  static fromJSON(d?: Partial<ReturnType<Law["toJSON"]>>): Law {
    return Object.assign(new Law(), d ?? {});
  }
}
