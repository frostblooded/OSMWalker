// His rival (Shadow of Mordor's nemesis, small): Viktor, another traveller
// who is in some of the cities he reaches (settled at his first stop there).
// While Viktor is in town a stop may bring a meeting: a contest for the same
// thing (a job, a table, a chess game), or now and then a friendly chat.
// Viktor remembers every meeting, levels up when he wins, and over many
// meetings a grudge or a friendship forms. All of it plays out by itself.
// Pure; Stats owns one.
import type { Rng } from "./rng";
import type { Attr, Fx, Stats } from "./stats";

export const RIVAL_NAME = "Viktor";
export const RIVAL_ICON = "🎩";
/** Chance Viktor is in a city when he arrives there. */
export const IN_TOWN_CHANCE = 0.35;
/** Chance of a meeting at each stop while Viktor is in town. */
export const MEET_CHANCE = 0.04;
/** Chance a meeting is a friendly chat instead of a contest; each point of Charm above 1 adds FRIENDLY_PER_CHA, up to FRIENDLY_CAP. */
export const FRIENDLY_BASE = 0.15;
export const FRIENDLY_PER_CHA = 0.02;
export const FRIENDLY_CAP = 0.4;
export const START_LEVEL = 2;
/** Viktor's strength in a contest per level; his own is the contest's attribute plus HIS_PER_LEVEL a level. */
export const RIVAL_PER_LEVEL = 0.6;
export const HIS_PER_LEVEL = 0.2;
/** Feeling runs from -FEELING_MAX (a grudge) to FEELING_MAX (friends); at FEELING_AT either way it has a name. */
export const FEELING_MAX = 10;
export const FEELING_AT = 5;
/** Minutes Viktor shows on the map after a meeting. */
export const SEEN_MIN = 20;
/** Meetings Viktor brings up again. */
export const MEMORY = 6;

/** Something they compete for (data/rival.json): where, on which attribute, and how it starts ({PLACE} is where), is won and is lost. */
export type Contest = { id: string; at: string[]; attr: Attr; text: string; won: string; lost: string };


/** What a win and a loss do. */
export const WIN_FX: Fx = { mood: 10, xp: 30 };
export const LOSE_FX: Fx = { mood: -8, xp: 10 };
export const FRIENDLY_FX: Fx = { mood: 10 };

export type Meeting = { t: number; city: string; contest: string; won: boolean | null };

export class Rival {
  level = START_LEVEL;
  wins = 0;
  losses = 0;
  chats = 0;
  /** Below 0 a grudge, above 0 a friendship. */
  feeling = 0;
  /** The city Viktor's whereabouts were last rolled for, and whether he is there. */
  town = "";
  inTown = false;
  /** Unix seconds until Viktor shows on the map, and where. */
  seenUntil = 0;
  seenAt: [number, number] | null = null;
  /** The last MEMORY meetings, newest last. */
  memory: Meeting[] = [];

  /** What they are to each other, by feeling. */
  standing(): "nemesis" | "rival" | "friend" {
    return this.feeling <= -FEELING_AT ? "nemesis" : this.feeling >= FEELING_AT ? "friend" : "rival";
  }

  /** His chance of winning a contest of `attr`. */
  winChance(stats: Stats, attr: Attr): number {
    const his = stats.attr(attr) + HIS_PER_LEVEL * stats.level;
    const vik = RIVAL_PER_LEVEL * this.level;
    return his / (his + vik);
  }

  /** Maybe a meeting at a stop at `place` (a place of map class `kind`) at `at`; returns its feed line, or "". */
  meet(stats: Stats, contests: readonly Contest[], place: string, kind: string, at: [number, number], rng: Rng): string {
    const city = stats.where.city;
    // At his first stop in a new city it is settled whether Viktor is there too.
    if (this.town !== city) {
      this.town = city;
      this.inTown = rng.randf() < IN_TOWN_CHANCE;
    }
    if (!this.inTown || rng.randf() >= MEET_CHANCE) return "";
    const friendly = Math.min(FRIENDLY_BASE + FRIENDLY_PER_CHA * Math.max(stats.attr("cha") - 1, 0), FRIENDLY_CAP);
    const here = contests.filter((c) => c.at.includes(kind));
    const t = stats.now();
    this.seenUntil = t + SEEN_MIN * 60;
    this.seenAt = at;
    const recall = this.recall(city);
    if (!here.length || rng.randf() < friendly) {
      this.chats++;
      this.feeling = Math.min(this.feeling + 1, FEELING_MAX);
      stats.applyFx(FRIENDLY_FX);
      this.remember({ t, city, contest: "chat", won: null });
      return stats.say(`${RIVAL_ICON} Ran into ${RIVAL_NAME} at ${place}; they share a coffee and swap stories.${recall}`);
    }
    const c = rng.pick(here);
    const won = rng.randf() < this.winChance(stats, c.attr);
    if (won) this.wins++;
    else {
      this.losses++;
      this.level++;
    }
    this.feeling = Math.max(this.feeling - 1, -FEELING_MAX);
    stats.applyFx(won ? WIN_FX : LOSE_FX);
    this.remember({ t, city, contest: c.id, won });
    return stats.say(`${RIVAL_ICON} ${RIVAL_NAME} ${c.text.replaceAll("{PLACE}", place)}. ${won ? c.won : c.lost}${recall}`);
  }

  /** Where Viktor shows on the map at unix seconds `t`, or null. */
  shownAt(t: number, city: string): [number, number] | null {
    return this.inTown && this.town === city && t < this.seenUntil ? this.seenAt : null;
  }

  /** " He hasn't forgotten Sofia." when they met before in another city. */
  private recall(city: string): string {
    const before = this.memory.findLast((m) => m.city !== city);
    if (!before) return "";
    const town = before.city.split(",")[0];
    if (before.won === null) return ` He still talks about ${town}.`;
    return before.won ? ` He hasn't forgotten ${town}.` : ` He reminds him of ${town}.`;
  }

  private remember(m: Meeting): void {
    this.memory = [...this.memory, m].slice(-MEMORY);
  }

  toJSON() {
    return { level: this.level, wins: this.wins, losses: this.losses, chats: this.chats, feeling: this.feeling, town: this.town, inTown: this.inTown, seenUntil: this.seenUntil, seenAt: this.seenAt, memory: this.memory };
  }

  static fromJSON(d: unknown): Rival {
    const r = new Rival();
    if (!d || typeof d !== "object") return r;
    const o = d as Record<string, unknown>;
    const n = (v: unknown, lo: number) => Math.max(Number(v) || 0, lo);
    r.level = Math.max(n(o.level, 0), START_LEVEL);
    r.wins = n(o.wins, 0);
    r.losses = n(o.losses, 0);
    r.chats = n(o.chats, 0);
    r.feeling = Math.min(Math.max(Number(o.feeling) || 0, -FEELING_MAX), FEELING_MAX);
    r.town = typeof o.town === "string" ? o.town : "";
    r.inTown = o.inTown === true;
    r.seenUntil = n(o.seenUntil, 0);
    r.seenAt = Array.isArray(o.seenAt) && o.seenAt.length === 2 ? [Number(o.seenAt[0]), Number(o.seenAt[1])] : null;
    r.memory = Array.isArray(o.memory) ? (o.memory as Meeting[]).filter((m) => m && typeof m.city === "string").slice(-MEMORY) : [];
    return r;
  }
}
