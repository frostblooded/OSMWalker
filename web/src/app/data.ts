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

let pending: Promise<GameData> | null = null;

export function loadData(): Promise<GameData> {
  pending ??= Promise.all([text("actions.json"), text("flavour.json"), text("cities.tsv"), text("airports.tsv")]).then(([a, f, c, p]) => ({
    actions: JSON.parse(a) as ActionTable,
    flavour: JSON.parse(f) as Record<string, ActionTable>,
    cities: parseCities(c),
    airports: parseAirports(p),
  }));
  return pending;
}
