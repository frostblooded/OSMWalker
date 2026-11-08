import { beforeEach, describe, expect, it } from "vitest";
import { distanceM, moved, offsetM } from "../../src/core/geo";
import { cellKey, cellOf, StreetGraph } from "../../src/core/graph";
import { Rng } from "../../src/core/rng";
import type { Place } from "../../src/core/stats";
import * as W from "../../src/core/walker";
import { addOverpass, plus, PLUS_BBOX } from "../support/osm";

const { Walker, BIKE_MPS } = W;
const n = (osm: number) => -osm; // node ids of the "+" fixture
const SMALL_BOX: [number, number, number, number] = [41.995, 22.995, 42.005, 23.005];
const cafe = (name: string, lat: number, lon: number, rank = 1): Place => ({ name, class: "cafe", subclass: "cafe", rank, lat, lon });
const CAFE_EAST = cafe("Cafe East", 42.0, 23.00135);

let graph: StreetGraph;
let walker: W.Walker;
/** A walker at 1 m/s, so seconds are metres. */
const metres = (w: W.Walker) => ((w.speedMps = 1), w);

function fixture(): StreetGraph {
  const g = new StreetGraph();
  addOverpass(g, plus(), PLUS_BBOX);
  return g;
}

beforeEach(() => {
  graph = fixture();
  walker = metres(new Walker(graph));
  walker.rng = new Rng(1);
});

const len = (a: number, b: number) => graph.edgeLength(n(a), n(b));
const roundTrip = (w: W.Walker, g = new StreetGraph()) => Walker.fromJSON(JSON.parse(JSON.stringify(w)), g);

/** Heads for a place of note at node 3: only places make him stop. */
function headForCafe(): void {
  walker.setGoal(42.0, 23.00135);
  walker.place = CAFE_EAST;
}

/** East-west street of `count` nodes 500 m apart from (42.0, 23.0), only the first couple of km loaded. */
function longStreet(count: number): StreetGraph {
  const g = new StreetGraph();
  const ids = Array.from({ length: count }, (_, i) => i + 1);
  const coords = ids.flatMap((_, i) => [42.0, 23.0 + i * 0.00604]);
  g.addCell(cellOf(42, 23), { ids: Float64Array.from(ids), coords: Float64Array.from(coords), ways: [{ name: "", ids }], places: [] });
  g.cells.clear();
  for (let i = 0; i < 4; i++) g.cells.add(cellKey(cellOf(42, 23 + i * 0.00604)));
  return g;
}

describe("walking", () => {
  it("rides 3 times as fast as a real city bike's 15 km/h", () => {
    expect(BIKE_MPS * 3.6).toBeCloseTo(45, 6);
    expect(new Walker().speedMps).toBe(BIKE_MPS);
  });

  it("walks partway along the street", () => {
    walker.startAt(n(2));
    expect(walker.advance(50)).toBe(0);
    expect(walker.toNode).toBe(n(1));
    expect(walker.progressM).toBeCloseTo(50, 6);
    expect(walker.totalM).toBeCloseTo(50, 6);
    expect(walker.streetName()).toBe("Main St");
  });

  it("interpolates his position", () => {
    walker.startAt(n(2));
    walker.advance(len(2, 1) / 2);
    const p = walker.position();
    expect(p[0]).toBeCloseTo(42.0005, 6);
    expect(p[1]).toBeCloseTo(23.0, 9);
  });

  it("heads for the goal by the shortest route", () => {
    walker.startAt(n(2));
    walker.setGoal(42.0, 23.00135);
    walker.advance(len(2, 1) + 1);
    expect(walker.fromNode).toBe(n(1));
    expect(walker.toNode).toBe(n(3));
  });

  it("turns around at a dead end", () => {
    walker.startAt(n(1));
    walker.setGoal(42.0, 23.00135);
    walker.prevNode = n(3);
    walker.toNode = n(5);
    walker.advance(len(1, 5) + 10);
    expect(walker.fromNode).toBe(n(5));
    expect(walker.toNode).toBe(n(1));
    expect(walker.progressM).toBeCloseTo(10, 6);
  });

  it("keeps the total distance on a long walk", () => {
    walker.bounds = SMALL_BOX;
    walker.startAt(n(1));
    expect(walker.advance(5000)).toBe(0);
    expect(walker.totalM).toBeCloseTo(5000, 3);
    expect(walker.totalM).toBeGreaterThan(0);
  });

  it("covers ground at his speed", () => {
    walker.startAt(n(2));
    walker.speedMps = 2.5;
    walker.advance(4);
    expect(walker.totalM).toBeCloseTo(10, 6);
  });

  it("hops from an isolated node to the nearest street", () => {
    graph.nodes.set(77, [42.00001, 23.00001]);
    walker.startAt(77);
    walker.advance(10);
    expect(walker.fromNode).not.toBe(77);
    expect(walker.totalM).toBeCloseTo(10, 6);
  });
});

