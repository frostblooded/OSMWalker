// Quests and world events, the story at the heart of his life. Each city has
// a board of quests (from 2 in a town to 30 in a capital), drawn from a bank
// of quest kinds in data/quests.json, each filled with a named local, an item,
// a twist and the city's real places, so the same kind reads as a new quest;
// capitals also have their own quests (data/city-quests.json) about named
// landmarks, dealt first. Every QUEST_EVERY_MIN to QUEST_EVERY_MAX stops he
// takes one on and does its steps back to back, stopping only for an urgent
// need; at its middle step it goes on or fails, ending early with no
// reward. World events (Guild Wars 2's dynamic events) pop up at real
// places near him with a timer: he joins one when he is free, it goes well
// or badly, and either way a follow-up may come next; one he misses plays
// out without him. Nothing here waits for you. Pure; Stats owns one Quests,
// and the game and the catch-up both call questGoal before a goal and
// questStop at each stop.
import { anyUrgent } from "./activities";
import { distanceM } from "./geo";
import * as Items from "./items";
import { leanShare } from "./incidents";
import { signed, toCents } from "./money";
import { BRIDGE } from "./ofm";
import { isOpen } from "./opening";
import type { Rng } from "./rng";
import { inTime, type Attr, type Fx, type Place, type Stats, type TimeOfDay } from "./stats";
import { isSkill, QUEST_PRACTICE_MIN, type Skill } from "./skills";
import type { LatLon } from "./trips";

/** Stops between quests: he takes the next one after this many, picked between the two. */
export const QUEST_EVERY_MIN = 3;
export const QUEST_EVERY_MAX = 4;
/** Quests on a board: a town of TOWN_POP or fewer has the least, a city of BIG_POP or more the most, a log scale between. */
export const BOARD_MIN = 2;
export const BOARD_MAX = 30;
export const BOARD_TOWN_POP = 20_000;
export const BOARD_BIG_POP = 2_000_000;
/** A mid-sized city, for Help's example of the sliding scale. */
export const BOARD_MID_POP = 300_000;
/** A board is rolled once this many places of the city (bridges aside) are loaded, one of them where a quest can start. */
export const BOARD_PLACES = 20;
/** Share of the board that may be light-fantasy quests. */
export const FANTASY_SHARE = 0.25;
/** Minutes a quest step or an event takes him. */
export const STEP_MIN = 5;
/** A step's place is picked among the nearest this many that fit, so it is never across town. */
export const STEP_CHOICES = 6;
/** Chance per stop of a new world event near him, while fewer than EVENT_MAX run. */
export const EVENT_CHANCE = 0.12;
export const EVENT_MAX = 2;
/** World events start at places this close to him, and he joins one this close. */
export const EVENT_NEAR_M = 1200;
/** Chance a follow-up event comes after one ends. */
export const FOLLOW_CHANCE = 0.6;
/** A quest gets past its middle step at even odds, plus his leaning attribute's share (see incidents.ts leanShare); else it fails there. An event goes well at the same odds. */
export const GOOD_BASE = 0.5;
/** Quests he remembers having done, so they don't come back. */
export const DONE_MAX = 1000;
/** Quests and events kept in his log. */
export const LOG_MAX = 40;
/** Recent quests and events the Stats card shows. */
export const CARD_RECENT = 2;

