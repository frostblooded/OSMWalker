// Public holidays from Nager.Date: which days are holidays in a country (what
// closes on them is core/opening.ts). Nager.Date takes ISO 3166 two-letter
// codes (core/iso2.ts turns the game's three-letter ones into them).

export type Holiday = { date: string; name: string; localName: string };

export const NAGER_URL = "https://date.nager.at/api/v3/PublicHolidays/";

export const url = (year: number, cc2: string) => `${NAGER_URL}${year}/${cc2}`;

/** Country-wide public holidays from a Nager.Date answer, or null if it isn't one. */
export function parse(data: unknown): Holiday[] | null {
  if (!Array.isArray(data)) return null;
  const out: Holiday[] = [];
  for (const h of data) {
    if (typeof h?.date !== "string" || h.global === false) continue;
    if (Array.isArray(h.types) && !h.types.includes("Public")) continue;
    out.push({ date: h.date, name: String(h.name ?? ""), localName: String(h.localName ?? "") });
  }
  return out;
}

/** "YYYY-MM-DD" at unix ms in a place `utcOffsetS` seconds ahead of UTC (the device's own offset by default). */
export function dayOf(ms: number, utcOffsetS = -new Date(ms).getTimezoneOffset() * 60): string {
  return new Date(ms + utcOffsetS * 1000).toISOString().slice(0, 10);
}

/** The holiday on the day of unix ms there, or null. */
export function on(list: Holiday[], ms: number, utcOffsetS?: number): Holiday | null {
  const day = dayOf(ms, utcOffsetS);
  return list.find((h) => h.date === day) ?? null;
}

