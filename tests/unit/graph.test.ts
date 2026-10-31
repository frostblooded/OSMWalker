import { describe, expect, it } from "vitest";
import { tileBbox } from "../../src/core/geo";
import { CELL_ZOOM, cellKey, cellOf, cellsBbox, cellsByPriority, compactCells, StreetGraph } from "../../src/core/graph";
import { plus, PLUS_BBOX } from "../support/osm";

const id = (osm: number) => -osm;

function loaded(): StreetGraph {
  const g = new StreetGraph();
  g.addOverpass(plus(), PLUS_BBOX);
  return g;
}

describe("StreetGraph", () => {
  it("parses nodes and links", () => {
    const g = loaded();
    expect(g.nodes.size).toBe(5);
    expect(g.neighbors(id(1))).toHaveLength(4);
    expect(g.neighbors(id(5))).toEqual([id(1)]);
  });

  it("knows street names both ways", () => {
    const g = loaded();
    expect(g.edgeName(id(1), id(2))).toBe("Main St");
    expect(g.edgeName(id(2), id(1))).toBe("Main St");
    expect(g.edgeName(id(1), id(3))).toBe("");
  });

  it("measures edges", () => {
    expect(loaded().edgeLength(id(1), id(2))).toBeCloseTo(111.2, 0);
  });

  it("calls nodes inside loaded cells complete", () => {
    const g = loaded();
    expect(g.isComplete(id(1))).toBe(true);
    expect(g.isComplete(999)).toBe(false);
  });

  it("only counts cells fully inside the box as loaded", () => {
    const g = new StreetGraph();
    g.addOverpass(plus(), [41.9995, 22.999, 42.0005, 23.001]);
    expect(g.cells.size).toBe(0);
    expect(g.isComplete(id(1))).toBe(false);
  });

  it("merges overlapping downloads without duplicates", () => {
    const g = loaded();
    g.addOverpass(plus(), PLUS_BBOX);
    expect(g.nodes.size).toBe(5);
    expect(g.neighbors(id(1))).toHaveLength(4);
  });

  it("finds the nearest node", () => {
    const g = loaded();
    expect(g.nearestNode(42.0009, 23.0)).toBe(id(2));
    expect(g.nearestNode(42.00001, 23.00001)).toBe(id(1));
    expect(new StreetGraph().nearestNode(42, 23)).toBeNull();
  });

  it("covers a point only when every cell in reach is loaded", () => {
    const g = loaded();
    expect(g.covers(42, 23, 300)).toBe(true);
    expect(g.covers(42, 23, 20000)).toBe(false);
    expect(g.covers(43, 23, 0)).toBe(false);
  });

  it("adds up neighbouring cells", () => {
    const g = new StreetGraph();
    const a = cellOf(42, 23);
    const b = { x: a.x + 1, y: a.y };
    const compact = compactCells(plus(), [a, b]);
    const box = tileBbox(a, CELL_ZOOM);
    const lat = (box[0] + box[2]) / 2;
    g.addCell(a, compact.get(cellKey(a))!);
    expect(g.covers(lat, box[3], 50)).toBe(false);
    g.addCell(b, compact.get(cellKey(b))!);
    expect(g.covers(lat, box[3], 50)).toBe(true);
  });

  it("keeps the ways touching each cell", () => {
    const home = cellOf(42, 23);
    const far = { x: home.x + 5, y: home.y + 5 };
    const compact = compactCells(plus(), [home, far]);
    expect(compact.get(cellKey(home))!.ways).toHaveLength(2);
    expect(compact.get(cellKey(far))!.ways).toHaveLength(0);
    const g = new StreetGraph();
    g.addCell(home, compact.get(cellKey(home))!);
    expect(g.neighbors(id(1))).toHaveLength(4);
    expect(g.edgeName(id(1), id(2))).toBe("Main St");
  });

  it("survives a structured clone of cell data (worker / IndexedDB)", () => {
    const home = cellOf(42, 23);
    const back = structuredClone(compactCells(plus(), [home]).get(cellKey(home))!);
    const g = new StreetGraph();
    g.addCell(home, back);
    expect(g.nodes.size).toBe(5);
    expect(g.edgeName(id(1), id(2))).toBe("Main St");
  });

  it("makes a node on a cell edge wait for both cells", () => {
    const c = cellOf(42, 23);
    const edge = tileBbox(c, CELL_ZOOM)[3];
    const g = new StreetGraph();
    g.addCell(c, { ids: Float64Array.of(7, 8), coords: Float64Array.of(42, edge - 0.001, 42, edge), ways: [{ name: "", ids: [7, 8] }], places: [] });
    expect(g.isComplete(7)).toBe(true);
    expect(g.isComplete(8)).toBe(false);
    g.cells.add(cellKey({ x: c.x + 1, y: c.y }));
    expect(g.isComplete(8)).toBe(true);
  });

  it("finds places inside a box", () => {
    const g = new StreetGraph();
    const home = cellOf(42, 23);
    const cafe = { name: "Cafe", class: "cafe", subclass: "cafe", rank: 1, lat: 42.0005, lon: 23.0 };
    g.addCell(home, { ...compactCells(plus(), [home]).get(cellKey(home))!, places: [cafe] });
    expect(g.placesIn([41.999, 22.999, 42.001, 23.001])).toEqual([cafe]);
    expect(g.placesIn([42.001, 22.999, 42.002, 23.001])).toEqual([]);
  });

  it("counts made-up places only once their cell is loaded", () => {
    const g = new StreetGraph();
    const home = cellOf(42, 23);
    const inn = { name: "Inn", class: "lodging", subclass: "guest_house", rank: 1, lat: 41.9995, lon: 23.0005, made: true };
    const far = { ...inn, name: "Far inn", lat: 43 };
    g.made = [inn, far];
    expect(g.placesIn([41, 22, 44, 24])).toEqual([]);
    g.addCell(home, compactCells(plus(), [home]).get(cellKey(home))!);
    expect(g.placesIn([41, 22, 44, 24])).toEqual([inn]);
  });
});

describe("cells", () => {
  it("puts his own cell first", () => {
    const cells = cellsByPriority(42, 23, 2);
    expect(cells).toHaveLength(25);
    expect(cells[0]).toEqual(cellOf(42, 23));
  });

  it("prefers cells ahead", () => {
    const home = cellOf(42, 23);
    const at = (list: { x: number; y: number }[], dx: number) => list.findIndex((c) => c.x === home.x + dx && c.y === home.y);
    const east = cellsByPriority(42, 23, 1, [1, 0]);
    const west = cellsByPriority(42, 23, 1, [-1, 0]);
    expect(east[0]).toEqual(home);
    expect(at(east, 1)).toBeLessThan(at(east, -1));
    expect(at(west, -1)).toBeLessThan(at(west, 1));
  });

  it("boxes a set of cells", () => {
    const a = cellOf(42, 23);
    const box = cellsBbox([a, { x: a.x + 1, y: a.y + 1 }]);
    expect(box[0]).toBe(tileBbox({ x: a.x, y: a.y + 1 }, CELL_ZOOM)[0]);
    expect(box[3]).toBe(tileBbox({ x: a.x + 1, y: a.y }, CELL_ZOOM)[3]);
  });
});
