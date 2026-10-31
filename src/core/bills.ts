// Weekly bills (The Sims' bills and repo man): at the start of each week,
// Monday at midnight by his clock, the bills for his phone, travel
// insurance and a storage locker arrive and he pays them by himself, also
// while you're away. They grow with his level, so they still matter late
// in the game. When he can't pay them all, a debt collector takes the
// cheapest thing in his bag he may sell instead and the bills are settled;
// with nothing to take, they are written off. Never his gear or a treasured
// item, so a bill never blocks him.

/** Each bill: cents a week, plus cents for each level above 1. */
export const BILLS = [
  { icon: "📱", name: "phone", cents: 1500, perLevel: 50 },
  { icon: "🩺", name: "travel insurance", cents: 1000, perLevel: 100 },
  { icon: "📦", name: "storage locker", cents: 500, perLevel: 50 },
] as const;

/** What the week's bills come to at `level`. */
export function billsAt(level: number): number {
  return BILLS.reduce((sum, b) => sum + b.cents + b.perLevel * (level - 1), 0);
}
