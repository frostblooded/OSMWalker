// Clubs (The Sims 4's clubs): a friend with JOIN_AT hearts may invite him to
// the club they go to, at the place where they met, on one weekday at
// a set hour (chess at a café on Tuesdays at 19:00). From then on, whenever
// he is in that city at that time he goes by himself: a quiet stop anywhere
// in the city in the club's hours turns into the club night (he heads over), with its mood and XP and a heart for
// the friend. One club per city, MAX_CLUBS in all. A rare few are not of
// this world: a hedge mages' circle meets at a wizard's tower. Pure; Stats
// owns one.
import type { Friends } from "./friends";
import { effect } from "./gifts";
import type { Rng } from "./rng";
import type { Fx } from "./stats";

/** Hearts a friend needs before inviting him to their club. */
export const JOIN_AT = 3;
/** Chance per stop, in a city where such a friend has a club and he has none, of an invitation. */
export const INVITE_CHANCE = 0.05;
/** Most clubs he belongs to; with that many, invitations stop. */
export const MAX_CLUBS = 3;
/** A club night lasts this many hours from its start; a stop in them is the night, once a week. */
export const NIGHT_H = 2;

export const DAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"] as const;

/**
 * A kind of club: the map classes of the places it meets at, its hour, and
 * what a night does. The classes come from the map (OpenFreeMap) and, for
 * wizard_tower, from poiGen.ts TOWER_KIND; tests/unit/clubs.test.ts checks
 * each still exists.
 */
export type ClubKind = { id: string; name: string; icon: string; at: readonly string[]; hour: number; fx: Fx };

export const KINDS: ClubKind[] = [
  { id: "chess", name: "chess club", icon: "♟", at: ["cafe", "chess"], hour: 19, fx: { mood: 8, xp: 30 } },
  { id: "books", name: "book club", icon: "📚", at: ["library", "college"], hour: 18, fx: { mood: 6, xp: 35 } },
  { id: "quiz", name: "quiz night", icon: "🧠", at: ["bar", "beer"], hour: 20, fx: { mood: 10, xp: 20 } },
  { id: "run", name: "running club", icon: "🏃", at: ["park", "garden", "sports_centre"], hour: 8, fx: { mood: 10, health: 5, energy: -15, xp: 20 } },
  { id: "swim", name: "swimming club", icon: "🏊", at: ["swimming", "swimming_pool", "water_park"], hour: 7, fx: { mood: 8, health: 5, hygiene: 20, energy: -15, xp: 15 } },
  { id: "choir", name: "choir", icon: "🎶", at: ["place_of_worship", "music", "theatre"], hour: 19, fx: { mood: 12, xp: 15 } },
  { id: "dogs", name: "dog walkers' club", icon: "🐕", at: ["dog_park"], hour: 9, fx: { mood: 12, xp: 10 } },
  { id: "mages", name: "hedge mages' circle", icon: "🔮", at: ["wizard_tower"], hour: 22, fx: { mood: 10, xp: 40 } },
];

export type Club = {
  /** The kind (see KINDS) and the friend who invited him. */
  kind: string;
  host: string;
  city: string;
  place: { name: string; lat: number; lon: number };
  /** 0 is Sunday, as Date.getDay(). */
  day: number;
  hour: number;
  /** Unix seconds he joined, the local date of the last night he went, and how many he has been to. */
  joined: number;
  last: string;
  nights: number;
};

/** Where he is when it happens: the city, the local weekday (Date.getDay()) and hour, the local date and unix seconds. */
export type When = { city: string; day: number; hour: number; date: string; t: number };

export const kindOf = (c: Pick<Club, "kind">) => KINDS.find((k) => k.id === c.kind)!;
const kindAt = (cls: string) => KINDS.find((k) => k.at.includes(cls)) ?? null;

/** "chess club at Café Rila, Tuesdays at 19:00". */
export const clubText = (c: Club) => `${kindOf(c).name} at ${c.place.name}, ${DAYS[c.day]} at ${String(c.hour).padStart(2, "0")}:00`;

/** True when `w` falls in club `c`'s night: its city and weekday, from its hour for NIGHT_H hours. */
export const inNight = (c: Club, w: When) => c.city === w.city && c.day === w.day && w.hour >= c.hour && w.hour < c.hour + NIGHT_H;

/** One Help line per kind of club: where it meets, its hour and what a night gives. */
export const helpList = () =>
  KINDS.map((k) => `- ${k.icon} ${k.name[0]!.toUpperCase()}${k.name.slice(1)}: from ${String(k.hour).padStart(2, "0")}:00, with a friend from a ${k.at.map((c) => c.replaceAll("_", " ")).join(", ")}; a night gives ${effect(k)}.`).join("\n");

export class Clubs {
  list: Club[] = [];

  /**
   * A stop at `w`: the club night if one is on here and now and he hasn't
   * been yet (its fx go in `fx`, the host gets a heart), else maybe an
   * invitation from a friend in this city. Returns the feed line, or "".
   */
  stop(w: When, people: Friends, fx: Fx, rng: Rng): string {
    const friends = people.list;
    const night = this.list.find((c) => inNight(c, w) && c.last !== w.date);
    if (night) return this.go(night, w, people, fx);
    if (this.list.length >= MAX_CLUBS || this.list.some((c) => c.city === w.city)) return "";
    // A friend who moved away (townies.ts) has no club where they met, so only those still in the city they met in invite.
    const hosts = friends.filter((f) => f.city === w.city && f.id.startsWith(`${f.city}|`) && f.hearts >= JOIN_AT && kindAt(f.kind));
    if (!hosts.length || rng.randf() >= INVITE_CHANCE) return "";
    const f = rng.pick(hosts);
    const k = kindAt(f.kind)!;
    const c: Club = { kind: k.id, host: f.id, city: f.city, place: f.place, day: rng.randiRange(0, 6), hour: k.hour, joined: w.t, last: "", nights: 0 };
    this.list.push(c);
    return `${k.icon} ${f.name} invited him to the ${clubText(c)}. He joined`;
  }

  private go(c: Club, w: When, people: Friends, fx: Fx): string {
    const k = kindOf(c);
    c.last = w.date;
    c.nights++;
    for (const [m, v] of Object.entries(k.fx) as [keyof Fx, number][]) if (v) fx[m] = (fx[m] ?? 0) + v;
    const host = people.list.find((f) => f.id === c.host);
    const couple = host ? people.heart(host, w.t) : "";
    return `${k.icon} Went to the ${k.name} at ${c.place.name}${host ? ` with ${host.name}` : ""} (night ${c.nights})${couple}`;
  }

  toJSON() {
    return { list: this.list };
  }

  /** Old saves have no clubs; unknown kinds are dropped. */
  static fromJSON(d: unknown): Clubs {
    const out = new Clubs();
    const list = (d as { list?: unknown } | null)?.list;
    if (!Array.isArray(list)) return out;
    out.list = (list as Club[]).filter(
      (c) => c && KINDS.some((k) => k.id === c.kind) && typeof c.city === "string" && typeof c.host === "string" && typeof c.place?.name === "string" && Number.isInteger(c.day) && Number.isInteger(c.hour),
    );
    for (const c of out.list) {
      c.last = typeof c.last === "string" ? c.last : "";
      c.nights = Number(c.nights) || 0;
      c.joined = Number(c.joined) || 0;
    }
    return out;
  }
}