describe("arriving", () => {
  it("tells listeners where he arrived and drops the goal", () => {
    const seen: Place[] = [];
    walker.events.arrived = (p) => seen.push(p);
    walker.startAt(n(2));
    headForCafe();
    walker.advance((len(2, 1) + len(1, 3)));
    expect(seen).toEqual([CAFE_EAST]);
    expect(walker.fromNode).toBe(n(3));
    expect(walker.place).toBeNull();
  });

  it("lets the game give the next goal right away, as at a pick-up", () => {
    const next = cafe("Door", 42.0, 22.99865);
    walker.events.arrived = () => walker.goTo(next);
    walker.startAt(n(2));
    headForCafe();
    walker.advance(len(2, 1) + len(1, 3) + 1);
    expect(walker.place).toBe(next);
  });

  it("counts a place he is already at, so an order at his own corner still goes on", () => {
    const seen: Place[] = [];
    walker.events.arrived = (p) => seen.push(p);
    walker.startAt(n(2));
    const p = graph.nodes.get(n(2))!;
    walker.goTo(cafe("Here", p[0], p[1]));
    walker.advance(1);
    expect(seen.map((x) => x.name)).toEqual(["Here"]);
  });
});

describe("goals", () => {
  it("ends an unreachable place at the closest street", () => {
    walker.startAt(n(4));
    walker.setGoal(42.05, 23.0);
    walker.place = cafe("Island", 42.05, 23.0);
    const seen: Place[] = [];
    walker.events.arrived = (p) => seen.push(p);
    walker.advance((len(4, 1) + len(1, 2)));
    expect(walker.fromNode).toBe(n(2));
    expect(seen.map((p) => p.name)).toEqual(["Island"]);
  });

  it("walks to the edge of the loaded streets towards a far goal", () => {
    const g = longStreet(10);
    const w = metres(new Walker(g));
    w.startAt(1);
    w.setGoal(42.0, 23.2);
    w.advance(100_000);
    expect(w.needsData()).toBe(true);
    expect(g.nodes.get(w.fromNode!)![1]).toBeGreaterThan(23.0);
  });

  it("gives up on a goal that drags on", () => {
    walker.startAt(n(1));
    walker.setGoal(42.0, 23.00135);
    walker.place = cafe("Far", 42.0, 23.00135);
    walker.tripM = W.tripLimitM(walker.tripStartM) + 1;
    const problems: string[] = [];
    const idle: number[] = [];
    walker.events.problem = (t) => problems.push(t);
    walker.events.idle = () => idle.push(1);
    walker.advance(1);
    expect(problems[0]).toMatch(/^Gave up on Far/);
    expect(walker.place).toBeNull();
    expect(idle.length).toBeGreaterThan(0);
  });

  it("walks past a random spot without stopping", () => {
    walker.bounds = SMALL_BOX;
    walker.startAt(n(2));
    walker.setGoal(42.0, 23.00135);
    const fired: Place[] = [];
    walker.events.arrived = (p) => fired.push(p);
    walker.advance((len(2, 1) + len(1, 3) + 1));
    expect(fired).toEqual([]);
    expect(walker.goal).not.toEqual([42.0, 23.00135]);
  });

  it("heads for a picked place", () => {
    walker.startAt(n(2));
    walker.goTo(CAFE_EAST);
    expect(walker.place).toBe(CAFE_EAST);
    expect(walker.goal).toEqual([CAFE_EAST.lat, CAFE_EAST.lon]);
    expect(walker.tripStartM).toBeGreaterThan(0);
  });

  it("wanders with no goal: a random street at each corner, back only at a dead end", () => {
    const visited = new Set<number>();
    walker.startAt(n(1));
    for (let i = 0; i < 40; i++) {
      walker.advance(60);
      visited.add(walker.fromNode!);
      expect(walker.goal).toBeNull();
    }
    // All four arms of the cross, and he never stood still.
    for (const arm of [2, 3, 4, 5]) expect(visited.has(n(arm))).toBe(true);
    expect(walker.totalM).toBeCloseTo(2400, 0);
  });

  it("asks the game at each corner while he has no goal", () => {
    let asks = 0;
    walker.events.idle = () => {
      if (++asks === 2) walker.goTo(CAFE_EAST);
    };
    walker.startAt(n(2));
    walker.advance(len(2, 1) + 1);
    expect(asks).toBe(2);
    expect(walker.place).toBe(CAFE_EAST);
  });

});


