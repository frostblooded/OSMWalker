// Trips to other cities, from the game's side: on each new destination the
// dice may send him off instead (never on the first pick in a new city), the
// trip is planned and its fare checked, the bus or car road is asked for in
// the background, and at the station he pays or stays to save up. The
// walker does the walking and the riding; this module decides and pays.
import type { Entry } from "../core/debugLog";
import { euro } from "../core/money";
import type { Rng } from "../core/rng";
import type { Place, Stats } from "../core/stats";
import { cityBounds, isPlan, NO_PLACES_BOOST, roll, type City, type Kind, type LatLon, type Plan, type Trips } from "../core/trips";

/** Where he is when a trip comes up. */
export type Where = { here: LatLon; city: string; country: string; places: Place[]; noPlaces: boolean };

export type JourneyDeps = {
  trips: Trips;
  rng: Rng;
  /** The trip roll in [0, 1); tests swap in fixed rolls. */
  roll?: () => number;
  /** The road a bus or car takes between two points, [] when unknown. */
  route: (a: LatLon, b: LatLon) => Promise<LatLon[]>;
  problem: (text: string) => void;
};

export class Journey {
  /** True until the first destination after choosing a city. */
  skipRoll = false;
  private log: Entry = {};
  /** The plan he is walking to the station for; a road that arrives later only goes to it. */
  private pending: Plan | null = null;

  constructor(private readonly deps: JourneyDeps) {}

  /** Asked on each new destination: a trip plan, or null to stay. What he plans goes in his history. */
  consider(at: Where, stats: Stats): Plan | null {
    this.pending = null;
    if (this.skipRoll) {
      this.skipRoll = false;
      this.log = { skipped: "first pick in a new city" };
      return null;
    }
    const r = this.deps.roll?.() ?? this.deps.rng.randf();
    const boost = at.noPlaces ? NO_PLACES_BOOST : 1;
    const kind = roll(r, boost);
    this.log = { roll: r, boost, outcome: kind };
    if (kind === "stay") return null;
    const found = this.destination(kind, at);
    if (!found) return null;
    const dest = { ...found, bounds: cityBounds(found) };
    const plan = this.deps.trips.planTrip(dest, at.here, at.places, stats.cents, stats.vehicle() === "car", this.deps.rng.randf(), stats.fareMult());
    if (!isPlan(plan)) {
      this.log.no_trip = plan.error;
      if (plan.short_of !== undefined) {
        stats.savingFor = plan.short_of;
        stats.say(`Wants to go to ${dest.name} but can't afford it yet, so he's saving up`);
      }
      return null;
    }
    stats.savingFor = 0;
    // Where to stays a surprise until he boards, so it can be guessed (core/guess.ts).
    stats.say(`Heading to ${plan.station.name} for the ${plan.mode} to ${kind === "country" ? "somewhere abroad" : `somewhere in ${dest.country}`} (${euro(plan.fare)})`);
    this.pending = plan;
    if (plan.mode !== "plane") void this.fetchRoad(plan);
    return plan;
  }

  /** At the station: pays and returns "", or returns why he stays (he saves up for it). */
  board(plan: Plan, stats: Stats): string {
    this.pending = null;
    const dest = plan.city;
    if (stats.cents < plan.fare) {
      stats.savingFor = plan.fare;
      stats.say(`Can't afford the ${plan.mode} to ${dest.name} any more, so he's saving up`);
      return `can't afford the ${plan.mode}: needs ${euro(plan.fare)}, has ${euro(stats.cents)}`;
    }
    setOff(stats, stats.ride(plan.fare, plan.mode, plan.station.name, `${dest.name}, ${dest.country}`));
    return "";
  }

  /** Debug: a city of `kind` to land in right now (with its city box), or null when there is none. */
  pickNow(kind: "city" | "country", at: Where, stats: Stats): City | null {
    this.log = {};
    const dest = this.destination(kind, at);
    if (!dest) return null;
    setOff(stats, `Set off for ${dest.name}, ${dest.country}`);
    return { ...dest, bounds: cityBounds(dest) };
  }

  /** What the last roll did, for the debug log; cleared once read. */
  takeLog(): Entry {
    const e = this.log;
    this.log = {};
    return e;
  }

  /** A city for a trip of `kind`, with how many there were and its odds noted for the log. */
  private destination(kind: Kind, at: Where): City | null {
    const { trips, rng } = this.deps;
    const opts = trips.options(kind, at.country, at.here[0], at.here[1]);
    const dest = trips.pick(kind, at.country, at.here[0], at.here[1], rng);
    if (!dest) {
      this.log.no_trip = "no other city to go to";
      this.deps.problem(`A trip was rolled but there is no city to go to from ${at.city}`);
      return null;
    }
    const total = opts.reduce((a, c) => a + c.pop, 0);
    Object.assign(this.log, { options: opts.length, chance: dest.pop / Math.max(total, 1) });
    return dest;
  }

  /** Asks for the road the bus or car takes; a ride that starts before the answer goes in a straight line. */
  private async fetchRoad(plan: Plan): Promise<void> {
    const path = await this.deps.route([plan.station.lat, plan.station.lon], plan.arrive);
    if (path.length > 0 && this.pending === plan) plan.path = path;
  }
}

function setOff(stats: Stats, line: string): void {
  stats.say(line);
  stats.history.breakTrail();
}
