// The hall of walkers (Godville's pantheons, with no server): his family's
// records compared across its walkers. Each record names the walker who
// holds it, the first to reach it on a tie, with him counting as he is now;
// a record nobody has above 0 has no holder yet.
// Ancestors from before the hall only have what the family tree kept.
import { euro } from "./money";
import { type Best, span } from "./records";
import type { Stats } from "./stats";

/** What the hall compares of one walker. */
type Walker = { gen: number; km: number; level: number; cities: number; countries?: number; best?: Partial<Record<Best, number>> };

const km = (v: number) => `${Math.round(v)} km`;
/** Metres the way the Records card shows them (ui/format.ts dist): "400 m", "9.0 km". */
const metres = (v: number) => (v < 1000 ? `${Math.round(v)} m` : `${(v / 1000).toFixed(1)} km`);
const best = (k: Best) => (w: Walker) => w.best?.[k];

/** The records, in the order the hall shows them; `of` is undefined when a walker didn't keep it. */
export const HALL: { id: string; icon: string; name: string; of: (w: Walker) => number | undefined; show: (v: number) => string }[] = [
  { id: "km", icon: "👣", name: "Furthest walked", of: (w) => w.km, show: km },
  { id: "countries", icon: "🌍", name: "Most countries", of: (w) => w.countries, show: String },
  { id: "cities", icon: "🏙", name: "Most cities", of: (w) => w.cities, show: String },
  { id: "level", icon: "⭐", name: "Highest level", of: (w) => w.level, show: String },
  { id: "cents", icon: "💰", name: "Most money held", of: best("cents"), show: euro },
  { id: "dayM", icon: "📏", name: "Most walked in a day", of: best("dayM"), show: metres },
  { id: "dayStops", icon: "📍", name: "Most places in a day", of: best("dayStops"), show: String },
  { id: "stretchM", icon: "🚶", name: "Longest walk without a stop", of: best("stretchM"), show: metres },
  { id: "noFaintS", icon: "❤", name: "Longest without fainting", of: best("noFaintS"), show: span },
];

/** The first rows are his whole life (km, countries, cities, level); the rest are his Records' bests. */
export const LIFE_ROWS = 4;

/** `gen` 0 while no walker has any of it yet. */
export type HallRow = { id: string; icon: string; name: string; gen: number; value: number; text: string };

/** Him as the hall counts him now. */
function me(s: Stats): Walker {
  return { gen: s.life.gen, km: s.life.km, level: s.level, cities: s.records.cities.length, countries: s.records.countries.length, best: s.records.best };
}

/** Each record with the walker who holds it. */
export function hall(s: Stats): HallRow[] {
  const all: Walker[] = [...s.life.family, me(s)];
  return HALL.map((h) => {
    let gen = 0;
    let value = 0;
    for (const w of all) {
      const v = h.of(w);
      if (v !== undefined && v > value) [gen, value] = [w.gen, v];
    }
    return { id: h.id, icon: h.icon, name: h.name, gen, value, text: h.show(value) };
  });
}

/** The records he holds over the walkers before him (none for the first walker). */
export function heldBy(s: Stats): string[] {
  if (!s.life.family.length) return [];
  return hall(s)
    .filter((r) => r.gen === s.life.gen)
    .map((r) => r.id);
}
