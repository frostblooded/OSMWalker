// A ruin crawl: 3 to 5 rooms at a real castle or ruin, each passed with a
// roll on one attribute. A failed roll turns him back with what he found;
// nothing fights. Deeper crawls find rarer things. Loaded at idle (main.tsx)
// and on a reopen (game.ts), then handed to ruins.ts.
import * as Items from "./items";
import type { Log } from "./ruins";
import type { Rng } from "./rng";
import type { Attr, Place, Stats } from "./stats";

export const MIN_ROOMS = 3;
export const MAX_ROOMS = 5;
/** Chance to pass a room: ROOM_BASE plus ROOM_PER_POINT per point of its attribute, less ROOM_DEPTH_CUT per room passed, within ROOM_MIN-ROOM_MAX. */
export const ROOM_BASE = 0.55;
export const ROOM_PER_POINT = 0.05;
export const ROOM_DEPTH_CUT = 0.08;
export const ROOM_MIN = 0.15;
export const ROOM_MAX = 0.95;
export const ROOM_XP = 10;
export const ROOM_ENERGY = 3;
/** Energy a failed room costs on top, as he scrambles back out. */
export const FAIL_ENERGY = 5;
/** Each room passed lifts the rarity roll of what he finds this much. */
export const DEPTH_RARITY = 0.08;
export const LOOT_KINDS: Items.Kind[] = ["trinkets", "weapons"];

type RoomKind = { attr: Attr; text: string; win: string; fail: string };
/** The rooms, two of them a little touched by legend. */
export const ROOMS: RoomKind[] = [
  { attr: "str", text: "a stuck oak door", win: "he shouldered it open", fail: "it wouldn't budge" },
  { attr: "str", text: "fallen stones on the stair", win: "he heaved them aside", fail: "they were too heavy" },
  { attr: "str", text: "a rusted gate", win: "he lifted it a crack and rolled under", fail: "it held fast" },
  { attr: "wit", text: "a floor of loose tiles", win: "he found the safe path", fail: "one cracked and he backed off" },
  { attr: "wit", text: "a riddle cut over an arch", win: "he worked it out", fail: "it made no sense to him" },
  { attr: "wit", text: "a stone dragon asleep across the hall", win: "he tiptoed past its tail", fail: "it snored and he lost his nerve" },
  { attr: "cha", text: "a grumpy caretaker", win: "he talked his way past", fail: "he was shooed out" },
  { attr: "cha", text: "a ghost in a torn cloak", win: "they chatted until it waved him on", fail: "it wailed and he fled" },
  { attr: "luck", text: "flooded steps in the dark", win: "he found a dry ledge", fail: "he slipped into cold water" },
  { attr: "luck", text: "a wall with a hidden niche", win: "his hand found the loose brick", fail: "he found only dust" },
];

export const passChance = (attr: number, passed: number) => Math.min(Math.max(ROOM_BASE + ROOM_PER_POINT * attr - ROOM_DEPTH_CUT * passed, ROOM_MIN), ROOM_MAX);

/** Crawls `place`, saying each room in the feed; returns the log. */
export function explore(s: Stats, place: Place, rng: Rng): Log {
  const of = rng.randiRange(MIN_ROOMS, MAX_ROOMS);
  const left = [...ROOMS];
  const log: Log = { name: place.name, city: s.where.city, t: s.now(), rooms: [], of, found: null };
  s.say(`Found a way into ${place.name}: ${of} rooms deep`);
  for (let i = 0; i < of; i++) {
    const room = left.splice(rng.randiRange(0, left.length - 1), 1)[0]!;
    const won = rng.randf() < passChance(s.attr(room.attr), i);
    log.rooms.push({ text: room.text, won, how: won ? room.win : room.fail });
    s.applyFx(won ? { energy: -ROOM_ENERGY, xp: ROOM_XP } : { energy: -ROOM_ENERGY - FAIL_ENERGY });
    s.say(`Room ${i + 1}, ${room.text}: ${won ? room.win : `${room.fail}, so he turned back`}`);
    if (!won) break;
  }
  const passed = log.rooms.filter((r) => r.won).length;
  if (passed) {
    const item = Items.make(rng.pick(LOOT_KINDS), s.level, rng, s.attr("luck"), DEPTH_RARITY * passed);
    log.found = { name: item.name, rarity: item.rarity, slot: item.slot };
    s.found(item, `${passed} of ${of} rooms into ${place.name}`);
  } else s.say(`Left ${place.name} with nothing`);
  return log;
}
