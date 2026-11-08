// The in-game Help: data/help.txt split into sections and pages, with
// {NAME} placeholders filled from the game's own numbers so the text never
// goes stale. "# Title" starts a section, "## Title {id}" a page, and the
// lines after it are the page's text. Fetched only when Help first opens.
import * as DebugLog from "../core/debugLog";
import * as History from "../core/history";
import { euro } from "../core/money";
import * as O from "../core/orders";
import * as Problems from "../core/problems";
import * as U from "../core/upgrades";
import * as W from "../core/walker";
import * as G from "../game/game";
import { MIDDLE } from "../map/mapView";
import { MAX_AGE_S } from "../streets/source";
import { MIN_CHARS } from "./Picker";
import * as Snap from "./snap";

export type Page = { id: string; title: string; body: string };
export type Section = { title: string; pages: Page[] };
export type Block = { text: string; items: string[] };

export function parse(text: string): Section[] {
  const sections: Section[] = [];
  let page: Page | null = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("## ")) {
      const head = line.slice(3).trim();
      const open = head.lastIndexOf("{");
      page = { id: head.slice(open + 1, -1), title: head.slice(0, open).trim(), body: "" };
      sections.at(-1)?.pages.push(page);
    } else if (line.startsWith("# ")) {
      sections.push({ title: line.slice(2).trim(), pages: [] });
      page = null;
    } else if (page) page.body += line + "\n";
  }
  for (const s of sections) for (const p of s.pages) p.body = p.body.trim();
  return sections;
}

/** A page's text as cards: one per paragraph, whose "- " lines are rows. */
export function blocks(body: string): Block[] {
  return body
    .split(/\n\n+/)
    .filter((c) => c.trim())
    .map((chunk) => {
      const text: string[] = [];
      const items: string[] = [];
      for (const line of chunk.trim().split("\n")) (line.startsWith("- ") ? items : text).push(line.replace(/^- /, "").trim());
      return { text: text.join(" "), items };
    });
}

/** Lower case without accents, the same length as `t` (an emoji stays whole) so indexes still line up. */
const fold = (t: string) =>
  Array.from(t, (c) => {
    const f = (c.normalize("NFD")[0] ?? c).toLowerCase();
    return f.length === c.length ? f : c;
  }).join("");

/** Each page's folded title and body, made once instead of on every key press. */
const folded = new WeakMap<Page, [string, string]>();
const foldPage = (p: Page) => {
  let f = folded.get(p);
  if (!f) folded.set(p, (f = [fold(p.title), fold(p.body)]));
  return f;
};

/** Where `word` first starts a word in `text`, or -1 ("fee" isn't found in "coffee"). */
function findWord(text: string, word: string): number {
  for (let i = text.indexOf(word); i >= 0; i = text.indexOf(word, i + 1)) {
    if (i === 0 || !/[\p{L}\p{N}]/u.test(text[i - 1]!)) return i;
  }
  return -1;
}

export type Hit = { page: Page; section: string; snip: [string, string, string] };
const SNIP_BEFORE = 40;
const SNIP_AFTER = 70;

/** Pages that hold every word of `query` (any case, accents ignored), the
 * ones whose title holds them first, each with the line around the match. */
export function search(sections: Section[], query: string): Hit[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits: (Hit & { rank: number })[] = [];
  for (const s of sections) {
    for (const page of s.pages) {
      const [title, body] = foldPage(page);
      const inTitle = words.filter((w) => findWord(title, w) >= 0).length;
      if (!words.every((w) => findWord(title, w) >= 0 || findWord(body, w) >= 0)) continue;
      hits.push({ page, section: s.title, snip: snippet(page.body, body, words), rank: words.length - inTitle });
    }
  }
  return hits.sort((a, b) => a.rank - b.rank).map(({ rank: _, ...h }) => h);
}

/** The line of `text` around the first body match, cut to a phone-sized bit. */
function snippet(text: string, folded: string, words: string[]): [string, string, string] {
  const found = words.map((w) => [findWord(folded, w), w.length] as const).filter(([i]) => i >= 0);
  if (!found.length) return ["", "", text.split("\n")[0]!.slice(0, SNIP_AFTER)];
  const [at, len] = found.reduce((a, b) => (b[0] < a[0] ? b : a));
  const start = text.lastIndexOf("\n", at) + 1;
  const end = (text.indexOf("\n", at) + 1 || text.length + 1) - 1;
  // Cut at spaces so no word is chopped in half.
  let from = Math.max(start, at - SNIP_BEFORE);
  if (from > start) from = text.indexOf(" ", from) + 1 || from;
  let to = Math.min(end, at + len + SNIP_AFTER);
  if (to < end) to = Math.max(at + len, text.lastIndexOf(" ", to));
  const before = text.slice(from, at).replace(/^- /, "");
  return [(from > start ? "…" : "") + before, text.slice(at, at + len), text.slice(at + len, to) + (to < end ? "…" : "")];
}

