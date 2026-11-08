// The character's walk along the street graph: he heads for a place of note
// by the shortest route over the streets loaded so far (re-planning as more
// load). On arrival the game hears of it and he picks his next goal at once.
// Places weigh by importance, by a medium walking distance and by lying
// ahead along his last leg. With no places loaded yet he heads for a random
// spot near and ahead of him.
// Pure logic: no DOM, no networking, so it is easy to test.
import { bboxAround, distanceM, offsetM, type BBox, type LatLon } from "./geo";
import { pickIndex, randomSpot, weigh, type Vec, type Weights } from "./goals";
import { StreetGraph } from "./graph";
import { planRoute } from "./route";
import { Rng } from "./rng";
import type { Place } from "./stats";

/** Walking speed in meters per second: a door-to-door city average, counting lights and traffic. */
export const WALK_MPS = 5 / 3.6;
/** Close enough to a destination to call it reached. */
export const ARRIVE_M = 30;
/** Destinations come from the searched place's box, kept between these sizes. */
export const MIN_CITY_RADIUS_M = 1500;
export const MAX_CITY_RADIUS_M = 25_000;
/** Goals given up on in a row before he just walks down a street, so a city where no goal can be reached never hangs. */
export const MAX_SKIPS = 3;
/** Where an old save had him on a ride, until the streets there load. Never a tile or OSM id. */
export const LONE_NODE = Number.MAX_SAFE_INTEGER;
export type PickInfo = Record<string, unknown>;

export interface WalkerEvents {
  /** Reached a place of note. */
  arrived?(place: Place): void;
  /** Picked a new goal, and how. */
  picked?(info: PickInfo): void;
  /** Something odd that the debug panel should show. */
  problem?(text: string): void;
}

