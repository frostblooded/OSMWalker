// The lottery: kiosks, corner shops and newsagents sell him a TICKET for the
// next draw, at DRAW_HOUR by his clock, one ticket a draw. The odds are a
// real lottery's, and each point of Luck nudges every prize a little likelier
// (LUCK_NUDGE, up to LUCK_MULT_MAX). Like a real one it pays back well under
// the price on average, so it is a small treat, not a living; a big win is
// a rare story for his chronicle. Drawn by itself, also while you're away.
// Pure; Stats owns one.

/** A prize this many numbers or more goes in his chronicle. */
export const BIG_MATCH = 5;
/** A ticket's price, in cents. */
export const TICKET = 200;
/** The draw is at this hour, his clock. */
export const DRAW_HOUR = 20;
/** Each point of Luck makes every prize this share likelier, up to LUCK_MULT_MAX times. */
export const LUCK_NUDGE = 0.1;
export const LUCK_MULT_MAX = 3;

export type Prize = { match: number; cents: number; /** One ticket in this many wins it. */ odds: number; mood: number; say: string[] };

/** Smallest first. */
export const PRIZES: Prize[] = [
  { match: 3, cents: 500, odds: 55, mood: 5, say: ["Three numbers in tonight's draw: {WON}, his ticket back and then some"] },
  {
    match: 4,
    cents: 4_000,
    odds: 1_000,
    mood: 15,
    say: ["Four numbers in tonight's draw! He won {WON} and buys the whole bar a round", "Four numbers tonight! {WON}, and he frames the ticket stub"],
  },
  {
    match: 5,
    cents: 150_000,
    odds: 55_000,
    mood: 30,
    say: ["FIVE numbers! He won {WON} on the lottery and reads the ticket twenty times", "FIVE numbers in tonight's draw: {WON}! He phones his mother, then the kiosk to thank them"],
  },
  {
    match: 6,
    cents: 10_000_000,
    odds: 14_000_000,
    mood: 50,
    say: ["THE JACKPOT! Six numbers, {WON} on the lottery, and he sits down on the pavement laughing"],
  },
];

/** The draw after unix seconds `t`: today at DRAW_HOUR by his clock, or tomorrow once that has passed. */
export function nextDraw(t: number): number {
  const d = new Date(t * 1000);
  d.setHours(DRAW_HOUR, 0, 0, 0);
  if (d.getTime() / 1000 <= t) d.setDate(d.getDate() + 1);
  return d.getTime() / 1000;
}

/** How much likelier each prize is with `luck`. */
export const oddsMult = (luck: number) => Math.min(1 + LUCK_NUDGE * Math.max(luck, 0), LUCK_MULT_MAX);

/** The prize a die `r` (0 to 1) wins with `luck`: the top prize it reaches, or null. */
export function roll(r: number, luck: number): Prize | null {
  const m = oddsMult(luck);
  let edge = 0;
  for (let i = PRIZES.length - 1; i >= 0; i--) {
    edge += m / PRIZES[i]!.odds;
    if (r < edge) return PRIZES[i]!;
  }
  return null;
}

export class Lottery {
  /** The draw (unix seconds) of the ticket he holds, or 0. */
  ticket = 0;
  /** Tickets drawn, prizes won, cents won in all, and his biggest prize. */
  tickets = 0;
  prizes = 0;
  won = 0;
  best = 0;

  toJSON() {
    return { ticket: this.ticket, tickets: this.tickets, prizes: this.prizes, won: this.won, best: this.best };
  }

  /** Old saves hold no ticket. */
  static fromJSON(d: unknown): Lottery {
    const out = new Lottery();
    const v = (d ?? {}) as Record<string, unknown>;
    for (const k of ["ticket", "tickets", "prizes", "won", "best"] as const) out[k] = Math.max(Number(v[k]) || 0, 0);
    return out;
  }
}