export const fill = (text: string, vals: Record<string, string>) => text.replace(/\{([A-Z0-9_]+)\}/g, (m, k: string) => vals[k] ?? m);

export const build = (text: string) => parse(fill(text, values()));

/** Shortest form of a number: 0.5, 2, 1.3. */
const num = (n: number) => String(Math.round(n * 100) / 100);
const km = (m: number) => num(m / 1000);
/** Sample drops Help shows the pay for. */
const EX_NEAR_M = 500;
const EX_FAR_M = 1500;
const pct = (x: number) => String(Math.round(Math.abs(x - 1) * 100));
/** "restaurant, cafe or pizza": the kinds of food place, from orders.ts. */
const foodKinds = () => {
  const k = [...O.FOOD].map((c) => c.replace("_", " "));
  return `${k.slice(0, -1).join(", ")} or ${k.at(-1)}`;
};
/** The upgrades as Help list items: "- 🔧 Bike tune-up, from €4.50: he rides 10% faster." */
const upgrades = () => U.UPGRADES.map((u) => `- ${u.icon} ${u.name}, from ${euro(u.cents)}: ${u.does}.`).join("\n");

export function values(): Record<string, string> {
  return {
    SEARCH_MIN_CHARS: String(MIN_CHARS),
    MAX_STEP_S: num(G.MAX_STEP_S),
    SAVE_EVERY_S: num(G.SAVE_EVERY_S),
    POSE_S: num(G.POSE_S),
    MIN_CITY_KM: km(W.MIN_CITY_RADIUS_M),
    MAX_CITY_KM: km(W.MAX_CITY_RADIUS_M),
    BIKE_KMH: String(Math.round(W.BIKE_MPS * 3.6)),
    BIKE_M_PER_MIN: String(Math.round(W.BIKE_MPS * 60)),
    REAL_BIKE_KMH: num(W.REAL_BIKE_KMH),
    SPEED_X: num(W.GAME_SPEED_X),
    ARRIVE_M: num(W.ARRIVE_M),
    TRIP_RATIO: num(W.TRIP_RATIO),
    TRIP_EXTRA_KM: km(W.TRIP_EXTRA_M),
    ORDER_WAIT_S: num(O.ORDER_WAIT_S),
    MIN_WAIT_S: num(O.MIN_WAIT_S),
    NEAREST_FOOD: String(O.NEAREST_FOOD),
    FOOD_KINDS: foodKinds(),
    DROP_MIN_M: num(O.DROP_MIN_M),
    DROP_MAX_KM: km(O.DROP_MAX_M),
    BASE_EURO: euro(O.BASE_CENTS),
    PER_KM_EURO: euro(O.CENTS_PER_KM),
    ROUTE_FACTOR: num(O.ROUTE_FACTOR),
    EX_NEAR_M: num(EX_NEAR_M),
    EX_NEAR_EURO: euro(O.payOf(EX_NEAR_M)),
    EX_FAR_KM: km(EX_FAR_M),
    EX_FAR_EURO: euro(O.payOf(EX_FAR_M)),
    SPEED_STEP_PCT: pct(U.SPEED_STEP),
    WAIT_STEP_PCT: pct(U.WAIT_STEP),
    GROWTH_PCT: pct(U.GROWTH),
    OPENS_AFTER: String(U.OPENS_AFTER),
    UPGRADES: upgrades(),
    STREET_SQUARES: String(2 * G.STREET_RING + 1),
    TILE_KM: km(40_075_016 / 2 ** 14),
    CACHE_DAYS: String(Math.round(MAX_AGE_S / 86400)),
    MIDDLE_PCT: String(Math.round(MIDDLE * 100)),
    SHEET_TALL_PCT: String(Math.round(Snap.TALL * 100)),
    SHEET_CLOSE_PCT: String(Math.round(Snap.CLOSE_AT * 100)),
    HISTORY_SIZE: String(History.SIZE),
    TRAIL_KM: String(Math.round((History.MAX_TRAIL * History.TRAIL_STEP_M) / 1000)),
    DEBUG_SIZE: String(DebugLog.SIZE),
    MAX_WARNINGS: String(Problems.MAX_WARNINGS),
    MAX_ERRORS: String(Problems.MAX_ERRORS),
  };
}
