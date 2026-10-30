// While you were away: lets the hours the game was closed pass for him in one
// go, without walking the map or loading any streets. He hops from place to
// place by the usual goal odds (a straight line x ROAD_FACTOR of walking
// each), does an action at each, rolls the trip dice as usual and pays and
// rides like he would. In a city whose places aren't loaded he visits
// made-up places of the usual kinds ("a cafe in Lyon"). Pure: the game
// applies where he ends up.
import { anyUrgent, choose, exploreWeight, needOf, restMinutes, type Activities } from "./activities";
import { distanceM, offsetM, type BBox } from "./geo";
import { distanceWeight, headingWeight, nearWeight, pickIndex, randomSpot, rankWeight, urgentRules, weigh, type Vec } from "./goals";
import { euro } from "./money";
import type { Rng } from "./rng";
import type { Action, Place, Stats } from "./stats";
import { cityBounds, isPlan, NO_PLACES_BOOST, rideS, roll, ROAD_FACTOR, type LatLon, type Trips } from "./trips";
import { ARRIVE_M } from "./walker";

/** Most time away that counts; the rest is lost. */
export const MAX_AWAY_S = 24 * 3600;
/** Shorter absences don't get a catch-up. */
export const MIN_AWAY_S = 60;
/** Time passes in steps of at most this many minutes, so hunger and fainting land when they should. */
const STEP_MIN = 10;
/** Made-up places drawn for each pick in a city without loaded places. */
const MADE_UP_TRIES = 12;

/** The kinds of made-up places and how common they are (from the POI sweep of 8 big cities). */
export const MADE_UP_KINDS: { class: string; subclass: string; label: string; weight: number }[] = [
  { class: "restaurant", subclass: "restaurant", label: "restaurant", weight: 27 },
  { class: "clothing_store", subclass: "clothes", label: "clothes shop", weight: 14 },
  { class: "cafe", subclass: "cafe", label: "cafe", weight: 11 },
  { class: "fast_food", subclass: "fast_food", label: "snack bar", weight: 9 },
  { class: "lodging", subclass: "hotel", label: "hotel", weight: 7 },
  { class: "bar", subclass: "bar", label: "bar", weight: 5 },
  { class: "shop", subclass: "convenience", label: "corner shop", weight: 5 },
  { class: "art_gallery", subclass: "artwork", label: "street artwork", weight: 4 },
  { class: "pharmacy", subclass: "pharmacy", label: "pharmacy", weight: 3 },
  { class: "bank", subclass: "bank", label: "bank", weight: 2.5 },
  { class: "beer", subclass: "pub", label: "pub", weight: 2.5 },
  { class: "bakery", subclass: "bakery", label: "bakery", weight: 2.4 },
  { class: "park", subclass: "park", label: "park", weight: 2 },
  { class: "grocery", subclass: "supermarket", label: "supermarket", weight: 2 },
  { class: "place_of_worship", subclass: "christian", label: "church", weight: 1.7 },
  { class: "library", subclass: "library", label: "library", weight: 1 },
  { class: "museum", subclass: "museum", label: "museum", weight: 1 },
  { class: "ice_cream", subclass: "ice_cream", label: "ice cream parlour", weight: 0.9 },
  { class: "laundry", subclass: "dry_cleaning", label: "laundry", weight: 0.9 },
];

/** A city he is in while away; `places` null means none are loaded, so he visits made-up ones. */
export type AwayCity = { name: string; code: string; center: LatLon; bounds: BBox; places: Place[] | null };

export type CatchUpDeps = {
  activities: Activities;
  trips: Trips;
  rng: Rng;
  /** Rolls for keepsakes (cards and their finish), apart from `rng` so a card roll never uses up his other dice. */
  cardRng?: Rng;
  /** The hour of day at unix ms, for actions that need a time of day. */
  hourAt: (ms: number) => number;
  /** The trip roll in [0, 1); tests swap in fixed rolls. */
  roll?: () => number;
  /** Trivia actions for the city he starts in. */
  facts?: Action[];
  /** True when the first pick should skip the trip dice (just after landing). */
  skipRoll?: boolean;
};