/** What a quest or event gives: money, XP, gains, an item, practice in a `skill` (see skills.ts) and `lang` hours in the local language (see languages.ts). */
export type Reward = { eur?: number | [number, number]; xp?: number; fx?: Fx; item?: Items.Kind; skill?: Skill; lang?: number };
/** One step: where (one of the named landmarks in `name` when one is loaded, for a city's own quests, else a place of the actions.json kinds in `at`, class or class/subclass) and what he does, one line picked from `say`. */
export type Step = { at: string[]; name?: string[]; say: string[] };
export type QuestKind = {
  id: string;
  icon: string;
  title: string;
  /** Light fantasy: rarer, see FANTASY_SHARE. */
  fantasy?: boolean;
  /** Only on the board while he leans this way (see repute.ts). */
  side?: "kind" | "rascal";
  /** A city's own quest ("Paris, France"): only on that city's board, dealt before the others, and done once for good. */
  city?: string;
  time?: TimeOfDay;
  /** {ITEM} in the lines is one of these. */
  items: string[];
  /** The first step is where the quest giver is. */
  steps: Step[];
  /** Halfway through, one of these may turn the story; that middle step is also where the quest goes on or fails. */
  twists: string[];
  /** The attribute that makes it go well. */
  lean: Attr;
  good: string[];
  worse: string[];
  reward: Reward;
};
export type Outcome = { say: string; eur?: number | [number, number]; xp?: number; fx?: Fx; skill?: Skill; lang?: number };
export type EventKind = {
  id: string;
  icon: string;
  title: string;
  at: string[];
  time?: TimeOfDay;
  /** Minutes it runs for, between the two. */
  min: [number, number];
  text: string[];
  lean: Attr;
  win: Outcome;
  lose: Outcome;
  /** What word says when it played out without him. */
  missed: string;
  /** Follow-up events by how it ended. */
  next?: { win?: string; lose?: string };
  /** Comes only as a follow-up. */
  follow?: boolean;
  /** A touch of magic (about one event in four). */
  fantasy?: boolean;
};
export type Bank = { names: string[]; quests: QuestKind[]; events: EventKind[] };

/** A place as a quest remembers it. */
export type Spot = { name: string; class: string; subclass: string; lat: number; lon: number };
/** A quest on the board: its kind and the variant drawn for it. */
export type Offer = { key: string; kind: string; giver: string; item: number; twist: number; at: Spot };
export type Active = Offer & { step: number; target: Spot | null };
export type LiveEvent = { id: string; kind: string; at: Spot; ends: number; line: number };
export type LogEntry = { icon: string; title: string; city: string; t: number; good: boolean; event?: boolean };

export const isKind = (p: Pick<Place, "class" | "subclass">, keys: readonly string[]) => keys.includes(p.class) || keys.includes(`${p.class}/${p.subclass}`);
export const spotOf = (p: Place | Spot): Spot => ({ name: p.name, class: p.class, subclass: p.subclass, lat: p.lat, lon: p.lon });
/** True when `p` is the place `s` (same name, a few meters apart). */
export const isAt = (p: Pick<Place, "name" | "lat" | "lon">, s: Spot) => p.name === s.name && distanceM(p.lat, p.lon, s.lat, s.lon) < 50;
/** The real place `s` names, with its rank and flags; a stale one (from an older load) counts as made up, so it gives no first-visit XP or cards. */
const placeOf = (s: Spot, places: readonly Place[]): Place => places.find((p) => isAt(p, s)) ?? { ...s, rank: 1, made: true };
/** False while `s` is shut by the sky he lives under (opening.ts); true with no sky. */
const openNow = (stats: Stats, s: Pick<Place, "class" | "subclass">) => !stats.sky || isOpen(s, stats.sky.clock, stats.sky.holiday);

/** The places that suit `step`: its named landmarks (of its kinds) when any is loaded, else any place of its kinds. */
export function stepPlaces(step: Step, places: readonly Place[]): Place[] {
  const kind = places.filter((p) => isKind(p, step.at));
  const names = step.name?.map(fold);
  const named = names ? kind.filter((p) => names.some((n) => fold(p.name).includes(n))) : [];
  return named.length ? named : kind;
}

/** Lower case without accents, so "Bogotá" and "Bogota" match. */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** A start this close to a listed city's centre is that city, however the search named it. */
export const LISTED_M = 8000;
/** The cities.tsv key city quests match for a game city named `city` (however a search spelled it) starting at `at`, given the listed `near`est city: "" when the game city is another town nearby. */
export function listedKey(city: string, near: { name: string; country: string; lat: number; lon: number } | null, at: LatLon): string {
  if (!near) return "";
  const same = fold(city).startsWith(fold(near.name)) || distanceM(at[0], at[1], near.lat, near.lon) < LISTED_M;
  return same ? `${near.name}, ${near.country}` : "";
}

/** The done keys kept: every city quest (its key is its id, with no ":"), and the newest DONE_MAX of the rest. */
const remember = (done: string[]) => [...done.filter((k) => !k.includes(":")), ...done.filter((k) => k.includes(":")).slice(-DONE_MAX)];

