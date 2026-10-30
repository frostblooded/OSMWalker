// The character's walk along the street graph: he picks a place of note (a
// shop, a cafe, a sight...), heads there by the shortest route over the
// streets loaded so far (re-planning as more load), stays a minute at most,
// then picks the next one. Places weigh by importance, by a medium walking
// distance, by lying ahead along his last leg, and less when he went there
// lately. With no places loaded yet he heads for a random spot near and ahead
// of him and walks on without stopping there.
// Instead of a new goal he may travel to another city (see trips.ts): he
// walks to a bus station, airport or gas station, then rides there.
// On a flying mount he flies straight to a park or garden near a far goal,
// lands there and walks the rest.
// Pure logic: no DOM, no networking, so it is easy to test.
import { bboxAround, distanceM, latToPx, lonToPx, offsetM, pxToLat, pxToLon, type BBox } from "./geo";
import { NO_NEED, pickIndex, randomSpot, urgentRules, weigh, type Need, type Vec, type Weights } from "./goals";
import { StreetGraph } from "./graph";
import { planRoute } from "./route";
import { Rng } from "./rng";
import type { Place } from "./stats";
import { rideS, type City, type LatLon, type Mode, type Plan } from "./trips";

/** The game clock: time is counted in these meters per second, so rests and trips last the same whatever his speed. */
export const SPEED_MPS = 200 / 60;
/** He stays a minute at each place, and never longer, counted in clock meters. */
export const REST_M = SPEED_MPS * 60;
/** Close enough to a destination to call it reached. */
export const ARRIVE_M = 30;
/** Destinations come from the searched place's box, kept between these sizes. */
export const MIN_CITY_RADIUS_M = 1500;
export const MAX_CITY_RADIUS_M = 25_000;
/** Goals given up on in a row before he just walks down a street, so a city where no goal can be reached never hangs. */
export const MAX_SKIPS = 3;
/** Where he stands on landing, until the new city's streets load. Never a tile or OSM id. */
export const ARRIVAL_NODE = Number.MAX_SAFE_INTEGER;
/** After a catch-up he stands on the nearest loaded corner when it is this close to where he ended up. */
export const SNAP_M = 100;
/** A flyer flies when his goal is at least this far, to a park or garden at most LAND_MAX_M from it and at most LAND_SHARE of his distance. */
export const FLY_MIN_M = 400;
export const LAND_MAX_M = 1500;
export const LAND_SHARE = 0.5;
export const LAND_KINDS: ReadonlySet<string> = new Set(["park", "garden"]);
/** A flight over the city: from where he took off to the corner `node` by the park he lands in. */
export type Flight = { from: LatLon; to: LatLon; node: number; total_m: number; left_m: number };
export type Travel = { from: LatLon; to: City; mode: Mode; path: LatLon[]; arrive: LatLon; total_m: number; left_m: number };
export type PickInfo = Record<string, unknown>;

export interface WalkerEvents {
  /** Arrived somewhere new: the trip's destination. */
  landed?(city: City): void;
  /** Reached a place of note. Listeners may change how long he stays with restFor(). */
  arrived?(place: Place): void;
  /** Picked a new goal or trip, and how. */
  picked?(info: PickInfo): void;
  /** Reached a trip's station. Listeners pay for it and return true to ride, or false to stay. */
  boarding?(plan: Plan): boolean;
  /** Something odd that the debug panel should show. */
  problem?(text: string): void;
}

/** Longest a walk to one goal may take before he gives up (it may be across water or behind a fence). */
export const tripLimitM = (straightM: number) => 2.5 * straightM + 2000;

/** Where destinations are picked: the searched place's box, grown or shrunk so it is never tiny and never a whole country. */
export function cityBounds(lat: number, lon: number, box?: BBox | null): BBox {
  const lo = bboxAround(lat, lon, MIN_CITY_RADIUS_M);
  if (!box) return lo;
  const hi = bboxAround(lat, lon, MAX_CITY_RADIUS_M);
  const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
  return [
    clamp(Math.min(box[0], lo[0]), hi[0], lo[0]),
    clamp(Math.min(box[1], lo[1]), hi[1], lo[1]),
    clamp(Math.max(box[2], lo[2]), lo[2], hi[2]),
    clamp(Math.max(box[3], lo[3]), lo[3], hi[3]),
  ];
}

