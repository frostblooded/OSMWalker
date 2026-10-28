// The bundled game data, fetched once after first paint (about 160 KB gzip
// in all), so the city picker shows before any of it arrives.
import type { ActionTable } from "../core/activities";
import { parseAirports, parseCities } from "../core/trips";
import type { GameData } from "../game/game";

const url = (name: string) => `${import.meta.env.BASE_URL}data/${name}`;
const text = async (name: string) => {
  const r = await fetch(url(name));
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  return r.text();
};

/** Lets the browser draw and handle taps between bits of work. */
const yieldNow = () => new Promise<void>((ok) => setTimeout(ok, 0));

/** Parses a big TSV a slice of lines at a time, so no single task blocks the page (long tasks hurt taps on phones). */
async function parseInSlices<T>(tsv: string, parse: (text: string) => T[], lines = 1000): Promise<T[]> {
  const all = tsv.split("\n");
  const out: T[] = [];
  for (let i = 0; i < all.length; i += lines) {
    out.push(...parse(all.slice(i, i + lines).join("\n")));
    await yieldNow();
  }
  return out;
}

let pending: Promise<GameData> | null = null;

export function loadData(): Promise<GameData> {
  pending ??= Promise.all([text("actions.json"), text("flavour.json"), text("cities.tsv"), text("airports.tsv")]).then(async ([a, f, c, p]) => {
    const actions = JSON.parse(a) as ActionTable;
    await yieldNow();
    const flavour = JSON.parse(f) as Record<string, ActionTable>;
    await yieldNow();
    return { actions, flavour, cities: await parseInSlices(c, parseCities), airports: await parseInSlices(p, parseAirports) };
  });
  return pending;
}