/** How many quests a city of `pop` people has on its board. */
export function boardSize(pop: number): number {
  const t = (Math.log(Math.max(pop, 1)) - Math.log(BOARD_TOWN_POP)) / (Math.log(BOARD_BIG_POP) - Math.log(BOARD_TOWN_POP));
  return Math.round(BOARD_MIN + (BOARD_MAX - BOARD_MIN) * Math.min(Math.max(t, 0), 1));
}

/** Fills `text`'s {GIVER}, {ITEM}, {PLACE} and {TOWN}. */
export function fill(text: string, o: { giver?: string; item?: string; place?: string; town?: string }): string {
  return text
    .replaceAll("{GIVER}", o.giver ?? "a local")
    .replaceAll("{ITEM}", o.item ?? "it")
    .replaceAll("{PLACE}", o.place ?? "town")
    .replaceAll("{TOWN}", o.town ?? "town");
}

export class Quests {
  /** The city his board, events and quest belong to, and whether its board is rolled yet. */
  city = "";
  rolled = false;
  board: Offer[] = [];
  active: Active | null = null;
  events: LiveEvent[] = [];
  /** Keys of quests done, oldest first, so a board never deals them again. */
  done: string[] = [];
  /** Quests he has finished in all; `done` forgets the oldest. */
  finished = 0;
  log: LogEntry[] = [];
  /** Stops since the last quest, and how many he waits for. */
  since = 0;
  wait = QUEST_EVERY_MAX;
  /** The board quest you asked him to do next (Go help), or an event id. */
  nudge = "";
  /** Bumped on every change the map shows. */
  rev = 0;
  /** The quest bank from data/quests.json; not saved, the game sets it. */
  bank: Bank = { names: [], quests: [], events: [] };

  kind(id: string): QuestKind | undefined {
    return this.bank.quests.find((q) => q.id === id);
  }

  eventKind(id: string): EventKind | undefined {
    return this.bank.events.find((e) => e.id === id);
  }

  /** The story so far of a board quest or the active one, for its card. */
  describe(o: Offer, town: string): { icon: string; title: string; text: string } | null {
    const k = this.kind(o.kind);
    if (!k) return null;
    return { icon: k.icon, title: k.title, text: fill(k.steps[0]!.say[0]!, { giver: o.giver, item: k.items[o.item], place: o.at.name, town }) };
  }

  /** Rolls the board of `city` (of `pop` people) from its loaded `places`, once enough are loaded, with only the kind or rascal quests that fit his `lean`; a new city drops the old board, events and quest at once. `listed` is the city's cities.tsv "Name, Country" key ("" when it isn't listed): only quests of that city join the board. */
  roll(city: string, pop: number, places: readonly Place[], rng: Rng, listed = "", lean = ""): void {
    if (this.city !== city) {
      // Another city's board, events and quest stay behind (a free ride can take him away mid-quest).
      this.city = city;
      this.rolled = false;
      this.board = [];
      this.events = [];
      this.active = null;
      this.nudge = "";
      this.rev++;
    }
    if (this.rolled || !this.bank.quests.length) return;
    // Bridges can load before shops and cafés, and no quest starts at one: they don't count.
    const mine = this.bank.quests.filter((k) => !k.city || k.city === listed);
    const givers = [...new Set(mine.flatMap((k) => k.steps[0]!.at))];
    if (places.filter((p) => p.class !== BRIDGE).length < BOARD_PLACES || !places.some((p) => isKind(p, givers))) return;
    this.rolled = true;
    this.rev++;
    const done = new Set(this.done);
    const n = boardSize(pop);
    let fantasy = 0;
    // The city's own quests come first; each is done once for good, so its key is its id.
    for (const k of mine) {
      if (!k.city || done.has(k.id) || this.board.length >= n || (k.fantasy && fantasy >= Math.floor(n * FANTASY_SHARE))) continue;
      const at = stepPlaces(k.steps[0]!, places);
      if (!at.length) continue;
      const twist = k.twists.length && rng.randf() < 0.5 ? rng.randiRange(0, k.twists.length - 1) : -1;
      this.board.push({ key: k.id, kind: k.id, giver: rng.pick(this.bank.names), item: rng.randiRange(0, k.items.length - 1), twist, at: spotOf(rng.pick(at)) });
      if (k.fantasy) fantasy++;
    }
    const kinds = this.bank.quests.filter((k) => !k.city);
    if (!kinds.length) return;
    const byKind = indexKinds(places);
    const used = new Set<string>();
    for (let tries = 0; this.board.length < n && tries < n * 6; tries++) {
      const k = rng.pick(kinds);
      if (used.has(k.id) && used.size < kinds.length) continue;
      if (k.fantasy && fantasy >= Math.floor(n * FANTASY_SHARE)) continue;
      if (k.side && k.side !== lean) continue;
      const givers = k.steps[0]!.at.flatMap((key) => byKind.get(key) ?? []);
      if (!givers.length) continue;
      const giver = rng.pick(this.bank.names);
      const item = rng.randiRange(0, k.items.length - 1);
      const key = `${k.id}:${giver}:${item}`;
      if (done.has(key) || this.board.some((o) => o.key === key)) continue;
      const twist = k.twists.length && rng.randf() < 0.5 ? rng.randiRange(0, k.twists.length - 1) : -1;
      this.board.push({ key, kind: k.id, giver, item, twist, at: spotOf(rng.pick(givers)) });
      used.add(k.id);
      if (k.fantasy) fantasy++;
    }
  }

