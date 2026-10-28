// Money is euros, kept as whole cents so sums never drift. The data files
// list prices in euros (3, 5.5); toCents turns them into cents once.

/** Whole cents for an amount in euros. */
export const toCents = (eur: number) => Math.round(eur * 100 + 1e-9);

/** "€200", "€1.20", "€12,345.67": cents only when there are any. */
export function euro(cents: number): string {
  const c = Math.abs(Math.round(cents));
  const whole = Math.floor(c / 100).toLocaleString("en-US");
  const rest = c % 100;
  return `${cents < 0 ? "-" : ""}€${whole}${rest ? `.${String(rest).padStart(2, "0")}` : ""}`;
}

/** "+€5.50" or "-€3". */
export const signed = (cents: number) => (cents >= 0 ? "+" : "") + euro(cents);
