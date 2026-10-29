import { describe, expect, it } from "vitest";
import { cellKey, cellOf, StreetGraph } from "../../src/core/graph";
import { planRoute } from "../../src/core/route";
import { plus, PLUS_BBOX } from "../support/osm";

const n = (osm: number) => -osm; // node ids of the "+" fixture

function cross(): StreetGraph {
  const g = new StreetGraph();
  g.addOverpass(plus(), PLUS_BBOX);
  return g;
}

describe("route search", () => {
  it("finds the corners from one arm of the cross to another", () => {
    const g = cross();
    expect(planRoute(g, n(2), [42.0, 23.00135], null, 30)).toEqual({ route: [n(1), n(3)], arrives: true });
  });

  it("stops at the goal's corner when it has one", () => {
    const g = cross();
    expect(planRoute(g, n(5), [41.0, 23.0], n(1), 30)).toEqual({ route: [n(1)], arrives: true });
  });

  it("gets as close as the streets allow when the goal is off them", () => {
    const g = cross();
    expect(planRoute(g, n(4), [42.01, 23.0], null, 30)).toEqual({ route: [n(1), n(2)], arrives: true });
  });

  it("ends at the edge of the loaded map without arriving", () => {
    const g = cross();
    g.cells.delete(cellKey(cellOf(42, 23)));
    expect(planRoute(g, n(1), [42.0, 23.01], null, 30)).toEqual({ route: [n(3)], arrives: false });
  });

  it("stays put when he already is there", () => {
    expect(planRoute(cross(), n(3), [42.0, 23.00135], null, 30)).toEqual({ route: [], arrives: true });
  });
});