  toJSON() {
    return { city: this.city, rolled: this.rolled, board: this.board, active: this.active, events: this.events, done: this.done, finished: this.finished, log: this.log, since: this.since, wait: this.wait, nudge: this.nudge };
  }

  static fromJSON(d: unknown): Quests {
    const q = new Quests();
    if (!d || typeof d !== "object") return q;
    const o = d as Partial<ReturnType<Quests["toJSON"]>>;
    q.city = typeof o.city === "string" ? o.city : "";
    // Older saves only named a city once its board was rolled.
    q.rolled = typeof o.rolled === "boolean" ? o.rolled : !!q.city;
    q.board = Array.isArray(o.board) ? o.board : [];
    q.active = o.active && typeof o.active === "object" ? o.active : null;
    q.events = Array.isArray(o.events) ? o.events : [];
    q.done = Array.isArray(o.done) ? remember(o.done.filter((k): k is string => typeof k === "string")) : [];
    // Failed quests are done but not finished; a save from before the tally counts what it remembers.
    q.finished = typeof o.finished === "number" ? o.finished : q.done.length;
    q.log = Array.isArray(o.log) ? o.log.slice(-LOG_MAX) : [];
    q.since = Number(o.since) || 0;
    q.wait = Number(o.wait) || QUEST_EVERY_MAX;
    q.nudge = typeof o.nudge === "string" ? o.nudge : "";
    return q;
  }
}

/**
 * Where he should go next for a story, or null for his usual pick: never
 * while a need is urgent. A world event near him (or the one you nudged,
 * however far) comes first (it won't wait), then the step of the quest he is on, then, once enough stops have
 * passed, a new quest from the board (the one you nudged, else a near one).
 * Closed places wait: an event or giver there is skipped and a step there holds the quest until it opens.
 */
export function questGoal(stats: Stats, places: readonly Place[], here: LatLon, rng: Rng): Place | null {
  const q = stats.quests;
  expire(stats);
  if (anyUrgent(stats)) return null;
  const now = stats.now();
  const near = q.events
    .filter((e) => e.ends > now && openNow(stats, e.at) && (e.id === q.nudge || distanceM(here[0], here[1], e.at.lat, e.at.lon) < EVENT_NEAR_M))
    .sort((a, b) => (a.id === q.nudge ? -1 : b.id === q.nudge ? 1 : a.ends - b.ends));
  if (near.length) return placeOf(near[0]!.at, places);
  if (q.active) {
    q.active.target ??= stepTarget(stats, q.active, places, here, rng);
    return openNow(stats, q.active.target) ? placeOf(q.active.target, places) : null;
  }
  const open = q.board.filter((o) => openNow(stats, o.at));
  if (!open.length || (q.since < q.wait && !open.some((o) => o.key === q.nudge))) return null;
  const offer = open.find((o) => o.key === q.nudge) ?? nearest(open, here, rng);
  q.board = q.board.filter((o) => o !== offer);
  q.active = { ...offer, step: 0, target: offer.at };
  q.nudge = "";
  q.rev++;
  const k = q.kind(offer.kind);
  if (k) stats.say(`❗ New quest: ${k.title}, for ${offer.giver} at ${offer.at.name}`);
  return placeOf(offer.at, places);
}

