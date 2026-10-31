// His life stages and his family. He grows from backpacker to settled,
// veteran and elder, STAGE_DAYS of real time each (open or closed alike).
// How well he was kept in a stage (faints, hours starving or parched) names
// the next one ("Hearty Veteran") and nudges that stage's attribute. At the
// end of elder he retires by himself (or sooner, from the menu, once he is an
// elder), in the city he spent most time in, and an heir sets out from there
// with one heirloom and the family perk, which grows each generation.
import type { Best } from "./records";
import type { LatLon } from "./trips";

export const DAY_S = 86400;
/** Real days each stage lasts. */
export const STAGE_DAYS = 14;
/** What each stage does: speed, XP and wage multipliers (a backpacker is the baseline), and the attribute care nudges on entering it. */
export const STAGES = [
  { id: "backpacker", name: "Backpacker", icon: "🎒", speed: 1, xp: 1, wage: 1, attr: null },
  { id: "settled", name: "Settled", icon: "🏡", speed: 1, xp: 1, wage: 1.1, attr: "cha" },
  { id: "veteran", name: "Veteran", icon: "🧭", speed: 1, xp: 1.1, wage: 1, attr: "str" },
  { id: "elder", name: "Elder", icon: "🧓", speed: 0.9, xp: 1.1, wage: 1, attr: "wit" },
] as const;
export type Stage = (typeof STAGES)[number];
export const ELDER = STAGES.length - 1;
/** Seconds from birth to retiring by age: the end of the last stage. */
export const LIFE_S = STAGES.length * STAGE_DAYS * DAY_S;

/** Care tiers: a stage with no faint and at most GOOD_STARVE_H hours starving is good; POOR_FAINTS faints or POOR_STARVE_H hours make it poor. */
export const GOOD_STARVE_H = 1;
export const POOR_FAINTS = 2;
export const POOR_STARVE_H = 12;
export const TIERS = {
  good: { word: "Hearty", nudge: 1 },
  fine: { word: "", nudge: 0 },
  poor: { word: "Weary", nudge: -1 },
} as const;
export type Tier = keyof typeof TIERS;

/** Each generation after the first adds this to XP (as a share) and to the cents he starts with. */
export const PERK_XP = 0.05;
export const PERK_CENTS = 5000;

/** A retired walker, as the family tree keeps him. */
export type Ancestor = {
  gen: number;
  born: number;
  retired: number;
  /** "age" when the elder stage ran out, "you" when you retired him from the menu. */
  by: "age" | "you";
  title: string;
  level: number;
  km: number;
  cities: number;
  /** The city he spent most time in, where he retired. */
  home: string;
  /** The item he left his heir, "" for none. */
  heirloom: string;
  letter: string;
  /** His life story (chronicle.ts), oldest first. */
  chronicle: { t: number; text: string }[];
  /** Countries he walked in and his records' bests (records.ts), for the hall of walkers; missing on walkers who retired before it. */
  countries?: number;
  best?: Record<Best, number>;
};

const ROMAN: [number, string][] = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
export function roman(n: number): string {
  let out = "";
  for (const [v, s] of ROMAN) for (; n >= v; n -= v) out += s;
  return out;
}

/** "a Veteran", "an Elder". */
export const withArticle = (title: string) => `${/^[AEIOU]/.test(title) ? "an" : "a"} ${title}`;

/** "Walker I", "Walker II"... */
export const walkerName = (gen: number) => `Walker ${roman(gen)}`;

/** The tier a stage earned from its faints and minutes starving. */
export function tierOf(faints: number, starveMin: number): Tier {
  const h = starveMin / 60;
  if (faints >= POOR_FAINTS || h >= POOR_STARVE_H) return "poor";
  return faints === 0 && h <= GOOD_STARVE_H ? "good" : "fine";
}

