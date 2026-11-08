// The character's walk along the street graph: with a goal (a restaurant or
// a customer's door) he takes the shortest route over the streets loaded so
// far (re-planning as more load), and the game hears when he arrives. With
// none he wanders: at each corner he takes a random street, rarely back the
// way he came. Pure logic: no DOM, no networking, so it is easy to test.
import { bboxAround, distanceM, type BBox, type LatLon } from "./geo";
import { StreetGraph } from "./graph";
import { planRoute } from "./route";
import { Rng } from "./rng";
import type { Place } from "./stats";

/** A real city bike, door to door, counting lights and traffic: 15 km/h (Copenhagen's cyclists average about 15.5 km/h). */
export const REAL_BIKE_KMH = 15;
/** Every movement is this many times its real-world speed, on purpose, so the game plays better. */
export const GAME_SPEED_X = 3;
/** His speed on his bike, in meters per second. */
export const BIKE_MPS = (REAL_BIKE_KMH * GAME_SPEED_X) / 3.6;
/** Close enough to a destination to call it reached. */
export const ARRIVE_M = 30;
/** Destinations come from the searched place's box, kept between these sizes. */
export const MIN_CITY_RADIUS_M = 1500;
export const MAX_CITY_RADIUS_M = 25_000;
/** Where an old save had him on a ride, until the streets there load. Never a tile or OSM id. */
export const LONE_NODE = Number.MAX_SAFE_INTEGER;

export interface WalkerEvents {
  /** Reached a place of note. */
  arrived?(place: Place): void;
  /** He has no goal and is about to wander down a street: the game may give him one now. */
  idle?(): void;
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
  /** How fast he rides, in meters per second. */
  speedMps = BIKE_MPS;

  prevNode: number | null = null;
  fromNode: number | null = null;
  /** null while waiting for map data around fromNode. */
  toNode: number | null = null;
  /** Meters walked from fromNode towards toNode. */
  progressM = 0;
  totalM = 0;
  /** The city's box, for Debug and the city area. */
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
    }
  }

  /** Heads for `place`. */
  goTo(place: Place): void {
    this.setGoal(place.lat, place.lon);
    this.place = place;
  }

  /** The point he is walking towards right now: the goal, else the next corner; null when neither. */
  aim(): LatLon | null {
    if (this.goal) return this.goal;
    return this.toNode !== null ? (this.graph.nodes.get(this.toNode) ?? null) : null;
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
        if (!this.goal) this.events.idle?.();
        this.toNode = this.goal ? this.nextStep() : this.wander();
        if (this.toNode === null) continue; // arrived or gave up: he goes on from here on the next turn
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
      if (this.routeArrives && this.route.length === 0) this.arrive();
    }
    return 0;
  }

  /** A random street from this corner, back the way he came only at a dead end. */
  private wander(): number {
    const all = this.graph.neighbors(this.fromNode!);
    const ahead = all.filter((n) => n !== this.prevNode);
    return this.rng.pick(ahead.length ? ahead : all);
  }

  /** Next node on the way to the goal, or null after arriving or giving up. */
  private nextStep(): number | null {
    const from = this.fromNode!;
    const next = this.route[0];
    if (next !== undefined && next !== from && this.graph.adjacency.get(from)?.has(next)) return this.route.shift()!;
    if (this.tripM > tripLimitM(this.tripStartM)) {
      this.events.problem?.(`Gave up on ${this.place?.name ?? "a goal"} after ${Math.round(this.tripM)} m`);
      this.dropGoal();
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

  /** At the goal (or as near as the streets go) the game hears of it, and may give him the next one. */
  private arrive(): void {
    const place = this.place;
    this.dropGoal();
    if (place) this.events.arrived?.(place);
  }

  /** Drops his goal: he finishes this bit of street, then asks for a new one. */
  stop(): void {
    this.dropGoal();
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
  /** Saves from before the base loop: a ride to another city or across town under way. */
  travel?: { arrive: LatLon; to?: { name: string; lat: number; lon: number; bounds?: BBox } } | null;
  flight?: { to: LatLon } | null;
};