export type Line = { text: string; t: number };

/** What happened, for the summary card. */
export type Summary = {
  awayS: number;
  coveredS: number;
  walkedM: number;
  stops: number;
  firstVisits: number;
  /** Cities he reached, in order. */
  cities: string[];
  faints: number;
  startCents: number;
  endCents: number;
  startLevel: number;
  endLevel: number;
  /** "Bought ..." lines. */
  bought: string[];
  /** Everything he did, oldest first. */
  lines: Line[];
  /** Where he is at the end: the city, the spot and the place he stays at (null for a made-up place or none). */
  end: { city: AwayCity; at: LatLon; place: Place | null; skipRoll: boolean };
};

/** Lets `awayS` seconds (at most MAX_AWAY_S) from `startMs` pass for him, starting at `here` in `city`, all at once. Changes `stats`. */
export function catchUp(stats: Stats, city: AwayCity, here: LatLon, awayS: number, startMs: number, deps: CatchUpDeps): Summary {
  const steps = catchUpSteps(stats, city, here, awayS, startMs, deps);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/** Like catchUp, pausing after every place he visits, so the game can split the work and keep the page responsive. */
export function* catchUpSteps(stats: Stats, city: AwayCity, here: LatLon, awayS: number, startMs: number, deps: CatchUpDeps): Generator<void, Summary> {
  const { activities, trips, rng } = deps;
  const coveredS = Math.min(Math.max(awayS, 0), MAX_AWAY_S);
  const s: Summary = {
    awayS,
    coveredS,
    walkedM: 0,
    stops: 0,
    firstVisits: 0,
    cities: [],
    faints: 0,
    startCents: stats.cents,
    endCents: stats.cents,
    startLevel: stats.level,
    endLevel: stats.level,
    bought: [],
    lines: [],
    end: { city, at: here, place: null, skipRoll: !!deps.skipRoll },
  };
  let elapsed = 0;
  let heading: Vec = [0, 0];
  let skipRoll = !!deps.skipRoll;
  let facts = deps.facts ?? [];
  /** The city's places as flat meters from its middle, worked out once per city. */
  let flat: Flat = { of: null, x: [], y: [], rank: [], kind: [], kinds: [] };
  const clock = stats.now;
  const heard = stats.onSay;
  stats.now = () => Math.floor(startMs / 1000 + elapsed);
  stats.onSay = (text, t) => {
    s.lines.push({ text, t });
    if (text.startsWith("Bought")) s.bought.push(text);
  };
  const leftMin = () => (coveredS - elapsed) / 60;

  /** Lets `minutes` pass, `walkedM` of them on foot (or in his vehicle). */
  const pass = (minutes: number, walkedM: number) => {
    let left = minutes;
    while (left > 1e-9) {
      const m = Math.min(left, STEP_MIN);
      const w = (walkedM * m) / minutes;
      stats.passTime(m, w);
      if (w > 0) stats.walkFor(m, rng);
      elapsed += m * 60;
      left -= m;
      if (stats.fainted()) faint();
    }
  };
  const faint = () => {
    s.faints++;
    const hospital = nearest(city.places ?? [], here, (p) => p.class === "hospital");
    stats.wakeInHospital(hospital?.name ?? "");
    if (hospital) moveTo(hospital, [hospital.lat, hospital.lon]);
  };
  const moveTo = (place: Place | null, at: LatLon) => {
    const v = offsetM(here[0], here[1], at[0], at[1]);
    const len = Math.hypot(v[0], v[1]);
    heading = len > ARRIVE_M ? [v[0] / len, v[1] / len] : [0, 0];
    here = at;
    s.end.place = place && city.places ? place : null;
    // No trail: he didn't really walk the streets in between, so only the spot is marked.
    stats.history.breakTrail();
    stats.history.moveTo(at[0], at[1]);
  };
  /** Walks `m` meters, or as far as the time left allows; false when time ran out first. */
  const walk = (m: number) => {
    const min = m / stats.speedMps() / 60;
    if (min > leftMin()) return false;
    pass(min, m);
    s.walkedM += m;
    return true;
  };

  try {
    stats.history.breakTrail();
    while (leftMin() > 0) {
      if (tryTrip()) continue;
      if (elapsed >= coveredS) break;
      const place = pickPlace();
      if (!walk(distanceM(here[0], here[1], place.lat, place.lon) * ROAD_FACTOR)) break;
      moveTo(place, [place.lat, place.lon]);
      stats.stop(place);
      if (city.places) {
        const bonus = stats.visit(place);
        if (bonus > 0) s.firstVisits++;
        stats.say(bonus > 0 ? `Reached ${place.name} for the first time (+${bonus} XP)` : `Reached ${place.name}`);
        stats.care.open(stats);
        stats.collect(place, deps.cardRng ?? rng);
      } else {
        stats.say(`Reached ${place.name}`);
        stats.care.open(stats);
      }
      // A made-up place here ("a park in Lyon") is no real park to build at.
      stats.bricksAt(city.places ? place : { ...place, made: true });
      s.stops++;
      const action = choose([...activities.forPlace(place, city.code), ...facts], stats, deps.hourAt(startMs + elapsed * 1000), rng.randf());
      if (action) stats.do(action, place.name, action.pack ? (deps.cardRng ?? rng) : rng, place.class);
      pass(Math.min(restMinutes(action ?? { name: "", min: 1 }), leftMin()), 0);
      yield;
    }
    if (leftMin() > 0) pass(leftMin(), 0);
  } finally {
    stats.now = clock;
    stats.onSay = heard;
  }
  s.endCents = stats.cents;
  s.endLevel = stats.level;
  s.end.city = city;
  s.end.at = here;
  s.end.skipRoll = skipRoll;
  return s;

  /** Rolls the trip dice; true when he went somewhere (or the time ran out on the way). */
  function tryTrip(): boolean {
    if (skipRoll) {
      skipRoll = false;
      return false;
    }
    if (anyUrgent(stats)) return false;
    const places = city.places ?? [];
    const kind = roll(deps.roll?.() ?? rng.randf(), places.length ? 1 : NO_PLACES_BOOST);
    if (kind === "stay") return false;
    const found = trips.pick(kind, city.code, here[0], here[1], rng);
    if (!found) return false;
    const dest = { ...found, bounds: cityBounds(found) };
    const plan = trips.planTrip(dest, here, city.places ?? madeUpStations(city), stats.cents, stats.vehicle() === "car", rng.randf(), stats.fareMult());
    if (!isPlan(plan)) {
      if (plan.short_of !== undefined) {
        stats.savingFor = plan.short_of;
        stats.say(`Wants to go to ${dest.name} but can't afford it yet, so he's saving up`);
      }
      return false;
    }
    // A trip that can't finish in the time left waits until the game is open.
    const toStationM = distanceM(here[0], here[1], plan.station.lat, plan.station.lon) * ROAD_FACTOR;
    const rideMin = rideS(plan.mode, plan.distance_m) / 60;
    if (toStationM / stats.speedMps() / 60 + rideMin > leftMin()) return false;
    stats.savingFor = 0;
    stats.say(`Heading to ${plan.station.name} for the ${plan.mode} to ${dest.name} (${euro(plan.fare)})`);
    walk(toStationM);
    moveTo(plan.station, [plan.station.lat, plan.station.lon]);
    if (stats.cents < plan.fare) {
      stats.savingFor = plan.fare;
      stats.say(`Can't afford the ${plan.mode} to ${dest.name} any more, so he's saving up`);
      return true;
    }
    stats.say(stats.ride(plan.fare, plan.mode, plan.station.name, `${dest.name}, ${dest.country}`));
    pass(rideMin, 0);
    city = { name: `${dest.name}, ${dest.country}`, code: dest.code, center: [dest.lat, dest.lon], bounds: dest.bounds, places: null };
    facts = [];
    s.cities.push(city.name);
    stats.arrive(city.name, dest.code, dest.country);
    stats.week.city(city.name);
    moveTo(null, plan.arrive);
    heading = [0, 0];
    stats.say(`Arrived in ${city.name}`);
    skipRoll = true;
    return true;
  }

  /** The next place: a real one by the usual goal odds (see goals.ts), or a made-up one where none are loaded. */
  function pickPlace(): Place {
    const real = city.places ?? [];
    if (flat.of !== real) flat = flatten(real, city.center);
    // Need depends only on the kind of place, so it is worked out once per kind.
    const hour = deps.hourAt(startMs + elapsed * 1000);
    const need = flat.kinds.map((p) => needOf(activities.peek(p, city.code), stats, hour));
    const [hx, hy] = offsetM(city.center[0], city.center[1], here[0], here[1]);
    const [keep, r] = urgentRules(need, rng.randf());
    let any = false;
    const weights = real.map((_, i) => {
      const n = need[flat.kind[i]!]!;
      if (keep && !keep(n)) return 0;
      const v: Vec = [flat.x[i]! - hx, flat.y[i]! - hy];
      const d = Math.hypot(v[0], v[1]);
      if (d <= ARRIVE_M) return 0;
      any = true;
      return (keep ? nearWeight(d) * n.pull : flat.rank[i]! * distanceWeight(d) * headingWeight(heading, v) * n.pull) * exploreWeight(real[i]!, stats);
    });
    if (any) return real[pickIndex(weights, r)]!;
    const made = madeUp();
    const madeNeed = made.map((p) => needOf(activities.peek(p, city.code), stats, hour));
    const [keepMade, rMade] = urgentRules(madeNeed, rng.randf());
    return made[pickIndex(made.map((p, i) => (keepMade && !keepMade(madeNeed[i]!) ? 0 : weigh(p, here, heading, madeNeed[i]!.pull, !!keepMade).weight)), rMade)]!;
  }

  function madeUp(): Place[] {
    const town = city.name.split(",")[0]!;
    const out: Place[] = [];
    for (let i = 0; i < MADE_UP_TRIES; i++) {
      const k = MADE_UP_KINDS[pickIndex(MADE_UP_KINDS.map((x) => x.weight), rng.randf())]!;
      const [lat, lon] = randomSpot(rng, city.bounds, here, heading);
      out.push({ name: `${/^[aeiou]/.test(k.label) ? "an" : "a"} ${k.label} in ${town}`, class: k.class, subclass: k.subclass, rank: 1, lat, lon });
    }
    return out;
  }
}

type Flat = { of: Place[] | null; x: number[]; y: number[]; rank: number[]; kind: number[]; kinds: Place[] };

/** East/north meters of each place from `center`, its rank weight and its kind (one place of each kind in `kinds`), so a pick is cheap. */
function flatten(places: Place[], center: LatLon): Flat {
  const f: Flat = { of: places, x: [], y: [], rank: places.map(rankWeight), kind: [], kinds: [] };
  const index = new Map<string, number>();
  for (const p of places) {
    const v = offsetM(center[0], center[1], p.lat, p.lon);
    f.x.push(v[0]);
    f.y.push(v[1]);
    const k = `${p.class}/${p.subclass}`;
    let i = index.get(k);
    if (i === undefined) {
      index.set(k, (i = f.kinds.length));
      f.kinds.push(p);
    }
    f.kind.push(i);
  }
  return f;
}

/** A bus station and a gas station in the middle of a city whose places aren't loaded, so he can leave it. */
function madeUpStations(city: AwayCity): Place[] {
  const town = city.name.split(",")[0]!;
  const [lat, lon] = city.center;
  return [
    { name: `${town} bus station`, class: "bus", subclass: "bus_station", rank: 1, lat, lon },
    { name: `a gas station in ${town}`, class: "fuel", subclass: "fuel", rank: 1, lat, lon },
  ];
}

function nearest(places: Place[], at: LatLon, test: (p: Place) => boolean): Place | null {
  let best: Place | null = null;
  let bestD = Infinity;
  for (const p of places) {
    const d = distanceM(at[0], at[1], p.lat, p.lon);
    if (test(p) && d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}
