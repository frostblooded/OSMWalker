// Sky events: now and then a night puts on a show, a full moon, shooting
// stars, a meteor shower, a comet, an aurora or an eclipse of the moon. They
// are the game's own, not the real sky's: each night in each city rolls its
// own dice, the rarer the show the smaller its odds. The first time it gets
// dark on such a night he looks up, whatever the weather: a feed line and a
// moodlet. Once a night, the same watched and away (Stats.lookUp). Pure.
import { Rng, seedOf } from "./rng";
import type { Sky } from "./sky";

/** It counts as night once Sky.dark passes this (see sky.ts). */
export const NIGHT_DARK = 0.5;

export type EventId = "full_moon" | "shooting_stars" | "meteor_shower" | "comet" | "aurora" | "lunar_eclipse";
export type SkyEvent = { id: EventId; icon: string; name: string; what: string; say: string; chance: number; mood: [number, number] };

/** Each event: how a line names it, the line he says, its odds on any night, and its moodlet's mood an hour and hours. Rarest last. */
export const EVENTS: Record<EventId, SkyEvent> = {
  full_moon: { id: "full_moon", icon: "🌝", name: "Full moon", what: "a full moon", say: "Stopped to look at the full moon. Bright enough to read by", chance: 0.08, mood: [1, 3] },
  shooting_stars: { id: "shooting_stars", icon: "✴", name: "Shooting stars", what: "shooting stars", say: "Saw three shooting stars in a row and made a wish on each", chance: 0.05, mood: [1, 3] },
  meteor_shower: { id: "meteor_shower", icon: "☄", name: "Meteor shower", what: "a meteor shower", say: "Lay back and watched a meteor shower until he lost count", chance: 0.02, mood: [2, 4] },
  comet: { id: "comet", icon: "💫", name: "Comet", what: "a comet", say: "A comet hung over the rooftops, its tail like a brushstroke", chance: 0.01, mood: [3, 4] },
  aurora: { id: "aurora", icon: "🎇", name: "Aurora", what: "an aurora", say: "Green curtains of light rippled over the city. Nobody could explain it", chance: 0.008, mood: [3, 5] },
  lunar_eclipse: { id: "lunar_eclipse", icon: "🌒", name: "Lunar eclipse", what: "a lunar eclipse", say: "Watched the moon turn red in an eclipse", chance: 0.005, mood: [3, 6] },
};

/** The local date ("2026-08-12") of the evening a night at unix seconds `t` belongs to, for a city `offsetS` from UTC. */
export function nightOf(t: number, offsetS: number): string {
  return new Date((t + offsetS - 12 * 3600) * 1000).toISOString().slice(0, 10);
}

/** The event of the night that starts on local `date` in `city`, on that night's own dice (rarest first), or null on an ordinary night. */
export function eventOn(date: string, city: string): SkyEvent | null {
  let r = new Rng(seedOf(`sky${date}${city}`)).randf();
  for (const ev of Object.values(EVENTS).reverse()) {
    if (r < ev.chance) return ev;
    r -= ev.chance;
  }
  return null;
}

/** What he saw: the night he last looked up (a local date), and each event seen and how often. */
export class Stargazing {
  night = "";
  seen: Partial<Record<EventId, number>> = {};

  /** Sightings in his whole life. */
  count(): number {
    return Object.values(this.seen).reduce((a, n) => a + (n ?? 0), 0);
  }

  /** Looks up at unix seconds `t` under `sky` in `city`: on the first dark moment of a night with an event, notes it and returns it; otherwise null. */
  look(t: number, sky: Sky | null, city: string): SkyEvent | null {
    if (!sky || sky.dark < NIGHT_DARK) return null;
    const night = nightOf(t, sky.offsetS);
    if (night === this.night) return null;
    this.night = night;
    const ev = eventOn(night, city);
    if (ev) this.seen[ev.id] = (this.seen[ev.id] ?? 0) + 1;
    return ev;
  }

  toJSON() {
    return { night: this.night, seen: this.seen };
  }

  static fromJSON(d?: Partial<ReturnType<Stargazing["toJSON"]>>): Stargazing {
    const s = new Stargazing();
    s.night = d?.night ?? "";
    s.seen = { ...(d?.seen ?? {}) };
    return s;
  }
}