/**
 * At a stop: plays the event or quest step that happens at `place` and
 * returns the minutes it took (he does no other action there), or null when
 * nothing story-like happens, which counts as a stop towards the next quest
 * and may start a world event nearby.
 */
export function questStop(stats: Stats, place: Place, places: readonly Place[], hour: number, rng: Rng): number | null {
  const q = stats.quests;
  expire(stats);
  const ev = q.events.find((e) => isAt(place, e.at));
  if (ev) {
    playEvent(stats, ev, places, hour, rng);
    return STEP_MIN;
  }
  const a = q.active;
  if (a?.target && isAt(place, a.target)) {
    playStep(stats, a, rng);
    return STEP_MIN;
  }
  q.since++;
  if (q.bank.events.length && q.events.length < EVENT_MAX && rng.randf() < EVENT_CHANCE) startEvent(stats, null, place, places, hour, rng);
  return null;
}

/** The kind of event to start (a follow-up when `kind` is given) at a place near `here` that fits, or nothing when none does. */
export function startEvent(stats: Stats, kind: EventKind | null, here: Pick<Place, "lat" | "lon">, places: readonly Place[], hour: number, rng: Rng): LiveEvent | null {
  const q = stats.quests;
  const kinds = kind ? [kind] : q.bank.events.filter((e) => !e.follow && (!e.time || inTime(e.time, hour)) && !q.events.some((l) => l.kind === e.id));
  const busy = new Set(q.events.map((e) => e.at.name));
  const near = places.filter((p) => !busy.has(p.name) && openNow(stats, p) && distanceM(here.lat, here.lon, p.lat, p.lon) < EVENT_NEAR_M);
  const options = kinds.flatMap((k) => {
    const at = near.filter((p) => isKind(p, k.at));
    return at.length ? [[k, at] as const] : [];
  });
  if (!options.length) return null;
  const [k, at] = rng.pick(options);
  const p = rng.pick(at);
  const ev: LiveEvent = { id: `${k.id}@${stats.now()}`, kind: k.id, at: spotOf(p), ends: stats.now() + rng.randiRange(k.min[0], k.min[1]) * 60, line: rng.randiRange(0, k.text.length - 1) };
  q.events.push(ev);
  q.rev++;
  stats.say(`${k.icon} ${fill(k.text[ev.line]!, { place: p.name, town: town(stats) })} (${k.title}, ${Math.round((ev.ends - stats.now()) / 60)} min)`);
  return ev;
}

/** Events whose time ran out play out without him; word of how it went reaches him. */
export function expire(stats: Stats): void {
  const q = stats.quests;
  const now = stats.now();
  const over = q.events.filter((e) => e.ends <= now);
  if (!over.length) return;
  q.events = q.events.filter((e) => e.ends > now);
  q.rev++;
  for (const e of over) {
    const k = q.eventKind(e.kind);
    if (k) stats.say(`${k.icon} ${fill(k.missed, { place: e.at.name, town: town(stats) })}`);
  }
}

function playEvent(stats: Stats, ev: LiveEvent, places: readonly Place[], hour: number, rng: Rng): void {
  const q = stats.quests;
  q.events = q.events.filter((e) => e !== ev);
  q.rev++;
  if (q.nudge === ev.id) q.nudge = "";
  const k = q.eventKind(ev.kind);
  if (!k) return;
  const won = rng.randf() < GOOD_BASE + leanShare(stats, k.lean);
  const o = won ? k.win : k.lose;
  const money = pay(stats, o, 1, rng);
  stats.say(`${k.icon} ${k.title} at ${ev.at.name}: ${fill(o.say, { place: ev.at.name, town: town(stats) })}${money}`);
  learn(stats, o);
  log(stats, { icon: k.icon, title: k.title, good: won, event: true });
  const next = q.eventKind((won ? k.next?.win : k.next?.lose) ?? "");
  if (next && rng.randf() < FOLLOW_CHANCE) startEvent(stats, next, ev.at, places, hour, rng);
}

