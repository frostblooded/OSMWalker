// The in-game Help: data/help.txt split into sections and pages, with
// {NAME} placeholders filled from the game's own numbers so the text never
// goes stale. "# Title" starts a section, "## Title {id}" a page, and the
// lines after it are the page's text. Fetched only when Help first opens.
import * as Activities from "../core/activities";
import * as Bills from "../core/bills";
import * as Bond from "../core/bond";
import * as Bricks from "../core/bricks";
import * as Chron from "../core/chronicle";
import * as CatchUp from "../core/catchup";
import * as CityCheck from "../core/cityCheck";
import * as CityFacts from "../core/cityFacts";
import * as Creatures from "../core/creatures";
import * as Magic from "../core/magic";
import * as Midnight from "../core/midnight";
import * as Portals from "../core/portals";
import * as Giants from "../core/giants";
import * as Fairy from "../core/fairy";
import * as Collection from "../core/collection";
import * as DebugLog from "../core/debugLog";
import * as Dilemmas from "../core/dilemmas";
import * as Forecast from "../core/forecast";
import * as Gifts from "../core/gifts";
import * as Inc from "../core/incidents";
import * as Goals from "../core/goals";
import * as Minigames from "../core/minigames";
import * as Moments from "../core/moments";
import * as History from "../core/history";
import * as Items from "../core/items";
import * as Jokes from "../core/jokes";
import * as Snap from "./snap";
import * as CC from "../core/cityCards";
import * as K from "../core/keepsakes";
import * as Looks from "../core/look";
import * as MapIcons from "../core/mapIcons";
import { euro, toCents } from "../core/money";
import * as Opening from "../core/opening";
import * as Gen from "../core/poiGen";
import * as Pet from "../core/pet";
import * as Postcard from "../core/postcard";
import * as Quests from "../core/quests";
import * as Problems from "../core/problems";
import * as Sky from "../core/sky";
import * as Rec from "../core/records";
import * as Speeds from "../core/speeds";
import * as Rival from "../core/rival";
import * as Anniv from "../core/anniversaries";
import * as Clubs from "../core/clubs";
import * as Friends from "../core/friends";
import * as Story from "../core/storyteller";
import * as S from "../core/stats";
import * as Kit from "../core/travelKit";
import * as Townies from "../core/townies";
import * as Trips from "../core/trips";
import * as W from "../core/walker";
import * as Weather from "../core/weather";
import * as Work from "../core/workCards";
import type { GameData } from "../game/game";
import * as G from "../game/game";
import * as Words from "../core/words";
import { MIDDLE } from "../map/mapView";
import { MAX_AGE_S } from "../streets/source";
import { MIN_CHARS } from "./Picker";

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

/** Lower case without accents, one character per character so indexes still line up. */
const fold = (t: string) => Array.from(t, (c) => (c.normalize("NFD")[0] ?? c).toLowerCase()[0] ?? c).join("");

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

export const build = (text: string, data: GameData) => parse(fill(text, values(data)));

/** Shortest form of a number: 0.5, 2, 1.3. */
const num = (n: number) => String(Math.round(n * 100) / 100);
const pct = (share: number) => `${num(share * 100)}%`;
/** The least the POI sweep must find of a kind for this Placedex rarity, as "1,000". */
const band = (r: Items.Rarity) => (K.DEX_BANDS.find(([, b]) => b === r)?.[0] ?? 0).toLocaleString("en-GB");
const cheapest = (kind: Items.Kind) => Items.cheapest(kind).price;
const kmh = (mps: number) => String(Math.round(mps * 3.6));
const km = (m: number) => num(m / 1000);

/** A crawl's kinds; the landmarks one points at their page. */
const crawlKinds = (c: K.Crawl) => {
  const words = Collection.CRAWL_KINDS[c.id] ?? c.kinds.join(", ");
  return c.id === "sights" ? `${words} (see Landmark cards)` : words;
};
/** "- 🌍 Passport stamps: 3, 10 and 30 countries visited; Gold gives the title Globetrotter." */
const featLine = (f: Collection.Feat) => `- ${f.icon} ${f.name}: ${Collection.say(f, f.tiers.join(", ").replace(/, (\d+)$/, " and $1"))}; Gold gives the title ${f.title},`;

/** The names of actions marked kind (+1) or rascal (-1) in data/actions.json, in lower case and once each. */
function deeds(actions: GameData["actions"], sign: 1 | -1): string {
  const names = new Set<string>();
  for (const list of Object.values(actions)) if (Array.isArray(list)) for (const a of list) if (Math.sign(a.deed ?? 0) === sign) names.add(a.name.toLowerCase());
  return [...names].join(", ");
}

