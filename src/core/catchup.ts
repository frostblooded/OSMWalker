// While you were away: lets the hours the game was closed pass for him in one
// go, without walking the map or loading any streets. He hops from place to
// place by the usual goal odds (a straight line x ROAD_FACTOR of walking, or
// a flight on a flying mount, see legM), does an action at each, rolls the
// trip dice as usual and pays and rides like he would (or steps through a
// portal, see portals.ts), and the storyteller
// may bring an incident at a stop (see storyteller.ts); he takes on quests
// and joins world events as he would while watched (see quests.ts). In a city whose
// places aren't loaded he visits made-up places of the usual kinds ("a cafe
// in Lyon"). The sky (sun, season and closed places, no weather) follows the hour
// he is in. Pure: the game applies where he ends up.
import { anyUrgent, choose, minded, placePull, needOf, restMinutes, type Activities } from "./activities";
import { distanceM, offsetM, type BBox } from "./geo";
import { distanceWeight, headingWeight, nearWeight, pickIndex, randomSpot, rankWeight, urgentRules, weigh, type Vec } from "./goals";
import { isOpen } from "./opening";
import { skyNeed, type Sky } from "./sky";
import { Rng, seedOf } from "./rng";
import { FLYERS } from "./speeds";
import { questGoal, questStop } from "./quests";
import type { Action, Place, Stats } from "./stats";
import { cityBounds, cityKey, heading as headingLine, isPlan, NO_PLACES_BOOST, rideS, roll, ROAD_FACTOR, type City, type LatLon, type Mode, type Trips } from "./trips";
import { ARRIVE_M, FLY_MIN_M, LAND_KINDS, LAND_MAX_M, LAND_SHARE } from "./walker";

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

/** A city he is in while away; `places` null means none are loaded, so he visits made-up ones. `pop` sizes its quest board. */
export type AwayCity = { name: string; code: string; center: LatLon; bounds: BBox; places: Place[] | null; pop?: number; /** The cities.tsv "Name, Country" key, when he's in a listed city: city quests match on it. */ key?: string };

export type CatchUpDeps = {
  activities: Activities;
  trips: Trips;
  rng: Rng;
  /** Rolls for keepsakes (cards and their finish), apart from `rng` so a card roll never uses up his other dice. */
  cardRng?: Rng;
  /** The sky over `city` at unix ms: the time of day and season (the catch-up drops the weather). */
  skyAt: (ms: number, city: AwayCity) => Sky;
  /** The trip roll in [0, 1); tests swap in fixed rolls. */
  roll?: () => number;
  /** Trivia actions for the city he starts in. */
  facts?: Action[];
  /** True when the first pick should skip the trip dice (just after landing). */
  skipRoll?: boolean;
};

export type Line = { text: string; t: number };

/** A leg of his way: meters flown, then meters on the streets, on foot when `afoot` (after a flyer lands). */
export type Leg = { airM: number; groundM: number; afoot: boolean };

/**
 * His way from `from` to `to`: the streets (ROAD_FACTOR x the straight
 * line), or on a flying mount, by the rules of walker.ts takeOff, a straight
 * flight to a park or garden near `to` and a walk on foot from there.
 * There are no streets here, so takeOff's check for a corner within SNAP_M
 * of the park is left out.
 */