function playStep(stats: Stats, a: Active, rng: Rng): void {
  const q = stats.quests;
  const k = q.kind(a.kind);
  if (!k) {
    q.active = null;
    return;
  }
  const words = { giver: a.giver, item: k.items[a.item], place: a.target!.name, town: town(stats) };
  const step = k.steps[a.step]!;
  // The middle step is where it turns: a twist may come, and it goes on or fails there.
  const middle = a.step === Math.floor(k.steps.length / 2);
  const twist = a.twist >= 0 && middle ? ` ${fill(k.twists[a.twist]!, words)}` : "";
  stats.say(`${k.icon} ${fill(rng.pick(step.say), words)}${twist}`);
  a.step++;
  a.target = null;
  q.rev++;
  const failed = middle && rng.randf() >= GOOD_BASE + leanShare(stats, k.lean);
  if (!failed && a.step < k.steps.length) return;
  if (failed) {
    stats.say(`${k.icon} ${k.title} fails: ${fill(rng.pick(k.worse), words)}`);
  } else {
    const money = pay(stats, k.reward, 1, rng);
    const item = k.reward.item ? gift(stats, k.reward.item, rng) : "";
    stats.say(`${k.icon} ${k.title}: ${fill(rng.pick(k.good), words)}${money}${item}`);
    learn(stats, k.reward);
    q.finished++;
  }
  log(stats, { icon: k.icon, title: k.title, good: !failed });
  q.done = remember([...q.done, a.key]);
  q.active = null;
  q.since = 0;
  q.wait = rng.randiRange(QUEST_EVERY_MIN, QUEST_EVERY_MAX);
}

/** A place for the active quest's next step: one of the nearest that fit (open ones first), not the one he stands at; the quest giver's place when none fits. */
function stepTarget(stats: Stats, a: Active, places: readonly Place[], here: LatLon, rng: Rng): Spot {
  const k = stats.quests.kind(a.kind);
  const step = k?.steps[a.step];
  if (!step) return a.at;
  const kind = stepPlaces(step, places.filter((p) => distanceM(here[0], here[1], p.lat, p.lon) > 30));
  const open = kind.filter((p) => openNow(stats, p));
  const fit = (open.length ? open : kind)
    .map((p) => [p, distanceM(here[0], here[1], p.lat, p.lon)] as const)
    .sort((x, y) => x[1] - y[1])
    .slice(0, STEP_CHOICES);
  return fit.length ? spotOf(rng.pick(fit)[0]) : a.at;
}

