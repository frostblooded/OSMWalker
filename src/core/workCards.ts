// Chance cards at work (The Sims' career chance cards): now and then a paid
// job brings a small dilemma, such as the boss asking him to cover a double.
// He picks by himself, leaning on one of his attributes, never you; the bold
// choice can pay off or go wrong, by the same attribute. The feed shows what
// he chose and how it went. Pure; Stats.do draws one.
import { effect } from "./gifts";
import { ATTR_NAMES, leanShare } from "./incidents";
import { signed } from "./money";
import type { Rng } from "./rng";
import type { Attr, Fx, Stats } from "./stats";

/** Chance a paid job brings a chance card. */
export const CARD_CHANCE = 0.15;
/** The bold choice works out with WIN_BASE plus WIN_PER_POINT a point of the card's attribute, up to WIN_MAX. */
export const WIN_BASE = 0.4;
export const WIN_PER_POINT = 0.05;
export const WIN_MAX = 0.85;

export const winChance = (points: number) => Math.min(WIN_BASE + WIN_PER_POINT * points, WIN_MAX);

/** What an outcome does: `pay` is a share of the wage he just earned (negative docks it), `deed` leans him kind (1) or rascal (-1). */
export type Outcome = { say: string; pay?: number; fx?: Fx; deed?: number };

export type WorkCard = {
  id: string;
  icon: string;
  text: string;
  /** He leans to the bold choice with this attribute, and it decides how the bold choice goes. */
  lean: Attr;
  bold: { label: string; win: Outcome; lose: Outcome };
  safe: { label: string; after: Outcome };
};

export const CARDS: WorkCard[] = [
  {
    id: "double", icon: "⏱", text: "The boss asks him to cover a double shift.", lean: "str",
    bold: { label: "Take it", win: { say: "worked the double and got paid for it", pay: 1, fx: { energy: -25, xp: 20 } }, lose: { say: "dozed off halfway through the double", fx: { energy: -20, mood: -5 } } },
    safe: { label: "Go home", after: { say: "went home on time", fx: { mood: 3 } } },
  },
  {
    id: "complaint", icon: "😤", text: "A customer is complaining loudly.", lean: "cha",
    bold: { label: "Smooth it over", win: { say: "won the customer round and got a tip", pay: 0.5, fx: { mood: 5 } }, lose: { say: "made the customer angrier", fx: { mood: -8 } } },
    safe: { label: "Call the boss", after: { say: "let the boss deal with the customer" } },
  },
  {
    id: "idea", icon: "💡", text: "He has an idea to make the work quicker.", lean: "wit",
    bold: { label: "Pitch it", win: { say: "pitched his idea and the boss loved it", pay: 0.3, fx: { xp: 30 } }, lose: { say: "pitched his idea and it fell flat", fx: { mood: -5 } } },
    safe: { label: "Keep quiet", after: { say: "kept his idea to himself" } },
  },
  {
    id: "cover", icon: "🤝", text: "A coworker asks him to cover for them.", lean: "cha",
    bold: { label: "Cover", win: { say: "covered for a coworker, who owes him one", fx: { mood: 8, xp: 15 } }, lose: { say: "covered for a coworker, got caught and was docked", pay: -0.5, fx: { mood: -5 } } },
    safe: { label: "Say no", after: { say: "said no to covering for a coworker", fx: { mood: -2 } } },
  },
  {
    id: "break", icon: "☕", text: "It's quiet. A long break is tempting.", lean: "luck",
    bold: { label: "Take a break", win: { say: "took a long break and nobody noticed", fx: { energy: 15, mood: 5 } }, lose: { say: "took a long break and the boss docked him", pay: -0.5 } },
    safe: { label: "Keep working", after: { say: "kept working through the quiet", fx: { xp: 10 } } },
  },
  {
    id: "till", icon: "💶", text: "The till comes up over at closing.", lean: "luck",
    bold: { label: "Pocket it", win: { say: "pocketed the extra from the till", pay: 0.3, deed: -1 }, lose: { say: "pocketed the extra from the till, got caught and was docked", pay: -1, deed: -1, fx: { mood: -10 } } },
    safe: { label: "Hand it in", after: { say: "handed in the extra from the till", deed: 1, fx: { mood: 5, xp: 10 } } },
  },
  {
    id: "rush", icon: "🏃", text: "A big rush comes in just before the end of his shift.", lean: "str",
    bold: { label: "Stay on", win: { say: "stayed on through the rush and got paid extra", pay: 0.5, fx: { energy: -15 } }, lose: { say: "stayed on through the rush and was worn out", fx: { energy: -20, mood: -3 } } },
    safe: { label: "Clock off", after: { say: "clocked off before the rush" } },
  },
];

/** One Help line per card: the dilemma, the attribute he leans on, and the choices. */
export const helpList = () =>
  CARDS.map((c) => {
    const deed = (o: Outcome) => (o.deed ? `leans him ${o.deed > 0 ? "kind" : "rascal"}` : "");
    const pay = (o: Outcome) => [o.pay ? `${o.pay > 0 ? "+" : "-"}${Math.round(Math.abs(o.pay) * 100)}% of the wage` : "", effect(o), deed(o)].filter(Boolean).join(", ") || "nothing";
    return `- ${c.icon} ${c.text} ${c.bold.label} (works out: ${pay(c.bold.win)}; goes wrong: ${pay(c.bold.lose)}) or ${c.safe.label} (${pay(c.safe.after)}). He leans on ${ATTR_NAMES[c.lean]}.`;
  }).join("\n");

/**
 * Maybe a chance card after a job that paid `wage` cents: CARD_CHANCE of
 * one. He picks, the outcome is applied to `stats`, and the feed line is
 * returned ("" for no card).
 */
export function draw(stats: Stats, wage: number, rng: Rng): string {
  if (wage <= 0 || rng.randf() >= CARD_CHANCE) return "";
  const c = rng.pick(CARDS);
  const share = leanShare(stats, c.lean);
  const bold = rng.randf() < 0.5 + share;
  const o = bold ? (rng.randf() < winChance(stats.attr(c.lean)) ? c.bold.win : c.bold.lose) : c.safe.after;
  const pay = Math.max(Math.round(wage * (o.pay ?? 0)), -stats.cents);
  stats.cents += pay;
  stats.applyFx(o.fx ?? {});
  if (o.deed) stats.bond.deed(o.deed);
  const what = [pay ? signed(pay) : "", effect(o)].filter(Boolean).join(", ");
  return `${c.icon} At work: ${c.text} ${bold ? c.bold.label : c.safe.label}: he ${o.say}${what ? ` (${what})` : ""}`;
}