export function values(data: GameData): Record<string, string> {
  const s = new S.Stats();
  const incidents = data.incidents ?? [];
  const bank = data.quests ?? { names: [], quests: [], events: [] };
  const sum = (t: Activities.ActionTable) => Object.values(t).reduce((n, l) => n + l.length, 0);
  const v: Record<string, string> = {
    SEARCH_MIN_CHARS: String(MIN_CHARS),
    MAX_STEP_S: num(G.MAX_STEP_S),
    SAVE_EVERY_S: num(G.SAVE_EVERY_S),
    MIN_AWAY_MIN: num(CatchUp.MIN_AWAY_S / 60),
    MAX_AWAY_H: num(CatchUp.MAX_AWAY_S / 3600),
    CLOVER_AWAY_H: num(Gifts.CLOVER_AWAY_S / 3600),
    CLOVERS_PER_DAY: num(Gifts.CLOVERS_PER_DAY),
    CLOVERS_PER_CHECKIN: num(Gifts.CLOVERS_PER_CHECKIN),
    POSTCARD_NAME_MAX: num(Postcard.NAME_MAX),
    MOMENT_S: num(Moments.MOMENT_S),
    MOMENT_TIMERS: Moments.MOMENT_TIMERS.filter(Boolean).map(num).join(", "),
    MOMENT_KINDS: num(Object.keys(data.moments ?? {}).filter((k) => !k.startsWith("_")).length),
    MOMENT_GAMES: num(Object.entries(data.moments ?? {}).filter(([k, m]) => !k.startsWith("_") && m.game).length),
    MOMENT_LEAN_PCT: pct(Moments.LEAN_PER_POINT),
    MOMENT_LEAN_CAP_PCT: pct(Moments.LEAN_CAP),
    RISK_BASE_PCT: pct(Moments.RISK_BASE),
    RISK_PER_POINT_PCT: pct(Moments.RISK_PER_POINT),
    RISK_CAP_PCT: pct(Moments.RISK_CAP),
    TAPS: num(Minigames.TAPS),
    DILEMMA_AWAY_H: num(Dilemmas.DILEMMA_AWAY_S / 3600),
    DILEMMA_PCT: pct(Dilemmas.DILEMMA_CHANCE),
    LEAN_PCT: pct(Dilemmas.LEAN_PER_POINT),
    LEAN_CAP_PCT: pct(Dilemmas.LEAN_CAP),
    DILEMMA_LIST: Dilemmas.helpList(),
    CHESS_BASE_PCT: pct(Dilemmas.CHESS_BASE),
    CHESS_PER_WIT_PCT: pct(Dilemmas.CHESS_PER_WIT),
    CHESS_MAX_PCT: pct(Dilemmas.CHESS_MAX),
    FORECAST_LIST: (data.forecasts ?? []).map((f) => `- ${f.icon} ${Forecast.words(f)}`).join("\n"),
    RESALE_SHOPS: Object.entries(data.actions)
      .filter(([, list]) => Array.isArray(list) && list.some((a) => a.resale))
      .map(([k]) => K.kindLabel(k).split(" · ")[0]!.toLowerCase())
      .join(", "),
    JOKE_PCT: pct(Jokes.JOKE_CHANCE),
    SELL_RUN_LEFT: num(S.SELL_RUN_LEFT),
    BILL_LIST: Bills.BILLS.map((b) => `- ${b.icon} ${b.name[0]!.toUpperCase()}${b.name.slice(1)}: ${euro(b.cents)}, plus ${euro(b.perLevel)} for each level above 1`).join("\n"),
    BILLS_L1: euro(Bills.billsAt(1)),
    BILLS_L10: euro(Bills.billsAt(10)),
    BILLS_L30: euro(Bills.billsAt(30)),
    ADOPT_PCT: pct(Pet.ADOPT_CHANCE),
    PET_FOOD: euro(Pet.PET_FOOD),
    PET_MOOD_PER_H: num(Pet.PET_MOOD_PER_H),
    PET_MOOD_PER_LEVEL: num(Pet.PET_MOOD_PER_LEVEL),
    PET_KM_2: num(Pet.kmFor(2)),
    PET_KM_3: num(Pet.kmFor(3)),
    PET_MAX_LEVEL: num(Pet.PET_MAX_LEVEL),
    PET_KM_MAX: num(Pet.kmFor(Pet.PET_MAX_LEVEL)),
    DOG_FIND_PCT: pct(Pet.DOG_FIND_PER_LEVEL),
    CAT_RISK_PCT: pct(Pet.CAT_RISK_PER_LEVEL),
    PET_FAIRY_LEVEL: num(Pet.FAIRY_LEVEL),
    PET_FAIRY_PCT: pct(Pet.FAIRY_CHANCE),
    PET_FAIRY_MULT: num(Pet.FAIRY_PERK_MULT),
    PET_LIFE_MIN: num(Pet.LIFE_DAYS[0]),
    PET_LIFE_MAX: num(Pet.LIFE_DAYS[1]),
    MISSING_MOOD_PER_H: num(Pet.MISSING_MOOD_PER_H),
    PET_MISSING_H: num(Pet.MISSING_MIN / 60),
    BRICK_PCT: pct(Bricks.BRICK_CHANCE),
    BRICKS_PER_DAY: num(Bricks.BRICKS_PER_DAY),
    CREATURE_PCT: pct(Creatures.CREATURE_CHANCE),
    RIDDLE_PCT: pct(Moments.RISK_BASE),
    RIDDLE_PER_WIT_PCT: pct(Moments.RISK_PER_POINT),
    RIDDLE_CAP_PCT: pct(Moments.RISK_CAP),
    CREATURE_LIST: (data.creatures ?? []).map((c) => {
      const said = (o: Creatures.Outcome) => [o.pay ? `pays ${euro(o.pay)}` : "", Gifts.effect(o)].filter(Boolean).join(", ");
      const opts = c.moment.options.map((o) => `${o.label} (${said(c.outcomes[o.id]!)}${c.risky?.option === o.id ? `; if it fails, ${said(c.risky.miss)}` : ""})`);
      return `- ${c.icon} ${c.name}, ${c.where}: ${opts.join("; ")}. On his own he picks ${c.moment.options.find((o) => o.id === c.moment.default)!.label.toLowerCase()}.`;
    }).join("\n"),
    LEY_NEAR_M: num(Magic.LEY_NEAR_M),
    LEY_PER_KM: num(Magic.LEY_PER_KM),
    LEY_BURST: num(Magic.LEY_BURST),
    LEY_CHARM_LUCK: `+${num(Magic.LEY_CHARM.attrs!.luck!)}`,
    LEY_CHARM_MIN: num(Magic.LEY_CHARM.min),
    MAGIC_MAX: num(Magic.MAGIC_MAX),
    LEARN_PCT: pct(Magic.LEARN_CHANCE),
    SPELL_AT: num(Magic.SPELL_AT),
    SPARE_MAGIC: num(Magic.SPARE_MAGIC),
    SPELL_LIST: (data.spells ?? []).map((k) => `- ${k.icon} ${k.name}, ${num(k.cost)} Magic: ${Gifts.effect(k)}`).join("\n"),
    MIDNIGHT_SHOPS: Object.entries(data.actions)
      .filter(([, list]) => Array.isArray(list) && list.some((a) => a.midnight))
      .map(([k]) => K.kindLabel(k).split(" · ")[0]!.toLowerCase())
      .join(", "),
    ENCHANTED_MODS_MAX: num(Items.ENCHANTED_MODS_MAX),
    ENCHANTED_PCT: pct(Midnight.ENCHANTED_CHANCE),
    ENCHANTED_PRICE: num(Midnight.ENCHANTED_PRICE),
    ENCHANTED_MAGIC: num(Midnight.ENCHANTED_MAGIC),
    PORTAL_PCT: pct(Portals.PORTAL_CHANCE),
    PORTAL_GAP_DAYS: num(Portals.PORTAL_GAP_DAYS),
    GIFT_PCT: pct(Fairy.GIFT_CHANCE),
    FAIRY_PCT: pct(Fairy.FAIRY_CHANCE),
    FAIRY_GAP_DAYS: num(Fairy.FAIRY_GAP_DAYS),
    NAP_HOURS: `${num(Fairy.NAP_MIN_MIN / 60)} to ${num(Fairy.NAP_MAX_MIN / 60)}`,
    FAIRY_MOD: Object.entries(Fairy.FAIRY_MOD.stats).map(([k, v]) => (k === "magic" ? `Magic +${v} a km` : `${Inc.ATTR_NAMES[k as S.Attr]} +${v}`)).join(", "),
    STORY_MAGIC: num(Fairy.STORY_MAGIC),
    GIANT_PCT: pct(Giants.GIANT_CHANCE),
    GIANT_FX: Gifts.effect({ fx: Giants.GIANT_FX }),
    GIANT_LIST: Giants.GIANTS.map((g) => `- ${g.icon} ${g.name}: seen ${g.where}.`).join("\n"),
    ENCHANT_LIST: Items.ENCHANTMENTS.map((e) => `${e.name} (${Object.entries(e.stats).map(([k, v]) => k === "magic" ? `Magic +${v} a km` : `${Inc.ATTR_NAMES[k as S.Attr]} +${v}`).join(", ")})`).join(", "),
    TRINKET_LIST: Midnight.TRINKETS.map((t) => `- ${t.icon} ${t.name}, ${euro(t.cents)}${t.magic ? ` and ${num(t.magic)} Magic` : ""}: ${Gifts.effect(t)}`).join("\n"),
    MONUMENT_LIST: Bricks.MONUMENTS.map((m) => `- ${m.icon} A ${m.name}: ${num(m.bricks)} bricks`).join("\n"),
    LEVEL_MARKS: Chron.LEVEL_MARKS.join(", "),
    COUNTRY_MARKS: Chron.COUNTRY_MARKS.join(", "),
    TRUST_MAX: num(Bond.TRUST_MAX),
    TRUST_START: num(Bond.TRUST_START),
    KIND_DEEDS: deeds(data.actions, 1),
    RASCAL_DEEDS: deeds(data.actions, -1),
    TRUST_PER_CHECKIN: num(Bond.TRUST_PER_CHECKIN),
    TRUST_PER_GIFT: num(Bond.TRUST_PER_GIFT),
    TRUST_FADE_PER_DAY: num(Bond.TRUST_FADE_PER_DAY),
    TRUST_FADE_MAX: num(Bond.TRUST_FADE_MAX),
    LETTER_AT: Bond.LETTER_AT.join(", "),
    THANKS_PCT: pct(Bond.THANKS_CHANCE),
    WHISPERS_PER_DAY: num(Bond.WHISPERS_PER_DAY),
    HEED_MIN_PCT: pct(Bond.HEED_MIN),
    HEED_PER_TRUST_PCT: pct(Bond.HEED_PER_TRUST),
    HEED_FULL_PCT: pct(Bond.HEED_MIN + Bond.TRUST_MAX * Bond.HEED_PER_TRUST),
    NUDGE_MIN: num(Bond.NUDGE_MIN),
    EXPLORE_PULL: num(Activities.EXPLORE_PULL),
    LEAN_MIN: num(-Bond.LEAN_MAX),
    LEAN_MAX: num(Bond.LEAN_MAX),
    LEAN_AT: num(Bond.LEAN_AT),
    JUDGE_STEP: num(Bond.JUDGE_STEP),
    DEED_STEP: num(Bond.DEED_STEP),
    KIND_DEED_WEIGHT: num(Bond.KIND_DEED_WEIGHT),
    RASCAL_SELL_PCT: pct(Bond.RASCAL_SELL - 1),
    DODGE_PCT: pct(Bond.DODGE_CHANCE),
    CAUGHT_PCT: pct(Bond.CAUGHT_CHANCE),
    FINE_MULT: num(Bond.FINE_MULT),
    GIFT_LIST: Gifts.GIFTS.map((g) => `- ${g.icon} ${g.name}, ${g.cost} ☘: ${Gifts.effect(g)}`).join("\n"),
    CATCHUP_WAIT_S: num(G.CATCHUP_WAIT_MS / 1000),
    MEAL_FULLNESS: num(CityCheck.MEAL_FULLNESS),
    BED_ENERGY: num(CityCheck.BED_ENERGY),
    AIRPORT_POP: num(Trips.AIRPORT_POP),
    TOWN_POP: num(Gen.TOWN_POP),
    CITY_POP: num(Gen.CITY_POP),
    MEGA_POP: num(Gen.MEGA_POP),
    EXTRAS_TOWN: num(Gen.EXTRAS.town),
    EXTRAS_CITY: num(Gen.EXTRAS.city),
    EXTRAS_CAPITAL: num(Gen.EXTRAS.capital),
    TOWERS_CITY: num(Gen.TOWERS.city),
    TOWERS_CAPITAL: num(Gen.TOWERS.capital),
    TOWERS_MEGA: num(Gen.TOWERS_MEGA),
    TOWER_APART_KM: num(Gen.TOWER_APART_M / 1000),
    MADE_CITIES: num(G.MADE_CITIES),
    ICON_CAP: num(MapIcons.ICON_CAP.place),
    QUEST_ICON_CAP: num(MapIcons.ICON_CAP.quest),
    EVENT_ICON_CAP: num(MapIcons.ICON_CAP.event),
    SNAP_M: num(W.SNAP_M),
    WALK_KMH: kmh(Speeds.WALK),
    WALK_M_PER_MIN: String(Math.round(Speeds.WALK * 60)),
    BIKE_KMH: kmh(Speeds.BIKE),
    MOTORCYCLE_KMH: kmh(Speeds.MOTORCYCLE),
    CITY_CAR_KMH: kmh(Speeds.CAR),
    TORTOISE_KMH: kmh(Speeds.TORTOISE),
    BROOM_KMH: kmh(Speeds.BROOM),
    CARPET_KMH: kmh(Speeds.CARPET),
    DRAGON_KMH: kmh(Speeds.DRAGON),
    MOUNT_STOCK_PCT: pct(Items.MOUNT_STOCK),
    CHEAP_DRAGON: euro(cheapest("dragons")),
    GOAL_DRAGON: Items.nextVehicle("car")!.name,
    FLY_MIN_M: String(W.FLY_MIN_M),
    LAND_MAX_M: String(W.LAND_MAX_M),
    DRAGON_UPKEEP: euro(S.DRAGON_UPKEEP),
    DRAGON_TREASURE_PCT: pct(S.DRAGON_TREASURE_CHANCE),
    DRAGON_TREASURE_MIN: euro(S.DRAGON_TREASURE_MIN),
    DRAGON_TREASURE_MAX: euro(S.DRAGON_TREASURE_MAX),
    BROOM_EFFORT_PCT: pct(S.EFFORT.broom),
    CARPET_EFFORT_PCT: pct(S.EFFORT.carpet),
    DRAGON_EFFORT_PCT: pct(S.EFFORT.dragon),
    LAND_SHARE_PCT: pct(W.LAND_SHARE),
    SPEED_PER_POWER: num(Items.SPEED_PER_POWER),
    SPEED_PER_LEVEL_PCT: pct(S.SPEED_PER_LEVEL),
    TIRED_ENERGY: num(S.TIRED_ENERGY),
    BIKE_EFFORT_PCT: pct(S.EFFORT.bike),
    MOTOR_EFFORT_PCT: pct(S.EFFORT.car),
    ARRIVE_M: num(W.ARRIVE_M),
    MIN_CITY_KM: km(W.MIN_CITY_RADIUS_M),
    MAX_CITY_KM: km(W.MAX_CITY_RADIUS_M),
    MAX_SKIPS: String(W.MAX_SKIPS),
    GOAL_PEAK_M: num(Goals.GOAL_PEAK_M),
    NEAR_M: "150",
    NEAR_PCT: pct(Goals.distanceWeight(150)),
    FAR_KM: "2",
    FAR_PCT: pct(Goals.distanceWeight(2000)),
    HEADING_RATIO: num(Goals.HEADING_RATIO),
    NEED_AT: String(Activities.NEED_AT),
    MOOD_PER_H: num(S.MOOD_PER_H),
    MOOD_XP_MIN: num(S.MOOD_XP_MIN),
    MOOD_XP_MAX: num(S.MOOD_XP_MAX),
    MOOD_80_XP: String(Math.round(20 * S.moodXpMult(80))),
    DIRTY_AT: String(S.DIRTY_AT),
    DIRTY_CHARM_PCT: pct(S.DIRTY_CHARM_CUT),
    DIRTY_MOOD_PER_H: num(S.DIRTY_MOOD_PER_H),
    LUCK_RISK_PCT: pct(S.LUCK_RISK_CUT),
    LUCK_RISK_CAP_PCT: pct(S.LUCK_RISK_CAP),
    LUCK5_RISK: pct(0.2 * S.riskMult(5)),
    LUCK_RARITY_PCT: pct(S.LUCK_RARITY_PER),
    LUCK_RARITY_CAP_PCT: pct(S.LUCK_RARITY_CAP),
    FIND_PER_LUCK_PCT: pct(S.FIND_PER_LUCK),
    FIND_CAP_PCT: pct(S.FIND_CAP),
    FIND_MIN: euro(S.FIND_MIN),
    FIND_MAX: euro(S.FIND_MAX),
    LUCKY_LUCK: "+3",
    NEED_BOOST: num(Activities.NEED_BOOST),
    NEED_MAX: num(1 + Activities.NEED_BOOST),
    NEED_HALF: num(1 + Activities.NEED_BOOST * Activities.urge(Activities.NEED_AT / 2)),
    NEED_HALF_AT: String(Activities.NEED_AT / 2),
    URGE_HALF: num(Activities.urge(Activities.NEED_AT / 2)),
    URGENT_AT: String(Activities.URGENT_AT),
    BOTTOM_AT: String(Activities.BOTTOM_AT),
    SLIP_PCT: pct(Goals.URGENT_SLIP),
    URGENT_NEAR_M: num(Goals.URGENT_NEAR_M),
    FULL_FIX: String(Activities.FULL_FIX),
    SAVING_URGE: num(Activities.SAVING_URGE),
    HARM_FLOOR_PCT: pct(Activities.HARM_FLOOR),
    STRENGTH_MAX: num(Activities.STRENGTH_MAX),
    STAY_MIN: num(Activities.MAX_MINUTES),
    STREET_SQUARES: String(2 * G.STREET_RING + 1),
    MIDDLE_PCT: String(Math.round(MIDDLE * 100)),
    SICK_AT: String(Looks.SICK_AT),
    SHEET_TALL_PCT: String(Math.round(Snap.TALL * 100)),
    SHEET_CLOSE_PCT: String(Math.round(Snap.CLOSE_AT * 100)),
    HAPPY_MOOD: String(Looks.HAPPY_MOOD),
    POSE_EVERY_S: String(Looks.POSE_EVERY_S),
    LOW_MOOD: String(Looks.LOW_MOOD),
    TILE_KM: km(40_075_016 / 2 ** 14),
    CACHE_DAYS: String(Math.round(MAX_AGE_S / 86400)),
    SKINT: euro(Activities.SKINT),
    SKINT_X3: euro(3 * Activities.SKINT),
    FLAVOUR_WEIGHT: num(Activities.FLAVOUR_WEIGHT),
    SAVING_SPEND_PCT: pct(Activities.SAVING_SPEND_MULT),
    FULLNESS_PER_H: num(S.FULLNESS_PER_H),
    FULLNESS_HOURS: String(Math.round(100 / S.FULLNESS_PER_H)),
    THIRST_PER_H: num(S.THIRST_PER_H),
    THIRST_HOURS: String(Math.round(100 / S.THIRST_PER_H)),
    HYGIENE_PER_H: num(S.HYGIENE_PER_H),
    ENERGY_PER_KM: num(S.ENERGY_PER_KM),
    STARVING_PER_H: num(S.STARVING_PER_H),
    FIRST_VISIT_XP: String(S.FIRST_VISIT_XP),
    REC_STRETCH_KM: km(Rec.BRAG_FROM.stretchM),
    REC_DAY_KM: km(Rec.BRAG_FROM.dayM),
    REC_STOPS: String(Rec.BRAG_FROM.dayStops),
    REC_CENTS: euro(Rec.BRAG_FROM.cents),
    REC_NOFAINT: Rec.span(Rec.BRAG_FROM.noFaintS),
    HOSPITAL_FEE: euro(S.HOSPITAL_FEE),
    WAKE_HEALTH: num(S.WAKE_HEALTH),
    BAG_SIZE: String(S.BAG_SIZE),
    KEEP_CENTS: euro(S.KEEP_CENTS),
    SELL_PCT: pct(S.SELL_SHARE),
    SELL_PER_CHA_PCT: pct(S.SELL_PER_CHA),
    SELL_100_CHA0: euro(Math.round(10000 * S.SELL_SHARE)),
    SELL_100_CHA5: euro(Math.round(10000 * S.SELL_SHARE * (1 + 5 * S.SELL_PER_CHA))),
    START_CENTS: euro(s.cents),
    EXAMPLE_PRICE: euro(120),
    CHEAP_BIKE: euro(cheapest("bicycles")),
    CHEAP_CAR: euro(cheapest("cars")),
    CHEAP_SCOOTER: euro(cheapest("motorcycles")),
    GOAL_BIKE: Items.nextVehicle("")!.name,
    GOAL_SCOOTER: Items.nextVehicle("bike")!.name,
    GOAL_CAR: Items.nextVehicle("motorcycle")!.name,
    GOAL_SHOP: num(Activities.GOAL_SHOP_WEIGHT),
    GOAL_SHOP_PULL: num(Activities.GOAL_SHOP_PULL),
    DEALER_OFFERS: String(S.DEALER_OFFERS),
    HOSPITAL_MAX_PCT: pct(S.HOSPITAL_MAX_SHARE),
    WAGE_LEVEL_PCT: pct(S.WAGE_PER_LEVEL),
    WAGE_ATTR_PCT: pct(S.WAGE_PER_ATTR),
    WAGE_ATTR_X10: pct(10 * S.WAGE_PER_ATTR),
    WAGE_LV11: `${num(1 + 10 * S.WAGE_PER_LEVEL)} times`,
    WAGE_LV30: `${num(1 + 29 * S.WAGE_PER_LEVEL)} times`,
    BRONZE_SWORD: euro(Items.build(Items.KINDS.weapons[0]!, Items.MATERIALS[2]!, []).price),
    XP_LV1: String(S.xpToNext(1)),
    XP_LV2: String(S.xpToNext(2)),
    XP_LV10: String(S.xpToNext(10)),
    COUNTRY_PCT: pct(Trips.COUNTRY_CHANCE),
    CITY_PCT: pct(Trips.CITY_CHANCE),
    NO_PLACES_COUNTRY_PCT: pct(Trips.COUNTRY_CHANCE * Trips.NO_PLACES_BOOST),
    NO_PLACES_CITY_PCT: pct(Trips.CITY_CHANCE * Trips.NO_PLACES_BOOST),
    SAME_CITY_KM: km(Trips.SAME_CITY_M),
    MIN_TRIP_CITY_KM: km(Trips.MIN_CITY_RADIUS_M),
    MAX_TRIP_CITY_KM: km(Trips.MAX_CITY_RADIUS_M),
    PLANE_FROM_KM: km(Trips.PLANE_FROM_M),
    PLANE_ALWAYS_KM: km(Trips.PLANE_ALWAYS_M),
    MAX_ROAD_KM: km(Trips.MAX_ROAD_M),
    AIRPORT_KM: km(Trips.AIRPORT_REACH_M),
    AIRPORT_COUNT: String(data.airports.length),
    BUS_KMH: kmh(Speeds.BUS),
    BIKE_ICON: Trips.MODES.bike.icon,
    WALK_ICON: Trips.MODES.walk.icon,
    LONG_WALK_MIN_KM: km(Trips.LONG_WALK_MIN_M),
    LONG_WALK_MAX_KM: km(Trips.LONG_WALK_MAX_M),
    LONG_WALK_PCT: pct(Trips.LONG_WALK_CHANCE),
    LONG_WALK_MAX_H: num(Trips.LONG_WALK_MAX_S / 3600),
    HOSTEL_KM: km(Trips.HOSTEL_EVERY_M),
    HOSTEL_PRICE: euro(Trips.HOSTEL_CENTS),
    LONG_WALK_XP_PER_KM: num(Trips.LONG_WALK_XP_PER_KM),
    LONG_WALK_MOOD: num(Trips.LONG_WALK_MOOD),
    FERRY_ICON: Trips.MODES.ferry.icon,
    TRAIN_ICON: Trips.MODES.train.icon,
    HITCH_ICON: Trips.MODES.hitch.icon,
    TRAIN_KMH: kmh(Speeds.TRAIN),
    FERRY_KMH: kmh(Speeds.FERRY),
    BIKE_ROAD_KMH: kmh(Speeds.BIKE_ROAD),
    HITCH_KMH: kmh(Speeds.HITCH),
    TRAIN_PER_KM: euro(toCents(Trips.TRAIN_PER_KM)),
    FERRY_PER_KM: euro(toCents(Trips.FERRY_PER_KM)),
    TRAIN_FROM_KM: km(Trips.TRAIN_FROM_M),
    SLEEPER_FROM_KM: km(Trips.SLEEPER_FROM_M),
    FERRY_PCT: pct(Trips.FERRY_CHANCE),
    FERRY_MAX_KM: km(Trips.FERRY_MAX_M),
    CYCLE_MAX_KM: km(Trips.CYCLE_MAX_M),
    BIKE_EFFORT_KM: num(S.ENERGY_PER_KM * S.EFFORT.bike),
    HITCH_BELOW: euro(Trips.HITCH_BELOW),
    HITCH_BAD_PCT: pct(Trips.HITCH_BAD),
    HITCH_GOOD_PCT: pct(Trips.HITCH_GOOD),
    HITCH_BAD_FX: Gifts.effect({ fx: Trips.HITCH_BAD_FX }),
    HITCH_GOOD_FX: Gifts.effect({ fx: Trips.HITCH_GOOD_FX }),
    CAR_ROAD_KMH: kmh(Speeds.CAR_ROAD),
    PLANE_KMH: kmh(Speeds.PLANE),
    RIDE_SPEEDUP: String(Trips.RIDE_SPEEDUP),
    RIDE_MAX_MIN: String(Trips.RIDE_MAX_S / 60),
    BUS_100_MIN: String(Math.round(Trips.rideS("bus", 100_000) / 60)),
    BUS_300_MIN: String(Math.round(Trips.rideS("bus", 300_000) / 60)),
    BUS_PER_KM: euro(toCents(Trips.BUS_PER_KM)),
    PLANE_BASE: euro(toCents(Trips.PLANE_BASE)),
    PLANE_PER_KM: euro(toCents(Trips.PLANE_PER_KM)),
    FUEL_PER_KM: euro(toCents(Trips.FUEL_PER_KM)),
    ROAD_FACTOR: num(Trips.ROAD_FACTOR),
    BUS_300: euro(Trips.fare("bus", 300_000 * Trips.ROAD_FACTOR)),
    PLANE_1500: euro(Trips.fare("plane", 1_500_000)),
    CITY_COUNT: String(data.cities.length),
    COUNTRY_COUNT: String(new Set(data.cities.map((c) => c.code)).size),
    HISTORY_SIZE: String(History.SIZE),
    TRAIL_KM: String(Math.round((History.MAX_TRAIL * History.TRAIL_STEP_M) / 1000)),
    DEBUG_SIZE: String(DebugLog.SIZE),
    MAX_WARNINGS: String(Problems.MAX_WARNINGS),
    MAX_ERRORS: String(Problems.MAX_ERRORS),
    MAX_SEVERE: String(Problems.MAX_SEVERE),
    TRIVIA_KM: String(CityFacts.RADIUS_KM),
    TRIVIA_TWINS: String(CityFacts.MAX_TWINS),
    TRIVIA_WIT: num(CityFacts.FX.wit),
    TRIVIA_XP: String(CityFacts.FX.xp),
    MOD_PRICE_PCT: pct(Items.MOD_PRICE),
    POWER_TO_STAT: num(Items.POWER_TO_STAT),
    PLACE_KINDS: String(Object.keys(data.actions).filter((k) => !k.startsWith("_")).length),
    ACTION_COUNT: String(sum(data.actions)),
    NAP_BELOW: String(data.actions.park?.find((a) => a.name === "Nap under a tree")?.needs?.below?.energy ?? ""),
    FLAVOUR_COUNTRIES: String(Object.keys(data.flavour).length),
    KIT_LIST: Kit.KIT.map((k) => {
      const fx = [...Object.entries(k.buff.per_h ?? {}).map(([m, v]) => `${m} +${v} an hour`), ...Object.entries(k.buff.attrs ?? {}).map(([a, v]) => `${Inc.ATTR_NAMES[a as S.Attr]} +${v}`)];
      const when = k.meter ? `when his ${k.meter} is under ${Kit.PACK_BELOW}` : "when the trip goes abroad";
      return `- ${k.name} (${euro(k.cents)}), ${when}: ${fx.join(", ")} for ${k.buff.min / 60} hours`;
    }).join("\n"),
    DEG_PER_ZONE: num(Trips.DEG_PER_ZONE),
    JET_LAG_H_PER_ZONE: num(Trips.JET_LAG_H_PER_ZONE),
    JET_LAG_MAX_H: num(Trips.JET_LAG_MAX_H),
    JET_LAG_ENERGY_PER_H: num(Trips.JET_LAG_ENERGY_PER_H),
    JET_LAG_XP_PCT: pct(1 - Trips.JET_LAG_XP),
    BORDER_COUNTRIES: String(Object.keys(data.borders?.words ?? {}).length),
    WORD_COUNTRIES: num(Object.keys(data.words?.countries ?? {}).length),
    WORD_LANGUAGES: num(Object.keys(data.words?.languages ?? {}).length),
    WORD_EACH: num(Math.round(Object.values(data.words?.languages ?? {}).reduce((n, l) => n + l.words.length, 0) / Math.max(Object.keys(data.words?.languages ?? {}).length, 1))),
    WORD_PCT: pct(Words.LEARN_CHANCE),
    WORD_WIT: num(Words.WORD_WIT),
    WORD_XP: num(Words.WORD_XP),
    CITY_CARDS_PER_COUNTRY: String(CC.CARDS_PER_COUNTRY),
    CITY_CARD_TOTAL: CC.pool(data.cities).cards.length.toLocaleString("en-GB"),
    UNCOMMON_CITY_COUNT: String(CC.UNCOMMON_UP_TO - CC.RARE_UP_TO),
    PACK_SIZE: String(CC.PACK_SIZE),
    CARD_SHOPS: CC.CARD_SHOP_NAMES,
    PACK_PRICE: euro(toCents(Object.values(data.actions).flatMap((list) => (Array.isArray(list) ? list : [])).find((a) => a.pack)?.cost ?? 0)),
    PULL_RARE_PCT: pct(CC.PULL_ODDS.find(([r]) => r === "Rare")![1]),
    PULL_UNCOMMON_PCT: pct(CC.PULL_ODDS.find(([r]) => r === "Uncommon")![1]),
    PULL_COMMON_PCT: pct(CC.PULL_ODDS.find(([r]) => r === "Common")![1]),
    SPARE_COMMON: euro(CC.SPARE_CENTS.Common ?? 0),
    SPARE_UNCOMMON: euro(CC.SPARE_CENTS.Uncommon ?? 0),
    SPARE_RARE: euro(CC.SPARE_CENTS.Rare ?? 0),
    FOIL_MULT: String(CC.FOIL_MULT),
    GOLD_MULT: String(CC.GOLD_MULT),
    SET_CHARM: String(CC.SET_CHARM),
    LANDMARK_KINDS: K.LANDMARK_CLASSES.map((c) => K.kindLabel(c).toLowerCase()).join(", "),
    GOLD_PCT: pct(K.GOLD_CHANCE),
    FOIL_PCT: pct(K.FOIL_CHANCE),
    DEX_XP_COMMON: String(K.DEX_XP.Common),
    DEX_XP_UNCOMMON: String(K.DEX_XP.Uncommon),
    DEX_XP_RARE: String(K.DEX_XP.Rare),
    DEX_XP_LEGENDARY: String(K.DEX_XP.Legendary),
    DEX_COMMON_MIN: band("Common"),
    DEX_UNCOMMON_MIN: band("Uncommon"),
    DEX_RARE_MIN: band("Rare"),
    CARD_RARE_RANK: String(K.RARE_RANK),
    CARD_UNCOMMON_RANK: String(K.UNCOMMON_RANK),
    DEX_KINDS: String(Object.keys(data.dex ?? {}).length),
    SOUVENIR_PCT: pct(K.SOUVENIR_CHANCE),
    SOUVENIR_COUNTRIES: String(Object.keys(K.SOUVENIRS).length),
    SOUVENIRS_PER_CUT: String(K.SOUVENIRS_PER_CUT),
    FARE_CUT_PCT: pct(K.FARE_CUT),
    FARE_CUT_MAX_PCT: pct(K.FARE_CUT_MAX),
    CRAWL_LIST: K.CRAWLS.map((c) => `- ${c.icon} ${c.name}: ${c.need} different ${crawlKinds(c)} ${c.per === "day" ? "in a day" : c.per === "city" ? "in one city" : "in all"}, then ${K.perkText(c.perk)} at each one he visits,`)
      .join("\n")
      .replace(/,$/, "."),
    TREASURED_COUNTRIES: String(Items.TREASURED_COUNTRIES),
    TREASURED_KEEP: String(S.TREASURED_KEEP),
    CARDS_SHOWN: String(K.CARDS_SHOWN),
    FEAT_LIST: Collection.FEATS.map(featLine).join("\n").replace(/,$/, "."),
    FLAVOUR_ACTIONS: String(Object.values(data.flavour).reduce((n, t) => n + sum(t), 0)),
    SKY_ACTIONS: String(Object.values(data.actions).reduce((n, list) => n + list.filter((a) => a.needs?.season || a.needs?.weather).length, 0)),
    SUNRISE_AT: `${String(Sky.SUNRISE_H).padStart(2, "0")}:00`,
    SUNSET_AT: `${String(Sky.SUNSET_H).padStart(2, "0")}:00`,
    HALF_DAY_H: num(Sky.SUNSET_H - Sky.SUNRISE_H),
    OPEN_H: `${String(Opening.OPEN_H).padStart(2, "0")}:00`,
    CLOSE_H: `${String(Opening.CLOSE_H).padStart(2, "0")}:00`,
    HOT_C: num(Sky.HOT_C),
    HOT_THIRST: num(Sky.HOT_THIRST),
    COLD_C: num(Sky.COLD_C),
    COLD_ENERGY_PER_H: num(Sky.COLD_ENERGY_PER_H),
    WET_MOOD_PER_H: num(Sky.WET_MOOD_PER_H),
    SUNNY_MOOD_PER_H: num(Sky.SUNNY_MOOD_PER_H),
    SUNNY_MIN_C: num(Sky.SUNNY_MIN_C),
    SNOW_SPEED_PCT: pct(Sky.SNOW_SPEED),
    WET_OUTDOOR: num(Sky.WET_OUTDOOR),
    WET_SHELTER: num(Sky.WET_SHELTER),
    HOT_COOL: num(Sky.HOT_COOL),
    MIN_DAY_H: num(Sky.MIN_DAY_H),
    MAX_DAY_H: num(Sky.MAX_DAY_H),
    TROPICS_LAT: num(Sky.TROPICS_LAT),
    NIGHT_SHADE_PCT: pct(Sky.NIGHT_SHADE),
    NIGHT_DEG: num(-Sky.NIGHT_DEG),
    WEATHER_TTL_MIN: num(Weather.WEATHER_TTL_MS / 60_000),
    TENSION_MAX: num(Story.TENSION_MAX),
    STORY_RATES: Story.STYLES.map((k) => `${Story.STYLE[k].icon} ${Story.STYLE[k].name} ${num(Story.STYLE[k].per_h)}`).join(", "),
    STORY_BAD: Story.STYLES.map((k) => `${Story.STYLE[k].name} ${pct(Story.STYLE[k].bad)}`).join(", "),
    WEALTH_STEP: euro(Story.WEALTH_STEP),
    WEALTH_CAP: num(Story.WEALTH_CAP),
    FIRE_AT: num(Story.FIRE_AT),
    FIRE_MAX_PCT: pct(Story.FIRE_MAX),
    LUCKY_H: num(Story.LUCKY_H),
    KEEP_AFTER_GOOD_PCT: pct(Story.KEEP_AFTER_GOOD),
    RECENT_INCIDENTS: num(Story.RECENT),
    INCIDENT_COUNT: String(incidents.length),
    GOOD_INCIDENTS: String(incidents.filter((c) => c.tone === "good").length),
    BAD_INCIDENTS: String(incidents.filter((c) => c.tone === "bad").length),
    ODD_INCIDENTS: String(incidents.filter((c) => c.tone === "odd").length),
    CHOICE_INCIDENTS: String(incidents.filter((c) => c.options).length),
    LOSS_CAP_PCT: pct(Inc.LOSS_CAP_SHARE),
    BOARD_PLACES: num(Quests.BOARD_PLACES),
    BOARD_MIN: num(Quests.BOARD_MIN),
    BOARD_MAX: num(Quests.BOARD_MAX),
    BOARD_TOWN_POP: num(Quests.BOARD_TOWN_POP),
    BOARD_BIG_POP: num(Quests.BOARD_BIG_POP),
    BOARD_MID: num(Quests.boardSize(Quests.BOARD_MID_POP)),
    BOARD_MID_POP: num(Quests.BOARD_MID_POP),
    STEPS_MORE_MIN: num(Math.min(...bank.quests.map((q) => q.steps.length)) - 1),
    STEPS_MORE_MAX: num(Math.max(...bank.quests.map((q) => q.steps.length)) - 1),
    QUEST_KINDS: String(bank.quests.length),
    FANTASY_KINDS: String(bank.quests.filter((q) => q.fantasy).length),
    FANTASY_PCT: pct(Quests.FANTASY_SHARE),
    QUEST_VARIANTS: num(Math.floor(bank.quests.reduce((n, q) => n + q.items.length * bank.names.length * (q.twists.length + 1), 0) / 1000) * 1000),
    QUEST_EVERY_MIN: num(Quests.QUEST_EVERY_MIN),
    QUEST_EVERY_MAX: num(Quests.QUEST_EVERY_MAX),
    STEP_CHOICES: num(Quests.STEP_CHOICES),
    STEP_MIN: num(Quests.STEP_MIN),
    WORSE_PCT: pct(Quests.WORSE_SHARE),
    LOG_MAX: num(Quests.LOG_MAX),
    CARD_RECENT: num(Quests.CARD_RECENT),
    EVENT_CHANCE_PCT: pct(Quests.EVENT_CHANCE),
    EVENT_NEAR_KM: num(Quests.EVENT_NEAR_M / 1000),
    EVENT_MAX: num(Quests.EVENT_MAX),
    EVENT_KINDS: String(bank.events.length),
    FOLLOW_KINDS: String(bank.events.filter((e) => e.follow).length),
    FOLLOW_PCT: pct(Quests.FOLLOW_CHANCE),
    LEGEND_COUNT: String(incidents.filter((c) => c.legend).length),
    LEGEND_WEIGHT: num(Inc.LEGEND_WEIGHT),
    RIVAL_ICON: Rival.RIVAL_ICON,
    RIVAL_NAME: Rival.RIVAL_NAME,
    RIVAL_TOWN_PCT: pct(Rival.IN_TOWN_CHANCE),
    RIVAL_MEET_PCT: pct(Rival.MEET_CHANCE),
    HIS_PER_LEVEL: num(Rival.HIS_PER_LEVEL),
    RIVAL_PER_LEVEL: num(Rival.RIVAL_PER_LEVEL),
    RIVAL_START_LEVEL: num(Rival.START_LEVEL),
    WIN_FX: Gifts.effect({ fx: Rival.WIN_FX }),
    LOSE_FX: Gifts.effect({ fx: Rival.LOSE_FX }),
    FRIENDLY_FX: Gifts.effect({ fx: Rival.FRIENDLY_FX }),
    FRIENDLY_PCT: pct(Rival.FRIENDLY_BASE),
    FRIENDLY_PER_CHA_PCT: pct(Rival.FRIENDLY_PER_CHA),
    FRIENDLY_CAP_PCT: pct(Rival.FRIENDLY_CAP),
    FEELING_MAX: num(Rival.FEELING_MAX),
    FEELING_AT: num(Rival.FEELING_AT),
    FEELING_STEP: num(Rival.FEELING_STEP),
    SEEN_MIN: num(Rival.SEEN_MIN),
    FRIEND_NEW_PCT: pct(Friends.NEW_CHANCE),
    FRIEND_SEE_PCT: pct(Friends.SEE_CHANCE),
    HEARTS_MAX: num(Friends.HEARTS_MAX),
    MEET_UP_AT: num(Friends.MEET_UP_AT),
    MEET_UP_PCT: pct(Friends.MEET_UP_CHANCE),
    FRIENDS_PER_CITY: num(Friends.PER_CITY),
    COMPANION_PCT: pct(Friends.COMPANION_CHANCE),
    SPLIT_PCT: pct(Friends.SPLIT),
    COMPANION_STOPS: num(Friends.COMPANION_STOPS),
    FRIENDS_SHOWN: num(Friends.SHOWN),
    WORK_CARD_PCT: pct(Work.CARD_CHANCE),
    SHIFT_MIN: num(Work.SHIFT_MIN),
    WORK_WIN_BASE_PCT: pct(Work.WIN_BASE),
    WORK_WIN_PER_PCT: pct(Work.WIN_PER_POINT),
    WORK_WIN_MAX_PCT: pct(Work.WIN_MAX),
    WORK_CARD_LIST: Work.helpList(),
    CLUB_JOIN_AT: num(Clubs.JOIN_AT),
    CLUB_INVITE_PCT: pct(Clubs.INVITE_CHANCE),
    CLUB_MAX: num(Clubs.MAX_CLUBS),
    CLUB_NIGHT_H: num(Clubs.NIGHT_H),
    CLUB_LIST: Clubs.helpList(),
    NEWS_PCT: pct(Townies.NEWS_CHANCE),
    NEWS_AT: num(Townies.NEWS_AT),
    PARTY_AT: num(Anniv.PARTY_AT),
    PARTY_MAX: num(Anniv.PARTY_MAX),
    PARTY_MOOD: num(Anniv.PARTY_MOOD),
    GREAT_MIN_PCT: pct(Anniv.GREAT_MIN),
    GLOW_H: num(Anniv.GLOW_MIN / 60),
    GLOW_PER_H: num(Anniv.GLOW_PER_H),
    ALONE_MOOD: num(Anniv.ALONE_MOOD),
    MONTH_MOOD: num(Anniv.MONTH_MOOD),
    INC_LEAN_PCT: pct(Inc.LEAN_PER_POINT),
    INC_LEAN_CAP_PCT: pct(Inc.LEAN_CAP),
    GUARD_LIST: S.ATTRS.map((a) => [a, incidents.filter((c) => c.guard?.attr === a)] as const)
      .filter(([, cs]) => cs.length)
      .map(([a, cs]) => `- ${Inc.ATTR_NAMES[a]}: ${cs.map((c) => `${c.icon} ${Inc.bare(c)} (at ${num(c.guard!.at)})`).join("; ")}`)
      .join("\n"),
  };
  for (const m of S.METERS) v[`START_${m.toUpperCase()}`] = String(s.meters[m]);
  const rolls = [0, ...Items.MOD_ROLLS, 1];
  Items.RARITY.forEach((_, i) => (v[`MODS${i}_PCT`] = pct(rolls[i + 1]! - rolls[i]!)));
  const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
  for (const [t, [a, b]] of Object.entries(S.TIMES)) v[`TIME_${t.toUpperCase()}`] = `${hh(a)}-${hh(b)}`;
  v.FAIRY_DAWN = `${hh(Fairy.FAIRY_FROM_H)}-${hh(Fairy.FAIRY_TO_H)}`;
  return v;
}