/** Pays out `r` times `share`; returns the money part of the feed line. */
function pay(stats: Stats, r: Reward | Outcome, share: number, rng: Rng): string {
  let cents = 0;
  if (r.eur !== undefined) cents = Math.round((Array.isArray(r.eur) ? rng.randiRange(toCents(r.eur[0]), toCents(r.eur[1])) : toCents(r.eur)) * share);
  stats.cents = Math.max(stats.cents + cents, 0);
  if (r.fx) stats.applyFx(share === 1 ? r.fx : Object.fromEntries(Object.entries(r.fx).map(([m, v]) => [m, v > 0 ? v * share : v])));
  const xp = Math.round((r.xp ?? 0) * share);
  if (xp) stats.addXp(xp);
  const parts = [cents ? signed(cents) : "", xp ? `+${xp} XP` : ""].filter(Boolean);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

/** The practice `r` gives: its skill trained as by a QUEST_PRACTICE_MIN action, and its hours in the local language; says any new level. */
function learn(stats: Stats, r: Reward | Outcome): void {
  if (r.skill) stats.sayIf(stats.skills.train(r.skill, QUEST_PRACTICE_MIN));
  if (r.lang) stats.sayIf(stats.languages.add(stats.lang(), r.lang));
}

/** A thank-you item of `kind` into his bag, if it has room; returns its part of the feed line. */
function gift(stats: Stats, kind: Items.Kind, rng: Rng): string {
  if (stats.bagFull()) return "";
  const item = Items.make(kind, stats.level, rng, stats.attr("luck"));
  item.story = { from: stats.where.city, t: stats.now(), countries: stats.where.code ? [stats.where.code] : [], km: 0 };
  stats.bag.push(item);
  return `, and a ${item.rarity} ${item.name} as thanks`;
}

function log(stats: Stats, e: Omit<LogEntry, "city" | "t">): void {
  const q = stats.quests;
  q.log = [...q.log, { ...e, city: stats.where.city, t: stats.now() }].slice(-LOG_MAX);
}

const town = (stats: Stats) => stats.where.city.split(",")[0] || "town";

/** `places` by their actions.json keys (class, and class/subclass), so a board looks up givers without scanning every place. */
function indexKinds(places: readonly Place[]): Map<string, Place[]> {
  const out = new Map<string, Place[]>();
  const add = (k: string, p: Place) => {
    const list = out.get(k);
    if (list) list.push(p);
    else out.set(k, [p]);
  };
  for (const p of places) {
    add(p.class, p);
    add(`${p.class}/${p.subclass}`, p);
  }
  return out;
}

/** One of the offers, likelier the nearer it is to `here`. */
function nearest(board: readonly Offer[], here: LatLon, rng: Rng): Offer {
  const w = board.map((o) => 1 / Math.max(distanceM(here[0], here[1], o.at.lat, o.at.lon), 100));
  let r = rng.randf() * w.reduce((s, x) => s + x, 0);
  for (let i = 0; i < board.length; i++) if ((r -= w[i]!) < 0) return board[i]!;
  return board[board.length - 1]!;
}

/** Problems with the bank, for the data test: unknown place keys, empty lines, broken follow-ups. */
export function check(bank: Bank, keys: Set<string>, attrs: readonly string[]): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  const known = (id: string, list: string[]) => {
    for (const k of list) if (!keys.has(k)) out.push(`${id}: no place key ${k}`);
  };
  for (const q of bank.quests) {
    if (ids.has(q.id)) out.push(`${q.id}: id used twice`);
    ids.add(q.id);
    if (!q.icon || !q.title || !q.items.length || !q.good.length || !q.worse.length) out.push(`${q.id}: needs an icon, title, items, good and worse`);
    if (q.steps.length < 2) out.push(`${q.id}: needs two steps or more`);
    for (const s of q.steps) {
      known(q.id, s.at);
      if (!s.say.length) out.push(`${q.id}: a step with nothing to say`);
    }
    if (!attrs.includes(q.lean)) out.push(`${q.id}: lean ${q.lean}`);
    if (q.side && q.side !== "kind" && q.side !== "rascal") out.push(`${q.id}: side ${q.side}`);
    if (q.city !== undefined && !/^.+, [^,]+$/.test(q.city)) out.push(`${q.id}: city ${q.city} isn't "Name, Country"`);
    if (q.steps.some((s) => s.name && (!s.name.length || s.name.some((n) => n.trim().length < 2)))) out.push(`${q.id}: a landmark name too short`);
    if (q.reward.item && !(q.reward.item in Items.KINDS)) out.push(`${q.id}: item kind ${q.reward.item}`);
    if (q.reward.skill && !isSkill(q.reward.skill)) out.push(`${q.id}: skill ${q.reward.skill}`);
  }
  const events = new Set(bank.events.map((e) => e.id));
  for (const e of bank.events) {
    if (ids.has(e.id)) out.push(`${e.id}: id used twice`);
    ids.add(e.id);
    known(e.id, e.at);
    if (!e.text.length || !e.missed || !e.win.say || !e.lose.say) out.push(`${e.id}: needs text, missed, win and lose`);
    if (!attrs.includes(e.lean)) out.push(`${e.id}: lean ${e.lean}`);
    for (const o of [e.win, e.lose]) if (o.skill && !isSkill(o.skill)) out.push(`${e.id}: skill ${o.skill}`);
    for (const n of [e.next?.win, e.next?.lose]) if (n && !events.has(n)) out.push(`${e.id}: no follow-up ${n}`);
  }
  for (const e of bank.events) if (e.follow && !bank.events.some((x) => x.next?.win === e.id || x.next?.lose === e.id)) out.push(`${e.id}: follow-up that nothing leads to`);
  return out;
}