describe("walk left", () => {
  it("follows the planned streets", () => {
    walker.startAt(n(2));
    walker.setGoal(42.0, 23.00135);
    const straight = distanceM(42.001, 23.0, 42.0, 23.00135);
    expect(walker.walkLeftM()).toBeCloseTo(straight, 2);
    walker.advance(10);
    expect(walker.walkLeftM()).toBeCloseTo(len(2, 1) - 10 + len(1, 3), 2);
    expect(walker.walkLeftM()!).toBeGreaterThan(straight - 10);
  });

  it("adds a straight line past the loaded streets", () => {
    walker.startAt(n(2));
    walker.setGoal(42.0, 23.06);
    walker.advance(10);
    const lastId = walker.route.length ? walker.route[walker.route.length - 1]! : walker.toNode!;
    const last = graph.nodes.get(lastId)!;
    let onStreets = graph.edgeLength(walker.fromNode!, walker.toNode!) - walker.progressM;
    let prev = walker.toNode!;
    for (const id of walker.route) {
      onStreets += graph.edgeLength(prev, id);
      prev = id;
    }
    expect(walker.walkLeftM()).toBeCloseTo(onStreets + distanceM(last[0], last[1], 42.0, 23.06), 2);
  });

  it("still answers right after a reload, before the route's streets load", () => {
    walker.startAt(n(2));
    walker.setGoal(42.0, 23.00135);
    walker.advance(10);
    const back = roundTrip(walker);
    expect(back.route.length).toBeGreaterThan(0);
    const left = back.walkLeftM()!;
    const p = back.position();
    expect(left).toBeGreaterThan(distanceM(p[0], p[1], 42.0, 23.00135) - 1);
  });

  it("is null without a goal", () => {
    walker.startAt(n(2));
    expect(walker.walkLeftM()).toBeNull();
  });
});

describe("route line", () => {
  it("follows his planned streets from where he is, then goes straight to the goal", () => {
    walker.startAt(n(2));
    walker.setGoal(42.0, 23.06);
    walker.advance(10);
    const line = walker.routeLine()!;
    expect(line.streets[0]).toEqual(walker.position());
    expect(line.streets[1]).toEqual(graph.nodes.get(walker.toNode!));
    expect(line.streets).toHaveLength(2 + walker.route.filter((id) => graph.hasNode(id)).length);
    expect(line.rest).toEqual([line.streets.at(-1), [42.0, 23.06]]);
  });

  it("has no straight part when the streets reach the goal", () => {
    walker.startAt(n(2));
    walker.setGoal(...graph.nodes.get(n(3))!);
    walker.advance(10);
    expect(walker.routeLine()!.rest).toBeNull();
  });

  it("is null without a goal", () => {
    walker.startAt(n(2));
    expect(walker.routeLine()).toBeNull();
  });
});

