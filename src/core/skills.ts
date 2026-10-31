// Skills (The Sims' skills), apart from his four attributes: cooking,
// photography, music, chess, sport and art, each 0 to SKILL_MAX. An action
// with a `skill` trains it each time he does it, longer ones more; levels come slower
// the higher they get. A higher level makes its actions do more (and pay
// more), and some actions need a level (busking for a street concert needs
// music 4). Photography also makes his landmark cards shinier (see
// keepsakes.ts rollFinish). Pure; Stats owns one.

export const SKILLS = ["cooking", "photo", "music", "chess", "sport", "art"] as const;
export type Skill = (typeof SKILLS)[number];

/** Top level of a skill. */
export const SKILL_MAX = 10;
/** Steps from level n to n + 1 are SKILL_STEP x (n + 1), so level 4 takes 20 and level 10 takes 110. */
export const SKILL_STEP = 2;
/** An action trains a step for every this many minutes it is listed as (a 60-minute busk is two), at least one. */
export const PRACTICE_MIN = 30;
/** Each level makes its actions' gains (meters, attributes, XP) and pay this share bigger. */
export const SKILL_FX = 0.05;
/** Each photography level makes a landmark card's shiny (foil or gold) roll this share likelier. */
export const PHOTO_SHINE = 0.08;
/** Actions that train a skill weigh up to 1 + SKILL_LEAN at SKILL_MAX, so he leans to what he is good at. */
export const SKILL_LEAN = 1;

/** Skills the Stats sheet shows open, his best first; the rest fold away. */
export const SKILLS_SHOWN = 4;

/** Icon and name for each skill. */
export const SKILL: Record<Skill, [icon: string, name: string]> = {
  cooking: ["🧑‍🍳", "Cooking"],
  photo: ["📷", "Photography"],
  music: ["🎵", "Music"],
  chess: ["♟", "Chess"],
  sport: ["⚽", "Sport"],
  art: ["🎨", "Art"],
};

/** Steps done in all to reach `level`. */
export const stepsTo = (level: number) => (SKILL_STEP * level * (level + 1)) / 2;

/** The level `steps` reach, 0 to SKILL_MAX. */
export function levelOf(steps: number): number {
  let l = 0;
  while (l < SKILL_MAX && steps >= stepsTo(l + 1)) l++;
  return l;
}

export const isSkill = (k: string): k is Skill => (SKILLS as readonly string[]).includes(k);

export class Skills {
  /** Steps done in each skill. */
  steps: Record<Skill, number> = { cooking: 0, photo: 0, music: 0, chess: 0, sport: 0, art: 0 };

  level(s: Skill): number {
    return levelOf(this.steps[s]);
  }

  /** How much bigger an action of skill `s` makes its gains and pay: 1 + SKILL_FX a level. */
  mult(s: Skill): number {
    return 1 + SKILL_FX * this.level(s);
  }

  /** Practice in `s` for an action listed as `min` minutes long: a step per PRACTICE_MIN, at least one. Returns the feed line when it reaches a new level, or "". */
  train(s: Skill, min = PRACTICE_MIN): string {
    const was = this.level(s);
    this.steps[s] += Math.max(Math.ceil(min / PRACTICE_MIN), 1);
    const now = this.level(s);
    return now > was ? `${SKILL[s][0]} ${SKILL[s][1]} reached level ${now}` : "";
  }

  /** The share of the way to the next level, 1 at SKILL_MAX. */
  progress(s: Skill): number {
    const l = this.level(s);
    if (l >= SKILL_MAX) return 1;
    return (this.steps[s] - stepsTo(l)) / (stepsTo(l + 1) - stepsTo(l));
  }

  toJSON() {
    return { steps: this.steps };
  }

  /** Old saves have no skills: all at 0. */
  static fromJSON(d: unknown): Skills {
    const out = new Skills();
    const steps = (d as { steps?: Record<string, unknown> } | null)?.steps ?? {};
    for (const s of SKILLS) out.steps[s] = Math.max(Number(steps[s]) || 0, 0);
    return out;
  }
}
