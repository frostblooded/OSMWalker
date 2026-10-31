// Sky events: real full moons, the real peaks of the big meteor showers and
// real lunar eclipses. The first time it gets dark on such a night (for an
// eclipse, once it is on) he looks up: a clear sky gives a feed line and a
// moodlet, real clouds hide it and he grumbles. Once a night, the same
// watched and away (Stats.lookUp). Pure.
import type { Sky } from "./sky";
import type { WeatherKind } from "./weather";

/** A known new moon (2000-01-06 18:14 UTC, unix seconds) and the mean synodic month in days. */
export const NEW_MOON_S = 947_182_440;
export const SYNODIC_DAYS = 29.530588853;
/** A night is a full-moon night when the moon is this many days or less from full at local midnight. */
export const FULL_WITHIN_DAYS = 0.5;
/** It counts as night once Sky.dark passes this (see sky.ts). */
export const NIGHT_DARK = 0.5;
/** Weather that hides the sky. Unknown weather (as while you are away) hides nothing. */
export const HIDING: WeatherKind[] = ["cloudy", "fog", "rain", "snow", "storm"];

export type EventId = "full_moon" | "quadrantids" | "lyrids" | "eta_aquariids" | "perseids" | "orionids" | "leonids" | "geminids" | "lunar_eclipse";
export type SkyEvent = { id: EventId; icon: string; name: string; what: string; say: string; mood: [number, number] };

/** Each event: how a line names it, the line he says, and its moodlet's mood an hour and hours. */
export const EVENTS: Record<EventId, SkyEvent> = {
  full_moon: { id: "full_moon", icon: "🌝", name: "Full moon", what: "the full moon", say: "Stopped to look at the full moon. Bright enough to read by", mood: [1, 3] },
  quadrantids: { id: "quadrantids", icon: "☄", name: "Quadrantids", what: "the Quadrantids", say: "Counted shooting stars in the cold: the Quadrantids", mood: [2, 3] },
  lyrids: { id: "lyrids", icon: "☄", name: "Lyrids", what: "the Lyrids", say: "Watched the Lyrids streak across the sky", mood: [2, 3] },
  eta_aquariids: { id: "eta_aquariids", icon: "☄", name: "Eta Aquariids", what: "the Eta Aquariids", say: "Caught a few Eta Aquariids, dust from Halley's comet", mood: [2, 3] },
  perseids: { id: "perseids", icon: "☄", name: "Perseids", what: "the Perseids", say: "Lay back and watched the Perseids. Made a wish on every one", mood: [2, 4] },
  orionids: { id: "orionids", icon: "☄", name: "Orionids", what: "the Orionids", say: "Spotted the Orionids over the rooftops", mood: [2, 3] },
  leonids: { id: "leonids", icon: "☄", name: "Leonids", what: "the Leonids", say: "Watched the Leonids fall, quick and bright", mood: [2, 3] },
  geminids: { id: "geminids", icon: "☄", name: "Geminids", what: "the Geminids", say: "Saw the Geminids, the best shower of the year", mood: [2, 4] },
  lunar_eclipse: { id: "lunar_eclipse", icon: "🌒", name: "Lunar eclipse", what: "the lunar eclipse", say: "Watched the moon turn red in an eclipse", mood: [3, 6] },
};

/** Meteor shower peaks by month and day: the night that starts on that date. */
export const SHOWERS: [EventId, number, number][] = [
  ["quadrantids", 1, 3],
  ["lyrids", 4, 22],
  ["eta_aquariids", 5, 5],
  ["perseids", 8, 12],
  ["orionids", 10, 21],
  ["leonids", 11, 17],
  ["geminids", 12, 13],
];

/**
 * Partial and total lunar eclipses, by the time of greatest eclipse (UTC), from NASA's tables. He sees one when it falls in his night, at that time.
 * shortcut: the table ends in 2030; past its last entry the Lunar eclipse tile can't be won until more are added.
 */