export function pathLengthM(path: LatLon[]): number {
  let m = 0;
  for (let i = 1; i < path.length; i++) m += distanceM(path[i - 1]![0], path[i - 1]![1], path[i]![0], path[i]![1]);
  return m;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const kindOf = (p: Place) => `${p.class}/${p.subclass}`;

export class Walker {
  rng = new Rng();
  events: WalkerEvents = {};
  /** Asked on every destination pick: a trip plan, or null to stay. */
  tripPlanner: (() => Plan | null) | null = null;
  /** How fast he really moves on the streets (see Stats.speedMps). */
  speedMps = SPEED_MPS;
  /** True while he rides a flying mount; set by the game. */
  flies = false;
  flight: Flight | null = null;

  prevNode: number | null = null;
  fromNode: number | null = null;
  /** null while waiting for map data around fromNode. */
  toNode: number | null = null;
  /** Meters walked from fromNode towards toNode. */
  progressM = 0;
  totalM = 0;
  /** Where destinations are picked. */
  bounds: BBox | null = null;
  goal: LatLon | null = null;
  /** Street corner the goal snapped to, once streets there load. */
  goalNode: number | null = null;
  /** Nodes still to walk after fromNode. */
  route: number[] = [];
  /** True when the route ends at the goal. */
  routeArrives = false;
  /** Rest left at the current destination, in clock meters. */
  restM = 0;
  restTotalM = 0;
  restedM = 0;
  /** Walked since the current goal was picked. */
  tripM = 0;
  /** Straight-line distance to the goal when it was picked. */
  tripStartM = 0;
  /** The place of note he is heading to or resting at, null for a random spot. */
  place: Place | null = null;
  /** Where the current leg started, for his heading. */
  legFrom: LatLon | null = null;
  /** How a place meets his needs (see activities.ts needOf); set by the game. */
  need: ((p: Place) => Need) | null = null;
  /** A pull of one place on its own, on top of its kind's need (an Explore whisper's, see activities.ts exploreWeight); set by the game. */
  placePull: ((p: Place) => number) | null = null;
  /** The trip plan while he walks to its station. */
  departing: Plan | null = null;
  travel: Travel | null = null;
  private skips = 0;

  constructor(public graph: StreetGraph = new StreetGraph()) {}

  startAt(id: number): void {
    this.prevNode = null;
    this.flight = null;
    this.fromNode = id;
    this.toNode = null;
    this.progressM = 0;
    this.route = [];
  }

  private here(): boolean {
    return this.fromNode !== null && this.graph.hasNode(this.fromNode);
  }

  setGoal(lat: number, lon: number): void {
    this.place = null;
    this.goal = [lat, lon];
    this.goalNode = null;
    this.route = [];
    this.routeArrives = false;
    this.tripM = 0;
    this.tripStartM = 0;
    if (this.here()) {
      const p = this.position();
      this.tripStartM = distanceM(p[0], p[1], lat, lon);
      this.legFrom = p;
    }
  }

  /** Picks a place of note to walk to (a random spot while none are loaded), or sets off for a trip's station. */
  pickGoal(): void {
    const plan = this.tripPlanner?.();
    if (plan) {
      this.setGoal(plan.station.lat, plan.station.lon);
      this.place = plan.station;
      this.departing = plan;
      this.events.picked?.({ trip: `${plan.city.name}, ${plan.city.country}`, by: `${plan.mode} from ${plan.station.name}` });
      return;
    }
    if (!this.bounds && this.here()) {
      const p = this.position();
      this.bounds = cityBounds(p[0], p[1]);
    }
    const bounds = this.bounds ?? cityBounds(0, 0);
    let options = this.graph.placesIn(bounds);
    const info: PickInfo = { in_box: options.length, cells: this.graph.cells.size };
    if (this.here()) {
      const p = this.position();
      options = options.filter((q) => distanceM(p[0], p[1], q.lat, q.lon) > ARRIVE_M);
    }
    info.too_close = (info.in_box as number) - options.length;
    if (options.length > 0) {
      // Need depends only on the kind of place, so it is worked out once per kind.
      const kinds = new Map<string, Need>();
      const needs = options.map((q) => {
        const k = kindOf(q);
        let v = kinds.get(k);
        if (!v) kinds.set(k, (v = this.need?.(q) ?? NO_NEED));
        return v;
      });
      const [keep, r] = urgentRules(needs, this.rng.randf());
      let pairs = options.map((q, i) => [q, needs[i]!] as const);
      if (keep) {
        pairs = pairs.filter(([, v]) => keep(v));
        info.urgent_fixes = pairs.length;
      }
      const parts = pairs.map(([q, v]) => this.weigh(q, { ...v, urgent: !!keep }));
      const weights = parts.map((w) => w.weight);
      const i = pickIndex(weights, r);
      const [pl, need] = pairs[i]!;
      this.setGoal(pl.lat, pl.lon);
      this.place = pl;
      Object.assign(info, parts[i], {
        r,
        place: pl.name,
        class: pl.class,
        rank: Math.trunc(pl.rank ?? 1),
        total_weight: weights.reduce((a, w) => a + w, 0),
        ...(need.why && { need: need.why }),
      });
      this.events.picked?.(info);
      return;
    }
    const spot = this.randomSpot();
    this.setGoal(spot[0], spot[1]);
    info.spot = this.goal;
    info.fallback = info.in_box === 0 ? "no places loaded in the city box yet" : `every loaded place is within ${ARRIVE_M} m of him`;
    this.events.problem?.(`Picked a random spot: ${info.fallback}`);
    this.events.picked?.(info);
  }

  /** Debug: drops any rest or trip (landing where he was headed) and picks the next goal right away. */
  forceNewGoal(): void {
    this.landNow();
    this.departing = null;
    this.restM = 0;
    this.restTotalM = 0;
    this.pickGoal();
  }

  /** Debug: rides to `city` and lands there at once, ending any rest. */
  rideNow(city: City): void {
    this.restM = 0;
    this.startTravel(city);
    this.land();
  }

  /** After fainting: stands at `node` (null: where he is) and rests a minute at `place`. Says whether he moved. */
  wakeAt(node: number | null, place: Place | null): boolean {
    const moved = node !== null && !this.travel;
    if (moved) this.startAt(node);
    else if (this.flight) this.startAt(this.flight.node);
    this.restFor(1);
    this.place = place;
    return moved;
  }

  /**
   * Puts him at `at` without walking there (after the catch-up), with nothing
   * planned: on the nearest loaded corner when one is within SNAP_M, else on
   * a lone point until the streets there load. A new city drops the graph.
   */
  relocate(at: LatLon, bounds: BBox, newCity: boolean): void {
    this.travel = null;
    this.flight = null;
    this.departing = null;
    this.place = null;
    this.goal = null;
    this.goalNode = null;
    this.route = [];
    this.routeArrives = false;
    this.restM = 0;
    this.restTotalM = 0;
    this.legFrom = null;
    this.tripM = 0;
    this.tripStartM = 0;
    this.bounds = bounds;
    if (newCity) this.graph = new StreetGraph();
    const near = this.graph.nearestNode(at[0], at[1]);
    const p = near === null ? null : this.graph.nodes.get(near)!;
    if (near !== null && p && distanceM(at[0], at[1], p[0], p[1]) <= SNAP_M) return this.startAt(near);
    this.graph.nodes.set(ARRIVAL_NODE, [at[0], at[1]]);
    this.startAt(ARRIVAL_NODE);
  }

  /** The point he is walking towards right now: the goal, else the next corner; null when neither. */
  aim(): LatLon | null {
    if (this.goal) return this.goal;
    return this.toNode !== null ? (this.graph.nodes.get(this.toNode) ?? null) : null;
  }

  /** Ends the trip now, in its destination. */
  landNow(): void {
    if (this.travel) this.land();
  }

  /** Direction (east, north unit vector) of his last leg, from where it started to where he is now; zero when there is none. */
  heading(): Vec {
    if (!this.legFrom || !this.here()) return [0, 0];
    const p = this.position();
    const v = offsetM(this.legFrom[0], this.legFrom[1], p[0], p[1]);
    const len = Math.hypot(v[0], v[1]);
    return len > ARRIVE_M ? [v[0] / len, v[1] / len] : [0, 0];
  }

  /** How much a place weighs as his next goal, and why (see goals.ts). */
  weigh(p: Place, need: Need = this.need?.(p) ?? NO_NEED): Weights {
    return weigh(p, this.here() ? this.position() : null, this.heading(), need.pull * (this.placePull?.(p) ?? 1), need.urgent);
  }

  /** A spot in the city box, drawn with the same distance and heading odds as places. */
  randomSpot(): LatLon {
    return randomSpot(this.rng, this.bounds ?? cityBounds(0, 0), this.here() ? this.position() : null, this.heading());
  }

  /**
   * Sets off for `city` by `mode` along `path` (a straight line to `arrive`,
   * or the city, when shorter than 2 points). The ride uses up clock time.
   */
  startTravel(city: City, mode: Mode = "plane", path: LatLon[] = [], arrive: LatLon | null = null): void {
    const p = this.position();
    const at: LatLon = arrive ?? [city.lat, city.lon];
    const line = path.length >= 2 ? path : [p, at];
    const m = rideS(mode, pathLengthM(line)) * SPEED_MPS;
    this.travel = { from: p, to: city, mode, path: line, arrive: at, total_m: m, left_m: m };
    this.flight = null;
    this.departing = null;
    this.place = null;
    this.goal = null;
    this.goalNode = null;
    this.route = [];
    this.routeArrives = false;
  }

  isTraveling(): boolean {
    return this.travel !== null;
  }

  /** True while he walks to the station of a trip. */
  isDeparting(): boolean {
    return this.departing !== null;
  }

  isResting(): boolean {
    return this.restM > 0;
  }

  /** At the station: boards unless a listener cancels, then rides off. */
  private board(): void {
    const plan = this.departing!;
    this.departing = null;
    if (this.events.boarding?.(plan) === false) {
      this.moveOn();
      return;
    }
    this.startTravel(plan.city, plan.mode, plan.path ?? [], plan.arrive);
  }

  /** Starts over in the destination with a fresh street graph; he stands on a lone point until its streets load. */
  private land(): void {
    const t = this.travel!;
    this.travel = null;
    this.legFrom = null;
    this.graph = new StreetGraph();
    this.graph.nodes.set(ARRIVAL_NODE, [t.arrive[0], t.arrive[1]]);
    this.startAt(ARRIVAL_NODE);
    this.bounds = t.to.bounds ?? cityBounds(t.to.lat, t.to.lon);
    this.tripM = 0;
    this.tripStartM = 0;
    this.events.landed?.(t.to);
  }

  /** True when he is stuck at a node whose surroundings are not loaded yet. */
  needsData(): boolean {
    return !this.travel && !this.flight && this.toNode === null && this.fromNode !== null && !this.graph.isComplete(this.fromNode);
  }

  /**
   * Lets `meters` of clock time pass (see SPEED_MPS), walking at speedMps.
   * Returns clock meters that could not be used because the map around the
   * current node still has to be downloaded.
   */
  advance(meters: number): number {
    const scale = this.speedMps / SPEED_MPS;
    while (meters > 0) {
      if (this.travel) {
        const t = Math.min(meters, this.travel.left_m);
        this.travel.left_m -= t;
        meters -= t;
        if (this.travel.left_m <= 0) this.land();
        continue;
      }
      if (this.flight) {
        const f = this.flight;
        const fly = meters * scale;
        const m = Math.min(fly, f.left_m);
        f.left_m -= m;
        this.totalM += m;
        this.tripM += m;
        if (f.left_m > 0) return 0;
        meters -= m / scale;
        this.startAt(f.node);
        continue;
      }
      if (this.restM > 0) {
        const r = Math.min(meters, this.restM);
        this.restM -= r;
        this.restedM += r;
        meters -= r;
        continue;
      }
      if (this.fromNode === null) return meters;
      if (this.toNode === null) {
        if (!this.graph.isComplete(this.fromNode)) return meters;
        if (this.graph.neighbors(this.fromNode).length === 0) {
          // Isolated node (e.g. the street was removed from OSM): hop to the nearest street.
          this.events.problem?.("Stood on a corner with no streets; hopping to the nearest street");
          const p = this.graph.nodes.get(this.fromNode)!;
          const near = this.graph.nearestNode(p[0], p[1]);
          if (near === null || near === this.fromNode) return 0;
          this.startAt(near);
          continue;
        }
        this.toNode = this.nextStep();
        if (this.toNode === null && this.skips > MAX_SKIPS) {
          // Already as close as he gets to every goal tried: wander a street instead.
          this.events.problem?.(`Gave up on ${this.skips} goals in a row; wandering down a street instead`);
          this.skips = 0;
          this.toNode = this.rng.pick(this.graph.neighbors(this.fromNode));
        }
        if (this.toNode === null) continue; // arrived (resting now), moved on, or set off on a trip
      }
      const remaining = this.graph.edgeLength(this.fromNode, this.toNode) - this.progressM;
      const walk = meters * scale;
      if (walk < remaining) {
        this.progressM += walk;
        this.totalM += walk;
        this.tripM += walk;
        return 0;
      }
      meters -= remaining / scale;
      this.totalM += remaining;
      this.tripM += remaining;
      this.prevNode = this.fromNode;
      this.fromNode = this.toNode;
      this.toNode = null;
      this.progressM = 0;
      this.skips = 0;
      if (this.routeArrives && this.route.length === 0) this.arrive();
    }
    return 0;
  }

  /** Next node on the way to the goal, or null after arriving (he starts resting at a place) or giving up. */
  private nextStep(): number | null {
    if (!this.goal) {
      this.pickGoal();
      if (this.travel) return null;
    }
    if (this.takeOff()) return null;
    const from = this.fromNode!;
    const next = this.route[0];
    if (next !== undefined && next !== from && this.graph.adjacency.get(from)?.has(next)) return this.route.shift()!;
    if (this.tripM > tripLimitM(this.tripStartM)) {
      this.moveOn();
      return null;
    }
    if (this.routeArrives) {
      this.arrive();
      return null;
    }
    this.plan();
    if (this.route.length === 0) {
      this.arrive();
      return null;
    }
    return this.route.shift()!;
  }

  /** On a flying mount, at the start of the way to a far goal: flies to a park or garden near it, if one is loaded. */
  private takeOff(): boolean {
    if (!this.flies || !this.goal || this.tripM > 0 || !this.here()) return false;
    const from = this.position();
    const goal = this.goal;
    const far = distanceM(from[0], from[1], goal[0], goal[1]);
    if (far < FLY_MIN_M) return false;
    let pad: Place | null = null;
    let padM = Math.min(LAND_MAX_M, far * LAND_SHARE);
    for (const q of this.graph.placesIn(bboxAround(goal[0], goal[1], LAND_MAX_M))) {
      if (!LAND_KINDS.has(q.class)) continue;
      const m = distanceM(q.lat, q.lon, goal[0], goal[1]);
      if (m < padM) [pad, padM] = [q, m];
    }
    if (!pad) return false;
    const node = this.graph.nearestNode(pad.lat, pad.lon);
    const at = node === null ? null : this.graph.nodes.get(node)!;
    if (node === null || !at || distanceM(at[0], at[1], pad.lat, pad.lon) > SNAP_M) return false;
    const m = distanceM(from[0], from[1], at[0], at[1]);
    this.flight = { from, to: [at[0], at[1]], node, total_m: m, left_m: m };
    this.legFrom = from;
    this.route = [];
    this.routeArrives = false;
    return true;
  }

  /** At a place he stays a minute (listeners may shorten it); a random spot is only a waypoint. */
  private arrive(): void {
    if (this.departing) {
      this.board();
      return;
    }
    if (!this.place) {
      this.moveOn();
      return;
    }
    const place = this.place;
    this.restFor(1);
    this.events.arrived?.(place);
  }

  /** Drops the goal without stopping; he picks the next one at once. */
  private moveOn(): void {
    this.departing = null;
    this.goal = null;
    this.goalNode = null;
    this.route = [];
    this.routeArrives = false;
    this.skips++;
  }

  /** Stays where he is for `minutes`, but never more than a minute. */
  restFor(minutes: number): void {
    this.goal = null;
    this.goalNode = null;
    this.route = [];
    this.routeArrives = false;
    this.restM = Math.min(minutes * 60 * SPEED_MPS, REST_M);
    this.restTotalM = this.restM;
  }

  /**
   * Meters he still walks to the goal: the rest of this street, the planned
   * route, then a straight line from where it ends. A straight line from here
   * until he has planned; null without a goal.
   */
  walkLeftM(): number | null {
    if (!this.goal || !this.here()) return null;
    if (this.flight) return this.flight.left_m + distanceM(this.flight.to[0], this.flight.to[1], this.goal[0], this.goal[1]);
    if (this.toNode === null && this.route.length === 0) {
      const p = this.position();
      return distanceM(p[0], p[1], this.goal[0], this.goal[1]);
    }
    let m = 0;
    let last = this.fromNode!;
    if (this.toNode !== null) {
      m = this.graph.edgeLength(last, this.toNode) - this.progressM;
      last = this.toNode;
    }
    // Right after a reload the route's corners are not loaded yet: a straight line from the last known one.
    for (const n of this.route) {
      if (!this.graph.hasNode(n)) break;
      m += this.graph.edgeLength(last, n);
      last = n;
    }
    const end = this.graph.nodes.get(last)!;
    return m + distanceM(end[0], end[1], this.goal[0], this.goal[1]);
  }

  /** His planned way to the goal: along the loaded streets, then a straight bit past them (null when the streets get there). */
  routeLine(): { streets: LatLon[]; rest: [LatLon, LatLon] | null } | null {
    if (!this.goal || !this.here()) return null;
    if (this.flight) return { streets: [], rest: [this.position(), [this.goal[0], this.goal[1]]] };
    const streets: LatLon[] = [this.position()];
    for (const id of [this.toNode, ...this.route]) {
      if (id === null) continue;
      const p = this.graph.nodes.get(id);
      if (!p) break;
      streets.push(p);
    }
    const end = streets.at(-1)!;
    const rest: [LatLon, LatLon] | null = distanceM(end[0], end[1], this.goal[0], this.goal[1]) > ARRIVE_M ? [end, [this.goal[0], this.goal[1]]] : null;
    return { streets, rest };
  }

  /** Seconds until he moves again. */
  restLeftS(): number {
    return this.restM / SPEED_MPS;
  }

  /** How much of the current rest is over, 0 to 1. */
  restFraction(): number {
    return this.restTotalM > 0 ? 1 - this.restM / this.restTotalM : 0;
  }

  /** Snaps the goal to a street corner once streets there load, then plans the way there (see route.ts). */
  private plan(): void {
    const g = this.graph;
    const goal = this.goal!;
    const from = this.fromNode!;
    if (this.goalNode === null && g.covers(goal[0], goal[1], ARRIVE_M)) {
      this.goalNode = g.nearestNode(goal[0], goal[1]);
      if (this.goalNode !== null) {
        const p = g.nodes.get(this.goalNode)!;
        this.goal = [p[0], p[1]];
      }
    }
    const r = planRoute(g, from, this.goal!, this.goalNode, ARRIVE_M);
    this.route = r.route;
    this.routeArrives = r.arrives;
  }

  /** Current [lat, lon]. */
  position(): LatLon {
    if (this.travel) return this.travelPosition();
    if (this.flight) {
      const f = this.flight;
      const t = 1 - f.left_m / Math.max(f.total_m, 0.001);
      return [lerp(f.from[0], f.to[0], t), lerp(f.from[1], f.to[1], t)];
    }
    const a = this.graph.nodes.get(this.fromNode!)!;
    if (this.toNode === null) return [a[0], a[1]];
    const b = this.graph.nodes.get(this.toNode)!;
    const t = this.progressM / Math.max(this.graph.edgeLength(this.fromNode!, this.toNode), 0.001);
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
  }

  /** Along the ride's path, each leg a straight line on the map (Web Mercator). */
  private travelPosition(): LatLon {
    const t = this.travel!;
    const path = t.path;
    let left = (1 - t.left_m / Math.max(t.total_m, 0.001)) * pathLengthM(path);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!;
      const b = path[i]!;
      const leg = distanceM(a[0], a[1], b[0], b[1]);
      if (left <= leg || i === path.length - 1) {
        const u = Math.min(Math.max(left / Math.max(leg, 0.001), 0), 1);
        const x = lerp(lonToPx(a[1], 0), lonToPx(b[1], 0), u);
        const y = lerp(latToPx(a[0], 0), latToPx(b[0], 0), u);
        return [pxToLat(y, 0), pxToLon(x, 0)];
      }
      left -= leg;
    }
    return path[0]!;
  }

  streetName(): string {
    if (this.travel || this.flight || this.fromNode === null) return "";
    if (this.toNode !== null) return this.graph.edgeName(this.fromNode, this.toNode);
    if (this.prevNode !== null) return this.graph.edgeName(this.prevNode, this.fromNode);
    return "";
  }

  toJSON(): WalkerSave {
    const pos = (id: number | null) => (id === null ? null : (this.graph.nodes.get(id) ?? null));
    return {
      prev: this.prevNode,
      from: this.fromNode,
      to: this.toNode,
      prev_pos: pos(this.prevNode),
      from_pos: pos(this.fromNode),
      to_pos: pos(this.toNode),
      progress_m: this.progressM,
      total_m: this.totalM,
      bounds: this.bounds,
      goal: this.goal,
      goal_node: this.goalNode,
      route: this.route,
      route_arrives: this.routeArrives,
      rest_m: this.restM,
      rest_total_m: this.restTotalM,
      rested_m: this.restedM,
      trip_m: this.tripM,
      trip_start_m: this.tripStartM,
      place: this.place,
      leg_from: this.legFrom,
      departing: this.departing,
      travel: this.travel,
      flight: this.flight,
    };
  }

  /** Restores saved state. Node coordinates are saved too, so the walk resumes before the map reloads. */
  static fromJSON(d: WalkerSave, graph = new StreetGraph()): Walker {
    const w = new Walker(graph);
    w.prevNode = d.prev;
    w.fromNode = d.from;
    w.toNode = d.to;
    w.progressM = d.progress_m;
    w.totalM = d.total_m;
    w.bounds = d.bounds;
    w.goal = d.goal;
    w.goalNode = d.goal_node;
    w.route = d.route;
    w.routeArrives = d.route_arrives;
    w.restM = Math.min(d.rest_m, REST_M);
    w.restTotalM = Math.min(Math.max(d.rest_total_m, w.restM), REST_M);
    w.restedM = d.rested_m;
    w.tripM = d.trip_m;
    w.tripStartM = d.trip_start_m;
    w.place = d.place;
    w.legFrom = d.leg_from;
    w.departing = d.departing;
    w.travel = d.travel;
    w.flight = d.flight ?? null;
    // The corner he lands on, so the walk goes on before the streets there reload.
    if (w.flight && !graph.nodes.has(w.flight.node)) graph.nodes.set(w.flight.node, [w.flight.to[0], w.flight.to[1]]);
    for (const [id, p] of [[d.prev, d.prev_pos], [d.from, d.from_pos], [d.to, d.to_pos]] as const) {
      if (id !== null && p && !graph.nodes.has(id)) graph.nodes.set(id, [p[0], p[1]]);
    }
    return w;
  }
}

export type WalkerSave = {
  prev: number | null;
  from: number | null;
  to: number | null;
  prev_pos: [number, number] | null;
  from_pos: [number, number] | null;
  to_pos: [number, number] | null;
  progress_m: number;
  total_m: number;
  bounds: BBox | null;
  goal: LatLon | null;
  goal_node: number | null;
  route: number[];
  route_arrives: boolean;
  rest_m: number;
  rest_total_m: number;
  rested_m: number;
  trip_m: number;
  trip_start_m: number;
  place: Place | null;
  leg_from: LatLon | null;
  departing: Plan | null;
  travel: Travel | null;
  /** Missing in saves from before flying mounts. */
  flight?: Flight | null;
};