describe("map data", () => {
  const SMALL = [41.9995, 22.999, 42.0005, 23.001] as [number, number, number, number];

  it("waits for map data near an unloaded area", () => {
    const g = new StreetGraph();
    addOverpass(g, plus(), SMALL);
    const w = metres(new Walker(g));
    w.startAt(n(1));
    expect(w.needsData()).toBe(true);
    expect(w.advance(100)).toBe(100);
    expect(w.totalM).toBe(0);
  });

  it("resumes after map data arrives", () => {
    const g = new StreetGraph();
    addOverpass(g, plus(), SMALL);
    const w = metres(new Walker(g));
    w.startAt(n(1));
    const left = w.advance(100);
    addOverpass(g, plus(), PLUS_BBOX);
    expect(w.advance(left)).toBe(0);
    expect(w.totalM).toBeCloseTo(100, 3);
  });
});

describe("saves", () => {
  it("restore into an empty graph", () => {
    walker.bounds = SMALL_BOX;
    walker.startAt(n(2));
    walker.setGoal(42.0, 23.00135);
    walker.advance(30);
    const back = roundTrip(walker);
    expect(back.fromNode).toBe(n(2));
    expect(back.toNode).toBe(n(1));
    expect(back.totalM).toBeCloseTo(30, 6);
    expect(back.goal).toEqual([42.0, 23.00135]);
    expect(back.bounds).toEqual(walker.bounds);
    expect(back.route).toEqual(walker.route);
    const a = walker.position();
    const b = back.position();
    expect(b[0]).toBeCloseTo(a[0], 9);
    expect(b[1]).toBeCloseTo(a[1], 9);
    // Finishes the current street, then waits for the map to load.
    back.advance(500);
    expect(back.fromNode).toBe(n(1));
    expect(back.needsData()).toBe(true);
  });

  it("keep the place he heads for", () => {
    walker.startAt(n(2));
    headForCafe();
    walker.advance(10);
    expect(roundTrip(walker).place).toEqual(CAFE_EAST);
  });
});

describe("city bounds", () => {
  const R = 6371008.8;
  const deg = (m: number) => ((m / R) * 180) / Math.PI;

  it("come from the search box", () => {
    expect(W.cityBounds(42, 23, [41.9, 22.9, 42.1, 23.1])).toEqual([41.9, 22.9, 42.1, 23.1]);
  });

  it("grow a tiny or missing box to a walkable area", () => {
    for (const box of [null, [42, 23, 42, 23] as [number, number, number, number]]) {
      const b = W.cityBounds(42, 23, box);
      expect(b[2] - b[0]).toBeCloseTo(2 * deg(W.MIN_CITY_RADIUS_M), 4);
      expect(b[0] < 42 && b[2] > 42 && b[1] < 23 && b[3] > 23).toBe(true);
    }
  });

  it("cap a huge box", () => {
    const b = W.cityBounds(42, 23, [30, 10, 50, 40]);
    expect(b[2] - b[0]).toBeCloseTo(2 * deg(W.MAX_CITY_RADIUS_M), 4);
  });
});

describe("offsets", () => {
  it("offsets go there and back", () => {
    const v = offsetM(42, 23, 42.001, 23.00135);
    expect(Math.hypot(v[0], v[1])).toBeCloseTo(distanceM(42, 23, 42.001, 23.00135), 0);
    expect(v[0]).toBeGreaterThan(0);
    expect(v[1]).toBeGreaterThan(0);
    const back = moved(42, 23, v);
    expect(back[0]).toBeCloseTo(42.001, 6);
    expect(back[1]).toBeCloseTo(23.00135, 6);
  });

});


describe("commands", () => {
  it("aims at the goal, else the next corner", () => {
    walker.startAt(n(2));
    expect(walker.aim()).toBeNull();
    walker.setGoal(42.0, 23.00135);
    expect(walker.aim()).toEqual([42.0, 23.00135]);
  });
});