export const ECLIPSES = ["2026-03-03T11:33Z", "2026-08-28T04:13Z", "2028-01-12T04:13Z", "2028-07-06T18:19Z", "2028-12-31T16:52Z", "2029-06-26T03:22Z", "2029-12-20T22:42Z", "2030-06-15T18:33Z"].map((s) => Date.parse(s) / 1000);

/** Days from the nearest full moon at unix seconds `t`. */
export function fromFull(t: number): number {
  const age = ((((t - NEW_MOON_S) / 86_400) % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS;
  return Math.abs(age - SYNODIC_DAYS / 2);
}

/** The local date ("2026-08-12") of the evening a night at unix seconds `t` belongs to, for a city `offsetS` from UTC. */
export function nightOf(t: number, offsetS: number): string {
  return new Date((t + offsetS - 12 * 3600) * 1000).toISOString().slice(0, 10);
}

/** The time (unix seconds) of a lunar eclipse in the night that starts on local `date`, between its sunset and sunrise in local clock hours, if there is one. */
export function eclipseOn(date: string, offsetS: number, set: number, rise: number): number | undefined {
  const evening = Date.parse(`${date}T00:00Z`) / 1000 - offsetS;
  return ECLIPSES.find((e) => e >= evening + set * 3600 && e <= evening + 86_400 + rise * 3600);
}

/** The best event of the night that starts on local `date` (an eclipse, then a shower, then a full moon), with the night's sunset and sunrise in local clock hours; null on an ordinary night. */
export function eventOn(date: string, offsetS: number, set: number, rise: number): SkyEvent | null {
  if (eclipseOn(date, offsetS, set, rise) !== undefined) return EVENTS.lunar_eclipse;
  const evening = Date.parse(`${date}T00:00Z`) / 1000 - offsetS;
  const [, m, d] = date.split("-").map(Number);
  const shower = SHOWERS.find(([, sm, sd]) => sm === m && sd === d);
  if (shower) return EVENTS[shower[0]];
  return fromFull(evening + 86_400) <= FULL_WITHIN_DAYS ? EVENTS.full_moon : null;
}

/** What he saw: the night he last looked up (a local date), each event seen and how often, and the nights clouds hid one. */
export class Stargazing {
  night = "";
  seen: Partial<Record<EventId, number>> = {};
  clouded = 0;

  /** Sightings in his whole life. */
  count(): number {
    return Object.values(this.seen).reduce((a, n) => a + (n ?? 0), 0);
  }

  /**
   * Looks up at unix seconds `t` under `sky`: on the first dark moment of a night with an event (for an eclipse, once it is on), notes it.
   * Returns the event and whether clouds hid it, or null when there is nothing (new) to see.
   */
  look(t: number, sky: Sky | null): { ev: SkyEvent; hidden: boolean } | null {
    if (!sky || sky.dark < NIGHT_DARK) return null;
    const night = nightOf(t, sky.offsetS);
    if (night === this.night) return null;
    const ev = eventOn(night, sky.offsetS, sky.set, sky.rise);
    if (ev === EVENTS.lunar_eclipse && t < eclipseOn(night, sky.offsetS, sky.set, sky.rise)!) return null;
    this.night = night;
    if (!ev) return null;
    const hidden = !!sky.weather && HIDING.includes(sky.weather.kind);
    if (hidden) this.clouded++;
    else this.seen[ev.id] = (this.seen[ev.id] ?? 0) + 1;
    return { ev, hidden };
  }

  toJSON() {
    return { night: this.night, seen: this.seen, clouded: this.clouded };
  }

  static fromJSON(d?: Partial<ReturnType<Stargazing["toJSON"]>>): Stargazing {
    const s = new Stargazing();
    s.night = d?.night ?? "";
    s.seen = { ...(d?.seen ?? {}) };
    s.clouded = d?.clouded ?? 0;
    return s;
  }
}