export function legM(stats: Stats, from: LatLon, to: LatLon, places: Place[] | null): Leg {
  const line = distanceM(from[0], from[1], to[0], to[1]);
  const streets: Leg = { airM: 0, groundM: line * ROAD_FACTOR, afoot: false };
  if (!FLYERS.has(stats.getsAbout()) || line < FLY_MIN_M || !places) return streets;
  let pad: Place | null = null;
  let padM = Math.min(LAND_MAX_M, line * LAND_SHARE);
  for (const q of places) {
    if (!LAND_KINDS.has(q.class)) continue;
    const m = distanceM(q.lat, q.lon, to[0], to[1]);
    if (m < padM) [pad, padM] = [q, m];
  }
  return pad ? { airM: distanceM(from[0], from[1], pad.lat, pad.lon), groundM: padM * ROAD_FACTOR, afoot: true } : streets;
}

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
  /** Cents his businesses paid him, and the lottery. */
  takings: number;
  lotteryWon: number;
  /** "Bought ..." lines. */
  bought: string[];
  /** He was due to retire (his elder stage ran out, or you asked on a ride), so the catch-up stopped there (coveredS is up to then): "soon", or "done" once the game has retired him. */
  retire?: "soon" | "done";
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
    takings: 0,
    lotteryWon: 0,
    bought: [],
    lines: [],
    end: { city, at: here, place: null, skipRoll: !!deps.skipRoll },
  };
  const earned0 = stats.business.earned;
  const won0 = stats.lottery.won;
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
  /** The sky of the hour he is in: the sun, the season and opening hours count while away, the weather doesn't. */
  const skyNow = () => (stats.sky = { ...deps.skyAt(startMs + elapsed * 1000, city), weather: null });

  /** Lets `minutes` pass, `walkedM` of them on the move (on foot when `afoot`, else as he gets about). */
  const pass = (minutes: number, walkedM: number, afoot = false) => {
    let left = minutes;
    while (left > 1e-9) {
      const m = Math.min(left, STEP_MIN);
      const w = (walkedM * m) / minutes;
      skyNow();
      stats.passTime(m, w, afoot);
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
  /** Minutes a leg takes: the flight at his mount's speed, the streets at his speed then. */
  const legMin = (leg: Leg) => (leg.airM / stats.speedMps() + leg.groundM / stats.speedMps(leg.afoot)) / 60;
  /** Goes a leg, or as far as the time left allows; false when time ran out first. */
  const walk = (leg: Leg) => {
    skyNow();
    if (legMin(leg) > leftMin()) return false;
    if (leg.airM) pass(leg.airM / stats.speedMps() / 60, leg.airM);
    pass(leg.groundM / stats.speedMps(leg.afoot) / 60, leg.groundM, leg.afoot);
    s.walkedM += leg.airM + leg.groundM;
    return true;
  };

  try {
    stats.history.breakTrail();
    while (leftMin() > 0) {
      // His elder stage ran out, or you asked: the game retires him, and his heir starts on the real clock.
      if (stats.life.leaving) break;
      // His dragon eats before each leg, as before each step of a watched walk, so a fed one flies it.
      stats.feedDragon(rng);
      if (tryTrip()) continue;
      if (elapsed >= coveredS) break;
      // Quests and events need real places; in a city whose places aren't loaded he just lives his day.
      const cardRng = deps.cardRng ?? rng;
      if (stats.quests.city !== city.name || !stats.quests.rolled) stats.quests.roll(city.name, city.pop ?? 0, city.places ?? [], cardRng, city.key ?? city.name, stats.bond.leaning());
      skyNow();
      const place = (city.places && questGoal(stats, city.places, here, cardRng)) || pickPlace();
      if (!place) {
        // Everything near is closed: like the walker, he heads for a random spot and walks on.
        const spot = randomSpot(rng, city.bounds, here, heading);
        if (!walk(legM(stats, here, spot, city.places))) break;
        moveTo(null, spot);
        yield;
        continue;
      }
      if (!walk(legM(stats, here, [place.lat, place.lon], city.places))) break;
      moveTo(place, [place.lat, place.lon]);
      const sky = skyNow();
      if (!isOpen(place, sky.clock, sky.holiday)) {
        stats.say(`Found ${place.name} closed`);
        pass(Math.min(restMinutes({ name: "", min: 1 }), leftMin()), 0);
        yield;
        continue;
      }
      if (city.places) {
        // Visit first, as the watched game does, so his spot counts this visit.
        const bonus = stats.visit(place);
        stats.stop(place);
        if (bonus > 0) s.firstVisits++;
        stats.say(bonus > 0 ? `Reached ${place.name} for the first time (+${bonus} XP)` : `Reached ${place.name}`);
        stats.care.open(stats);
        stats.collect(place, deps.cardRng ?? rng);
      } else {
        stats.stop({ ...place, made: true });
        stats.say(`Reached ${place.name}`);
        stats.care.open(stats);
      }
      // A made-up place here ("a park in Lyon") is no real park to build at.
      stats.bricksAt(city.places ? place : { ...place, made: true });
      stats.meetAt(place);
      // Ley lines and old books are in real churches and libraries only.
      if (city.places) stats.magicAt(place);
      stats.wordAt(place);
      // Giants show from real waterfronts and viewpoints only.
      if (city.places) stats.giantAt(place);
      const nap = city.places ? stats.fairyAt(place, sky.hour) : 0;
      if (nap) {
        s.stops++;
        pass(Math.min(nap, leftMin()), 0);
        yield;
        continue;
      }
      const door = city.places ? stats.portalAt(place, trips) : null;
      if (door) {
        s.stops++;
        landIn(door, "portal", place.lon, [door.lat, door.lon], 0);
        yield;
        continue;
      }
      // The police roll their own dice too; he picks how the chase goes, and jail takes its hours.
      if (stats.reputeAt(place)) {
        // A chase takes the place of the stop's action, as while you watch; jail takes its hours.
        const jail = stats.runChase(place.name);
        s.stops++;
        pass(Math.min(jail || restMinutes({ name: "", min: 1 }), leftMin()), 0);
        yield;
        continue;
      }
      // Incidents roll on the card dice too, so they leave his walk the same.
      stats.happen(place, sky.hour, cardRng);
      s.stops++;
      const story = city.places ? questStop(stats, place, city.places, sky.hour, cardRng) : null;
      if (story !== null) {
        pass(Math.min(story, leftMin()), 0);
        yield;
        continue;
      }
      const action = choose([...activities.forPlace(place, city.code, sky.holiday), ...facts], stats, sky.hour, rng.randf(), place.class);
      if (action) stats.do(action, place.name, action.pack ? (deps.cardRng ?? rng) : rng, place.class);
      pass(Math.min(restMinutes(action ?? { name: "", min: 1 }), leftMin()), 0);
      yield;
    }
    if (stats.life.leaving) {
      s.retire = "soon";
      s.coveredS = Math.min(elapsed, coveredS);
    } else if (leftMin() > 0) pass(leftMin(), 0);
  } finally {
    stats.now = clock;
    stats.onSay = heard;
  }
  s.endCents = stats.cents;
  s.endLevel = stats.level;
  s.takings = stats.business.earned - earned0;
  s.lotteryWon = stats.lottery.won - won0;
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
    if (anyUrgent(stats) || stats.quests.active) return false;
    const places = city.places ?? [];
    const kind = roll(deps.roll?.() ?? rng.randf(), places.length ? 1 : NO_PLACES_BOOST, stats.visas.urge());
    if (kind === "stay") return false;
    const home = stats.home.has() ? trips.homeward(stats.home, stats.where.city, new Rng(seedOf(`home${stats.now()}`)).randf()) : null;
    const found = home ?? trips.pick(kind, city.code, here[0], here[1], rng);
    if (!found) return false;
    const dest = { ...found, bounds: cityBounds(found) };
    const plan = trips.planTrip(dest, here, city.places ?? madeUpStations(city), stats.cents, stats.vehicle() === "car", rng.randf(), stats.fareMult(), stats.vehicle() === "bike", stats.vehicle() === "");
    if (!isPlan(plan)) {
      if (plan.short_of !== undefined) {
        stats.savingFor = plan.short_of;
        stats.say(`Wants to go to ${dest.name} but can't afford it yet, so he's saving up`);
      }
      return false;
    }
    // A trip that can't finish in the time left doesn't start; the dice roll again at his next stop.
    const toStation = legM(stats, here, [plan.station.lat, plan.station.lon], city.places);
    const rideMin = rideS(plan.mode, plan.distance_m) / 60;
    if (legMin(toStation) + rideMin > leftMin()) return false;
    stats.savingFor = 0;
    stats.say(headingLine(plan, dest.name));
    walk(toStation);
    moveTo(plan.station, [plan.station.lat, plan.station.lon]);
    if (stats.cents < plan.fare) {
      stats.savingFor = plan.fare;
      stats.say(`Can't afford the ${plan.mode} to ${dest.name} any more, so he's saving up`);
      return true;
    }
    for (const line of stats.board(plan.fare, plan.mode, plan.station.name, `${dest.name}, ${dest.country}`, dest.code)) stats.say(line);
    pass(rideMin, 0);
    landIn(dest, plan.mode, plan.station.lon, plan.arrive, plan.distance_m);
    return true;
  }

  /** Lands in `dest` at `at` after `distM` by `mode` from longitude `fromLon`, as the watched game does on landing. */
  function landIn(dest: City, mode: Mode, fromLon: number, at: LatLon, distM: number): void {
    city = { name: cityKey(dest), code: dest.code, center: [dest.lat, dest.lon], bounds: dest.bounds ?? cityBounds(dest), places: null };
    facts = [];
    s.cities.push(city.name);
    stats.life.mark(city.name, city.center);
    stats.arrive(city.name, dest.code, dest.country);
    stats.week.city(city.name);
    moveTo(null, at);
    heading = [0, 0];
    stats.say(`Arrived in ${city.name}`);
    for (const line of stats.land(mode, fromLon, at[1], distM, city.name)) stats.say(line);
    skipRoll = true;
  }

  /** The next place: a real one by the usual goal odds (see goals.ts), or a made-up one where none are loaded; null when every one is closed. */
  function pickPlace(): Place | null {
    const real = city.places ?? [];
    if (flat.of !== real) flat = flatten(real, city.center);
    // Need depends only on the kind of place, so it is worked out once per kind.
    const sky = skyNow();
    const need = flat.kinds.map((p) => minded(skyNeed(needOf(activities.peek(p, city.code), stats, sky.hour, p.class), p, sky), p, stats));
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
      return (keep ? nearWeight(d) * n.pull : flat.rank[i]! * distanceWeight(d) * headingWeight(heading, v) * n.pull) * placePull(real[i]!, stats, sky.hour);
    });
    const pick = (places: Place[], w: number[], r: number) => (w.some((x) => x > 0) ? places[pickIndex(w, r)]! : null);
    if (any) return pick(real, weights, r);
    const made = madeUp();
    const madeNeed = made.map((p) => minded(skyNeed(needOf(activities.peek(p, city.code), stats, sky.hour, p.class), p, sky), p, stats));
    const [keepMade, rMade] = urgentRules(madeNeed, rng.randf());
    return pick(made, made.map((p, i) => (keepMade && !keepMade(madeNeed[i]!) ? 0 : weigh(p, here, heading, madeNeed[i]!.pull, !!keepMade).weight)), rMade);
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