/** He gives up on a goal once the walk passes TRIP_RATIO times the straight line plus TRIP_EXTRA_M (it may be across water or behind a fence). */
export const TRIP_RATIO = 2.5;
export const TRIP_EXTRA_M = 2000;
export const tripLimitM = (straightM: number) => TRIP_RATIO * straightM + TRIP_EXTRA_M;

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

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class Walker {
  rng = new Rng();
  events: WalkerEvents = {};
  /** Which places may be goals (the game offers only those that reward him); all when null. */
  wants: ((p: Place) => boolean) | null = null;
  /** How fast he walks, in meters per second. */
  speedMps = WALK_MPS;

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
  /** Walked since the current goal was picked. */
  tripM = 0;
  /** Straight-line distance to the goal when it was picked. */
  tripStartM = 0;
  /** The place of note he is heading to, null for a random spot. */
  place: Place | null = null;
  /** Where the current leg started, for his heading. */
  legFrom: LatLon | null = null;
  private skips = 0;

  constructor(public graph: StreetGraph = new StreetGraph()) {}

  startAt(id: number): void {
    this.prevNode = null;
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

  /** Picks a place of note to walk to, or a random spot while none are loaded. */
  pickGoal(): void {
    if (!this.bounds && this.here()) {
      const p = this.position();
      this.bounds = cityBounds(p[0], p[1]);
    }
    const bounds = this.bounds ?? cityBounds(0, 0);
    let options = this.graph.placesIn(bounds).filter((q) => this.wants?.(q) ?? true);
    const info: PickInfo = { in_box: options.length, cells: this.graph.cells.size };
    if (this.here()) {
      const p = this.position();
      options = options.filter((q) => distanceM(p[0], p[1], q.lat, q.lon) > ARRIVE_M);
    }
    info.too_close = (info.in_box as number) - options.length;
    if (options.length > 0) {
      const parts = options.map((q) => this.weigh(q));
      const weights = parts.map((w) => w.weight);
      const r = this.rng.randf();
      const i = pickIndex(weights, r);
      const pl = options[i]!;
      this.setGoal(pl.lat, pl.lon);
      this.place = pl;
      Object.assign(info, parts[i], { r, place: pl.name, class: pl.class, rank: Math.trunc(pl.rank ?? 1), total_weight: weights.reduce((a, w) => a + w, 0) });
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

  /** The point he is walking towards right now: the goal, else the next corner; null when neither. */
  aim(): LatLon | null {
    if (this.goal) return this.goal;
    return this.toNode !== null ? (this.graph.nodes.get(this.toNode) ?? null) : null;
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
  weigh(p: Place): Weights {
    return weigh(p, this.here() ? this.position() : null, this.heading());
  }

  /** A spot in the city box, drawn with the same distance and heading odds as places. */
  randomSpot(): LatLon {
    return randomSpot(this.rng, this.bounds ?? cityBounds(0, 0), this.here() ? this.position() : null, this.heading());
  }

  /** True when he is stuck at a node whose surroundings are not loaded yet. */
  needsData(): boolean {
    return this.toNode === null && this.fromNode !== null && !this.graph.isComplete(this.fromNode);
  }

  /**
   * Walks for `seconds` at speedMps. Returns the seconds that could not be
   * used because the map around the current node still has to be downloaded.
   */
  advance(seconds: number): number {
    let meters = seconds * this.speedMps;
    while (meters > 0) {
      if (this.fromNode === null) return meters / this.speedMps;
      if (this.toNode === null) {
        if (!this.graph.isComplete(this.fromNode)) return meters / this.speedMps;
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
        if (this.toNode === null) continue; // arrived or moved on: he picks again on the next turn
      }
      const remaining = this.graph.edgeLength(this.fromNode, this.toNode) - this.progressM;
      if (meters < remaining) {
        this.progressM += meters;
        this.totalM += meters;
        this.tripM += meters;
        return 0;
      }
      meters -= remaining;
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

  /** Next node on the way to the goal, or null after arriving or giving up. */
  private nextStep(): number | null {
    if (!this.goal) this.pickGoal();
    const from = this.fromNode!;
    const next = this.route[0];
    if (next !== undefined && next !== from && this.graph.adjacency.get(from)?.has(next)) return this.route.shift()!;
    if (this.tripM > tripLimitM(this.tripStartM)) {
      this.dropGoal();
      this.skips++;
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

  /**
   * At a place the game hears of it; a random spot is only a waypoint, and so
   * is a place he got to without a step (he already stood as near as the
   * streets go), so it can't pay again and again. Either way the next goal is
   * picked on the next step.
   */
  private arrive(): void {
    const place = this.place;
    const walked = this.tripM > 0;
    this.dropGoal();
    if (place && walked) this.events.arrived?.(place);
    else this.skips++;
  }

  private dropGoal(): void {
    this.goal = null;
    this.goalNode = null;
    this.place = null;
    this.route = [];
    this.routeArrives = false;
  }

  /**
   * Meters he still walks to the goal: the rest of this street, the planned
   * route, then a straight line from where it ends. A straight line from here
   * until he has planned; null without a goal.
   */
  walkLeftM(): number | null {
    if (!this.goal || !this.here()) return null;
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
    const a = this.graph.nodes.get(this.fromNode!)!;
    if (this.toNode === null) return [a[0], a[1]];
    const b = this.graph.nodes.get(this.toNode)!;
    const t = this.progressM / Math.max(this.graph.edgeLength(this.fromNode!, this.toNode), 0.001);
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
  }

  streetName(): string {
    if (this.fromNode === null) return "";
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
      trip_m: this.tripM,
      trip_start_m: this.tripStartM,
      place: this.place,
      leg_from: this.legFrom,
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
    w.tripM = d.trip_m;
    w.tripStartM = d.trip_start_m;
    w.place = d.place;
    w.legFrom = d.leg_from;
    for (const [id, p] of [[d.prev, d.prev_pos], [d.from, d.from_pos], [d.to, d.to_pos]] as const) {
      if (id !== null && p && !graph.nodes.has(id)) graph.nodes.set(id, [p[0], p[1]]);
    }
    // An old save on a ride to another city (trips are gone): he stands where the ride was headed, with a fresh goal, until the streets there load.
    const ride = d.travel ?? (d.flight ? { arrive: d.flight.to } : null);
    if (ride) {
      graph.nodes.set(LONE_NODE, [ride.arrive[0], ride.arrive[1]]);
      w.startAt(LONE_NODE);
      w.goal = null;
      w.goalNode = null;
      w.place = null;
      w.routeArrives = false;
      if (d.travel?.to) w.bounds = cityBounds(d.travel.to.lat, d.travel.to.lon, d.travel.to.bounds);
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
  trip_m: number;
  trip_start_m: number;
  place: Place | null;
  leg_from: LatLon | null;
  /** Saves from before the base loop: a ride to another city or across town under way. */
  travel?: { arrive: LatLon; to?: { name: string; lat: number; lon: number; bounds?: BBox } } | null;
  flight?: { to: LatLon } | null;
};
