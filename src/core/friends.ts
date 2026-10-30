// The people in his life (Stardew's friendship hearts, kept gentle): the
// locals he keeps running into at the kinds of places he likes, a fellow
// traveller now and then for one trip, and maybe a partner. Each local has
// hearts from 0 to HEARTS_MAX; meeting again adds one. From MEET_UP_AT
// hearts they meet up on purpose wherever he is in their city; at
// HEARTS_MAX one may become his partner, who comes along on his trips. A
// companion joins a trip, splits the fare and chats for a few stops, then
// parts. Names and lines live in data/friends.json. All of it happens by
// itself. Pure; Stats owns one.
import type { Rng } from "./rng";

export const HEARTS_MAX = 10;
/** Hearts from which they meet up on purpose anywhere in their city. */
export const MEET_UP_AT = 5;
/** Chance per stop of running into a local who hangs out at this kind of place, or of meeting a new one where none does. */
export const SEE_CHANCE = 0.15;
export const NEW_CHANCE = 0.05;
/** Chance per stop of a meet-up with a close friend (MEET_UP_AT hearts) anywhere in their city. */
export const MEET_UP_CHANCE = 0.05;
/** Most locals he keeps per city; the one with the fewest hearts makes room. */
export const PER_CITY = 6;
/** Chance a fellow traveller joins a trip (when no partner comes along), and the stops they stay. */
export const COMPANION_CHANCE = 0.25;
export const COMPANION_STOPS = 3;
/** Share of the fare a companion pays him back. */
export const SPLIT = 0.5;
/** Friends the Stats sheet lists before the rest fold away. */
export const SHOWN = 4;

/** data/friends.json: first names, faces, and the fellow travellers who may join a trip. */
export type FriendData = { names: string[]; icons: string[]; companions: { who: string; icon: string; lines: string[] }[] };

export type Friend = {
  /** Stable for ever: where and when they met. */
  id: string;
  name: string;
  icon: string;
  /** The city they live in, and the kind of place (map class) they hang out at. */
  city: string;
  kind: string;
  /** Where they first met. This, met and seen are kept for the townies work, which builds on them. */
  place: { name: string; lat: number; lon: number };
  hearts: number;
  /** Unix seconds of the first meeting and the last. */
  met: number;
  seen: number;
};

/** A fellow traveller on a trip and the stops left with him. */
export type Companion = { who: string; icon: string; lines: string[]; left: number };

/** Where he is when it happens. */
export type Spot = { city: string; place: string; kind: string; lat: number; lon: number; t: number };

export class Friends {
  list: Friend[] = [];
  /** The id of his partner, "" for none. */
  partner = "";
  companion: Companion | null = null;

  partnerOf(): Friend | null {
    return this.list.find((f) => f.id === this.partner) ?? null;
  }

  /**
   * Maybe a meeting at a stop: a companion's chat, a meet-up with a close
   * friend, running into a local, or a new face. Returns the feed line, or "".
   */
  stop(at: Spot, data: FriendData, rng: Rng): string {
    const c = this.companion;
    if (c) {
      c.left--;
      if (c.left <= 0) {
        this.companion = null;
        return `${c.icon} The ${c.who} goes their own way at ${at.place}.`;
      }
      return `${c.icon} The ${c.who} at ${at.place}: "${rng.pick(c.lines)}"`;
    }
    const town = this.list.filter((f) => f.city === at.city);
    const close = town.filter((f) => f.hearts >= MEET_UP_AT && f.kind !== at.kind);
    if (close.length && rng.randf() < MEET_UP_CHANCE) return this.see(rng.pick(close), at, `Met up with {NAME} on purpose at ${at.place}`);
    const here = town.filter((f) => f.kind === at.kind);
    if (here.length) return rng.randf() < SEE_CHANCE ? this.see(rng.pick(here), at, `Ran into {NAME} again at ${at.place}`) : "";
    if (!data.names.length || rng.randf() >= NEW_CHANCE) return "";
    return this.befriend(at, data, rng);
  }

  /** A trip begins: his partner comes along, or maybe a fellow traveller who pays back part of `fare`. Returns the cents paid back and what the ride line adds. */
  board(fare: number, data: FriendData, rng: Rng): { back: number; with: string } {
    const p = this.partnerOf();
    if (p) return { back: 0, with: `, with ${p.name} ${p.icon}` };
    // A fellow traveller still along stays for their stops; no second one joins.
    if (this.companion || !data.companions.length || rng.randf() >= COMPANION_CHANCE) return { back: 0, with: "" };
    const k = rng.pick(data.companions);
    this.companion = { ...k, left: COMPANION_STOPS + 1 };
    const back = Math.floor(fare * SPLIT);
    return { back, with: `; a ${k.who} ${k.icon} joins him${back ? " and they split the fare" : ""}` };
  }

  private see(f: Friend, at: Spot, text: string): string {
    f.hearts = Math.min(f.hearts + 1, HEARTS_MAX);
    f.seen = at.t;
    let line = `${f.icon} ${text.replace("{NAME}", f.name)} (${hearts(f.hearts)})`;
    if (f.hearts >= HEARTS_MAX && !this.partner) {
      this.partner = f.id;
      line += `. ${f.name} and he are a couple now`;
    }
    return line;
  }

  private befriend(at: Spot, data: FriendData, rng: Rng): string {
    const f: Friend = {
      id: `${at.city}|${at.place}|${at.t}`,
      name: rng.pick(data.names),
      icon: rng.pick(data.icons),
      city: at.city,
      kind: at.kind,
      place: { name: at.place, lat: at.lat, lon: at.lon },
      hearts: 1,
      met: at.t,
      seen: at.t,
    };
    const town = this.list.filter((g) => g.city === at.city);
    if (town.length >= PER_CITY) {
      const least = town.filter((g) => g.id !== this.partner).reduce((a, b) => (b.hearts < a.hearts ? b : a));
      this.list.splice(this.list.indexOf(least), 1);
    }
    this.list.push(f);
    return `${f.icon} Got talking with ${f.name} at ${at.place} (${hearts(f.hearts)})`;
  }

  toJSON() {
    return { list: this.list, partner: this.partner, companion: this.companion };
  }

  static fromJSON(d: unknown): Friends {
    const out = new Friends();
    if (!d || typeof d !== "object") return out;
    const o = d as Record<string, unknown>;
    const str = (...v: unknown[]) => v.every((x) => typeof x === "string");
    if (Array.isArray(o.list)) out.list = (o.list as Friend[]).filter((f) => f && str(f.id, f.name, f.icon, f.city, f.kind));
    for (const f of out.list) f.hearts = Math.min(Math.max(Number(f.hearts) || 0, 0), HEARTS_MAX);
    out.partner = typeof o.partner === "string" && out.list.some((f) => f.id === o.partner) ? o.partner : "";
    const c = o.companion as Companion | null;
    out.companion = c && str(c.who, c.icon) && typeof c.left === "number" && c.left > 0 && Array.isArray(c.lines) && c.lines.length ? c : null;
    return out;
  }
}

/** "💗💗💗" for 3 hearts. */
export const hearts = (n: number) => "💗".repeat(n);
