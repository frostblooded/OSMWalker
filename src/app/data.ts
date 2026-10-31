// The bundled game data, fetched once after first paint (about 172 KB gzip
// in all), so the city picker shows before any of it arrives.
import type { ActionTable } from "../core/activities";
import type { Letters } from "../core/bond";
import type { Borders } from "../core/border";
import type { Forecast } from "../core/forecast";
import type { Creature } from "../core/creatures";
import type { Spell } from "../core/magic";
import type { Incident } from "../core/incidents";
import type { Contest } from "../core/rival";
import type { FriendData } from "../core/friends";
import type { Jokes } from "../core/jokes";
import type { DiaryData } from "../core/diary";
import type { Dex } from "../core/keepsakes";
import type { Bank } from "../core/quests";
import { parseAirports, parseCities } from "../core/trips";
import type { WordBook } from "../core/words";
import type { GameData } from "../game/game";

const url = (name: string) => `${import.meta.env.BASE_URL}data/${name}`;
const get = async (name: string) => {
  const r = await fetch(url(name));
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  return r;
};
const text = async (name: string) => (await get(name)).text();
const table = async <T>(name: string, parse: (text: string) => T[]) => parseStream((await get(name)).body!, parse);

/** Lets the browser draw and handle taps between bits of work. */
export const yieldNow = () => new Promise<void>((ok) => setTimeout(ok, 0));

/** Runs `f` once the page has nothing else to do. */
export const whenIdle = (f: () => void) => (window.requestIdleCallback ?? ((g: () => void) => setTimeout(g, 200)))(f);

/** Work time per task before yielding: well under the 50 ms long-task line even on a slow phone. */
const SLICE_MS = 8;
/** Lines parsed between clock checks. */
const LINES = 100;

/**
 * Decodes and parses a big TSV body as it streams in, a few lines at a time,
 * yielding every SLICE_MS. Reading the whole body with text() first decodes it
 * all in one long task (long tasks hurt taps on phones).
 */
export async function parseStream<T>(body: ReadableStream<BufferSource>, parse: (text: string) => T[]): Promise<T[]> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  const out: T[] = [];
  let rest = "";
  let start = performance.now();
  const lines = async (all: string[]) => {
    for (let i = 0; i < all.length; i += LINES) {
      out.push(...parse(all.slice(i, i + LINES).join("\n")));
      if (performance.now() - start > SLICE_MS) {
        await yieldNow();
        start = performance.now();
      }
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const all = (rest + value).split("\n");
    rest = all.pop()!;
    await lines(all);
  }
  await lines([rest]);
  return out;
}

let pending: Promise<GameData> | null = null;

export function loadData(): Promise<GameData> {
  pending ??= Promise.all([text("actions.json"), text("flavour.json"), table("cities.tsv", parseCities), table("airports.tsv", parseAirports), text("placedex.json"), text("jokes.json"), text("forecasts.json"), text("letters.json"), text("incidents.json"), text("borders.json"), text("rival.json"), text("friends.json"), text("creatures.json"), text("quests.json"), text("city-quests.json"), text("spells.json"), text("words.json"), text("diary.json")]).then(
    async ([a, f, cities, airports, x, j, fc, l, inc, b, riv, fr, cr, qb, cq, sp, wd, di]) => {
      await yieldNow();
      const actions = JSON.parse(a) as ActionTable;
      await yieldNow();
      const flavour = JSON.parse(f) as Record<string, ActionTable>;
      await yieldNow();
      // The capitals' own quests (city-quests.json) join the quest bank.
      const quests = JSON.parse(qb) as Bank;
      quests.quests.push(...(JSON.parse(cq) as Bank["quests"]));
      await yieldNow();
      return { actions, flavour, cities, airports, dex: JSON.parse(x) as Dex, jokes: JSON.parse(j) as Jokes, forecasts: JSON.parse(fc) as Forecast[], letters: JSON.parse(l) as Letters, incidents: JSON.parse(inc) as Incident[], borders: JSON.parse(b) as Borders, contests: JSON.parse(riv) as Contest[], friends: JSON.parse(fr) as FriendData, creatures: JSON.parse(cr) as Creature[], quests, spells: JSON.parse(sp) as Spell[], words: JSON.parse(wd) as WordBook, diary: JSON.parse(di) as DiaryData };
    },
  );
  return pending;
}