export class Life {
  /** Unix seconds he was born (set out); 0 until the first minute passes. */
  born = 0;
  /** Index into STAGES. */
  stage = 0;
  /** The tier each stage got on entering it (the first is always fine). */
  tiers: Tier[] = ["fine"];
  /** This stage's faints and minutes at zero fullness or thirst. */
  faints = 0;
  starveMin = 0;
  /** Kilometres walked in his life. */
  km = 0;
  /** Minutes spent in each city, by its name ("Plovdiv, Bulgaria"). */
  cityMin: Record<string, number> = {};
  /** Where each city's middle is, for the heir to start there. */
  cityAt: Record<string, LatLon> = {};
  /** 1 for the first walker. */
  gen = 1;
  family: Ancestor[] = [];
  /** True once the elder stage has run out: the game retires him as soon as he isn't on a ride. */
  retireDue = false;
  /** True once you asked him to retire from the menu and he couldn't yet (on a ride): he does at the next chance. */
  asked = false;

  /** Lets `minutes` pass at unix seconds `t` in `city`, walking `walkedM`; true when he is starving. Returns the stages he entered, oldest first. */
  pass(minutes: number, t: number, city: string, walkedM: number, starving: boolean): number[] {
    if (!this.born) this.born = t;
    if (city) this.cityMin[city] = (this.cityMin[city] ?? 0) + minutes;
    if (starving) this.starveMin += minutes;
    this.km += walkedM / 1000;
    const entered: number[] = [];
    while (this.stage < ELDER && t >= this.born + (this.stage + 1) * STAGE_DAYS * DAY_S) {
      this.tiers.push(tierOf(this.faints, this.starveMin));
      this.stage++;
      this.faints = 0;
      this.starveMin = 0;
      entered.push(this.stage);
    }
    if (t >= this.born + LIFE_S) this.retireDue = true;
    return entered;
  }

  /** Notes a city's middle, so an heir can start there. */
  mark(city: string, at: LatLon): void {
    if (city) this.cityAt[city] = at;
  }

  info(): Stage {
    return STAGES[this.stage]!;
  }

  /** The care tier stage `stage` (his current one by default) got on entering it. */
  tier(stage = this.stage): Tier {
    return this.tiers[stage] ?? "fine";
  }

  /** "Hearty Veteran", or just "Veteran", for stage `stage` (his current one by default). */
  title(stage = this.stage): string {
    return [TIERS[this.tier(stage)].word, STAGES[stage]!.name].filter(Boolean).join(" ");
  }

  /** Whole days old at unix seconds `t`. */
  ageDays(t: number): number {
    return this.born ? Math.floor((t - this.born) / DAY_S) : 0;
  }

  /** Seconds until the next stage, or until he retires as an elder. */
  leftS(t: number): number {
    const born = this.born || t;
    return Math.max(born + (this.stage + 1) * STAGE_DAYS * DAY_S - t, 0);
  }

  /** The city he spent most time in, or `fallback` when he has been nowhere yet. */
  favourite(fallback: string): string {
    let best = fallback;
    let most = -1;
    for (const [city, m] of Object.entries(this.cityMin)) if (m > most) [best, most] = [city, m];
    return best;
  }

  /** XP multiplier from the family perk. */
  perkXp(): number {
    return 1 + PERK_XP * (this.gen - 1);
  }

  /** Cents the family perk adds to an heir's start. */
  perkCents(): number {
    return PERK_CENTS * (this.gen - 1);
  }

  /** A new life one generation on, keeping the family with `me` added. */
  heir(me: Ancestor): Life {
    const next = new Life();
    next.gen = this.gen + 1;
    next.family = [...this.family, me];
    return next;
  }

  toJSON() {
    return { ...this };
  }

  /** A save from before life stages: he was born when he set out (`setOut`, unix seconds, 0 if unknown). */
  static fromJSON(d: unknown, setOut = 0): Life {
    const out = Object.assign(new Life(), (d ?? {}) as Partial<Life>);
    if (!d) out.born = setOut;
    return out;
  }
}

/** The farewell letter a retiring walker leaves his heir. */
export function letter(a: Omit<Ancestor, "letter" | "chronicle">): string {
  const lines = [
    "Dear heir,",
    `I walked ${Math.round(a.km)} km through ${a.cities} ${a.cities === 1 ? "city" : "cities"} and reached level ${a.level}. ${a.home.split(",")[0]} felt most like home, so that is where I'm stopping.`,
  ];
  if (a.heirloom) lines.push(`Take my ${a.heirloom}. It has been good to me.`);
  lines.push("Walk far, eat well, and stop at every bakery.", `— ${walkerName(a.gen)}, ${a.title}`);
  return lines.join("\n");
}
