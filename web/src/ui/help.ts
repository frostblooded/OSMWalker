// The in-game Help: data/help.txt split into sections and pages, with
// {NAME} placeholders filled from the game's own numbers so the text never
// goes stale. "# Title" starts a section, "## Title {id}" a page, and the
// lines after it are the page's text. Fetched only when Help first opens.
import * as Activities from "../core/activities";
import * as CityFacts from "../core/cityFacts";
import * as DebugLog from "../core/debugLog";
import * as History from "../core/history";
import * as Items from "../core/items";
import * as Problems from "../core/problems";
import * as Speeds from "../core/speeds";
import * as S from "../core/stats";
import * as Trips from "../core/trips";
import * as W from "../core/walker";
import type { GameData } from "../game/game";
import * as G from "../game/game";
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

export const fill = (text: string, vals: Record<string, string>) => text.replace(/\{([A-Z0-9_]+)\}/g, (m, k: string) => vals[k] ?? m);

export const build = (text: string, data: GameData) => parse(fill(text, values(data)));

/** Shortest form of a number: 0.5, 2, 1.3. */
const num = (n: number) => String(Math.round(n * 100) / 100);
const pct = (share: number) => `${num(share * 100)}%`;
const kmh = (mps: number) => String(Math.round(mps * 3.6));
const km = (m: number) => num(m / 1000);

export function values(data: GameData): Record<string, string> {
  const s = new S.Stats();
  const sum = (t: Activities.ActionTable) => Object.values(t).reduce((n, l) => n + l.length, 0);
  const v: Record<string, string> = {
    SEARCH_MIN_CHARS: String(MIN_CHARS),
    MAX_STEP_S: num(G.MAX_STEP_S),
    SAVE_EVERY_S: num(G.SAVE_EVERY_S),
    WALK_KMH: kmh(Speeds.WALK),
    WALK_M_PER_MIN: String(Math.round(Speeds.WALK * 60)),
    BIKE_KMH: kmh(Speeds.BIKE),
    MOTORCYCLE_KMH: kmh(Speeds.MOTORCYCLE),
    CITY_CAR_KMH: kmh(Speeds.CAR),
    SPEED_PER_POWER: num(Items.SPEED_PER_POWER),
    SPEED_PER_LEVEL_PCT: pct(S.SPEED_PER_LEVEL),
    TIRED_ENERGY: num(S.TIRED_ENERGY),
    BIKE_EFFORT_PCT: pct(S.EFFORT.bike),
    MOTOR_EFFORT_PCT: pct(S.EFFORT.car),
    ARRIVE_M: num(W.ARRIVE_M),
    MIN_CITY_KM: km(W.MIN_CITY_RADIUS_M),
    MAX_CITY_KM: km(W.MAX_CITY_RADIUS_M),
    MAX_SKIPS: String(W.MAX_SKIPS),
    GOAL_PEAK_M: num(W.GOAL_PEAK_M),
    NEAR_M: "150",
    NEAR_PCT: pct(W.distanceWeight(150)),
    FAR_KM: "2",
    FAR_PCT: pct(W.distanceWeight(2000)),
    HEADING_RATIO: num(W.HEADING_RATIO),
    NEED_AT: String(Activities.NEED_AT),
    NEED_MAX: num(1 + Activities.NEED_BOOST),
    NEED_HALF: num(1 + Activities.NEED_BOOST / 2),
    STAY_MIN: num(Activities.MAX_MINUTES),
    STREET_SQUARES: String(2 * G.STREET_RING + 1),
    TILE_KM: km(40_075_016 / 2 ** 14),
    CACHE_DAYS: String(Math.round(MAX_AGE_S / 86400)),
    SKINT: String(Activities.SKINT),
    SKINT_X3: String(3 * Activities.SKINT),
    FLAVOUR_WEIGHT: num(Activities.FLAVOUR_WEIGHT),
    SAVING_EARN: `+${num(Activities.SAVING_EARN_WEIGHT)}`,
    SAVING_SPEND_PCT: pct(Activities.SAVING_SPEND_MULT),
    FULLNESS_PER_H: num(S.FULLNESS_PER_H),
    FULLNESS_HOURS: String(Math.round(100 / S.FULLNESS_PER_H)),
    THIRST_PER_H: num(S.THIRST_PER_H),
    THIRST_HOURS: String(Math.round(100 / S.THIRST_PER_H)),
    HYGIENE_PER_H: num(S.HYGIENE_PER_H),
    ENERGY_PER_KM: num(S.ENERGY_PER_KM),
    STARVING_PER_H: num(S.STARVING_PER_H),
    FIRST_VISIT_XP: String(S.FIRST_VISIT_XP),
    HOSPITAL_FEE: String(S.HOSPITAL_FEE),
    WAKE_HEALTH: num(S.WAKE_HEALTH),
    BAG_SIZE: String(S.BAG_SIZE),
    KEEP_COINS: String(S.KEEP_COINS),
    SELL_PCT: pct(S.SELL_SHARE),
    START_COINS: String(s.coins),
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
    CAR_ROAD_KMH: kmh(Speeds.CAR_ROAD),
    PLANE_KMH: kmh(Speeds.PLANE),
    BUS_PER_KM: num(Trips.BUS_PER_KM),
    PLANE_BASE: num(Trips.PLANE_BASE),
    PLANE_PER_KM: num(Trips.PLANE_PER_KM),
    FUEL_PER_KM: num(Trips.FUEL_PER_KM),
    ROAD_FACTOR: num(Trips.ROAD_FACTOR),
    BUS_300: String(Trips.fare("bus", 300_000 * Trips.ROAD_FACTOR)),
    PLANE_1500: String(Trips.fare("plane", 1_500_000)),
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
    FLAVOUR_COUNTRIES: String(Object.keys(data.flavour).length),
    FLAVOUR_ACTIONS: String(Object.values(data.flavour).reduce((n, t) => n + sum(t), 0)),
  };
  for (const m of S.METERS) v[`START_${m.toUpperCase()}`] = String(s.meters[m]);
  const rolls = [0, ...Items.MOD_ROLLS, 1];
  Items.RARITY.forEach((_, i) => (v[`MODS${i}_PCT`] = pct(rolls[i + 1]! - rolls[i]!)));
  const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
  for (const [t, [a, b]] of Object.entries(S.TIMES)) v[`TIME_${t.toUpperCase()}`] = `${hh(a)}-${hh(b)}`;
  return v;
}
