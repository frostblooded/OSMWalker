// Streets he walked: any stretch of a named street counts. Kept per city by
// name, so the Stats sheet can say "Sofia: 312 streets" and list them.

/** Every this many streets in a city, the feed says how many he walked there. */
export const STREET_MARK = 50;
/** Cities shown on the Stats sheet's Streets card before the rest fold away. */
export const CITIES_SHOWN = 4;

export class StreetBook {
  /** Street names he walked, by city ("Sofia, Bulgaria"), in the order he first walked them. */
  cities: Record<string, string[]> = {};

  /** Notes that he walks `name` in `city`; true when it is a new street there. */
  walk(city: string, name: string): boolean {
    if (!city || !name) return false;
    const list = (this.cities[city] ??= []);
    if (list.includes(name)) return false;
    list.push(name);
    return true;
  }

  /** Streets he walked in `city`, or in all cities. */
  count(city?: string): number {
    if (city !== undefined) return this.cities[city]?.length ?? 0;
    return Object.values(this.cities).reduce((n, l) => n + l.length, 0);
  }

  toJSON() {
    return { cities: this.cities };
  }

  static fromJSON(d?: Partial<ReturnType<StreetBook["toJSON"]>>): StreetBook {
    const b = new StreetBook();
    for (const [c, l] of Object.entries(d?.cities ?? {})) if (Array.isArray(l)) b.cities[c] = [...new Set(l.filter((n) => typeof n === "string" && n))];
    return b;
  }
}
