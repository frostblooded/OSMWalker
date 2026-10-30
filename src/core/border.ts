// Border moments: crossing into another country gives a few feed lines: a
// passport stamp, swapping some euros for the local money (flavour only:
// prices stay in euros), the first word he learns there on his first visit,
// and a border guard's quip. Words and quips come from data/borders.json.

/** Country code -> [a word, what it means, the local money ("" where they pay in euros)], and the guards' quips. */
export type Borders = { words: Record<string, [word: string, meaning: string, money: string]>; guards: string[] };

/** The same quip for the same crossing, so the catch-up and a watched game agree without a dice roll. */
const quip = (guards: string[], code: string, stamps: number) => guards[[...code].reduce((n, c) => n + c.charCodeAt(0), stamps) % guards.length];

/** Lines for crossing into `country` (`code`): `stamps` is how many countries he has been to, this one included, `first` true on his first visit. */
export function crossing(b: Borders | null, code: string, country: string, stamps: number, first: boolean): string[] {
  if (!b) return [];
  const w = b.words[code];
  const lines = [first ? `New passport stamp: ${country} (${stamps} countries so far)` : `Another ${country} stamp in his passport`];
  if (w) lines.push(w[2] ? `Swapped a few euros for ${w[2]} at the border, just to hold them` : "No money to change: they pay in euros here too");
  if (w && first) lines.push(`First word learned in ${country}: "${w[0]}" (${w[1]})`);
  const g = quip(b.guards, code, stamps);
  if (g) lines.push(`Border guard ${g}`);
  return lines;
}
