// Streets from OpenFreeMap vector tiles.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { tileBbox, type Tile } from "../../src/core/geo";
import { cellKey, StreetGraph } from "../../src/core/graph";
import { BRIDGE, BRIDGE_RANK, decode, fromLayers, fromPbf, nodeId, posOf, type Feature, type Layer, type Layers } from "../../src/core/ofm";

// Real tiles from Sofia (only the two street layers kept), side by side.
const WEST: Tile = { x: 9253, y: 6039 };
const EAST: Tile = { x: 9254, y: 6039 };

const pbf = (t: Tile) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../fixtures/ofm/14_${t.x}_${t.y}.pbf`, import.meta.url))));
const layers = (street: Feature, names: Feature[] = []): Layers => ({
  transportation: { extent: 4096, features: [street] },
  transportation_name: { extent: 4096, features: names },
});
const minor = (...lines: number[][]): Feature => ({ tags: { class: "minor" }, lines });
const coordsOf = (cell: ReturnType<typeof fromLayers>, id: number) => {
  const i = cell.ids.indexOf(id);
  return i < 0 ? null : [cell.coords[i * 2]!, cell.coords[i * 2 + 1]!];
};

describe("ofm streets", () => {
  it("decodes line features and tags", () => {
    const d = decode(pbf(WEST), ["transportation"]);
    expect(Object.keys(d)).toEqual(["transportation"]);
    expect(d.transportation!.extent).toBe(4096);
    const f = d.transportation!.features[0]!;
    expect(f.tags).toHaveProperty("class");
    expect(f.lines![0]!.length).toBeGreaterThanOrEqual(4);
  });

  it("keeps walkable streets only", () => {
    const line = [[100, 100, 200, 100]];
    for (const [cls, sub] of [["minor"], ["path", "footway"], ["primary"]]) {
      expect(fromLayers(layers({ tags: { class: cls!, ...(sub ? { subclass: sub } : {}) }, lines: line }), WEST).ways, `${cls}`).toHaveLength(1);
    }
    for (const [cls, sub] of [["motorway"], ["transit", "subway"], ["path", "platform"], ["busway"]]) {
      expect(fromLayers(layers({ tags: { class: cls!, ...(sub ? { subclass: sub } : {}) }, lines: line }), WEST).ways, `${cls}`).toHaveLength(0);
    }
  });

  it("gives the same point the same id in both tiles", () => {
    // A point at x=4090 in the west tile is x=-6 in the east tile's buffer.
    const west = fromLayers(layers(minor([4000, 500, 4090, 600])), WEST);
    const id = nodeId(WEST.x * 4096 + 4090, WEST.y * 4096 + 600);
    expect(coordsOf(west, id)).not.toBeNull();
    expect(nodeId(EAST.x * 4096 - 6, EAST.y * 4096 + 600)).toBe(id);
    expect(posOf(id)).toEqual([WEST.x * 4096 + 4090, WEST.y * 4096 + 600]);
  });

  it("meets a street crossing the edge in the middle", () => {
    const west = fromLayers(layers(minor([3900, 1000, 4160, 1131])), WEST);
    const east = fromLayers(layers(minor([-64, 1067, 300, 1250])), EAST);
    const w = west.ways[0]!.ids;
    const e = east.ways[0]!.ids;
    expect(w).toHaveLength(2);
    expect(e).toHaveLength(2);
    expect(w[w.length - 1]).toBe(e[0]);
    expect(coordsOf(west, w[w.length - 1]!)![1]).toBeCloseTo(tileBbox(WEST, 14)[3], 9);
  });

  it("drops parts outside the tile", () => {
    expect(fromLayers(layers(minor([-60, 10, -10, 10])), WEST).ways).toHaveLength(0);
  });

  it("takes names from the name layer", () => {
    const named: Feature = { tags: { name: "Vitosha", class: "minor" }, lines: [[100, 100, 200, 100]] };
    const ways = fromLayers(layers(minor([100, 100, 200, 100, 300, 150]), [named]), WEST).ways;
    expect(ways).toHaveLength(2);
    expect(ways[0]!.name).toBe("Vitosha");
    expect(ways[1]!.name).toBe("");
    expect(ways[0]!.ids.at(-1)).toBe(ways[1]!.ids[0]);
  });

  it("makes a place of each named walkable bridge, at its middle", () => {
    const bridge = (cls: string, line: number[]): Feature => ({ tags: { class: cls, brunnel: "bridge" }, lines: [line] });
    const named = (name: string, line: number[]): Feature => ({ tags: { name, class: "minor" }, lines: [line] });
    const cell = fromLayers(
      {
        transportation: { extent: 4096, features: [bridge("minor", [100, 100, 200, 100, 300, 100]), bridge("path", [100, 500, 200, 500]), bridge("motorway", [100, 900, 200, 900]), bridge("minor", [100, 1300, 200, 1300]), bridge("path", [100, 1700, 200, 1700])] },
        transportation_name: { extent: 4096, features: [named("Vitosha", [100, 100, 200, 100, 300, 100]), named("Lavov most", [100, 500, 200, 500]), named("Ring", [100, 900, 200, 900])] },
      },
      WEST,
    );
    const b = cell.places.filter((p) => p.class === BRIDGE);
    // The motorway and the unnamed street bridge are left out; a name that says bridge is kept as it is.
    expect(b.map((p) => p.name)).toEqual(["Bridge on Vitosha", "Lavov most", "Footbridge"]);
    expect(b[0]).toMatchObject({ subclass: BRIDGE, rank: BRIDGE_RANK });
    const mid = coordsOf(cell, nodeId(WEST.x * 4096 + 200, WEST.y * 4096 + 100))!;
    expect(b[0]!.lat).toBeCloseTo(mid[0]!, 9);
    expect(b[0]!.lon).toBeCloseTo(mid[1]!, 9);
  });

  it("finds the bridges in a real tile", () => {
    const b = fromPbf(pbf(EAST), EAST).places.filter((p) => p.class === BRIDGE);
    expect(b.map((p) => p.name)).toContain("Bridge on Черковна");
    expect(b.some((p) => p.name === "Footbridge")).toBe(true);
  });

  it("joins a side street ending mid-segment", () => {
    const main = minor([100, 100, 300, 100]);
    const side: Feature = { tags: { class: "minor" }, lines: [[200, 100, 200, 300]] };
    // The side street ends on the main street's segment but shares no node with it.
    const cell = fromLayers({ transportation: { extent: 4096, features: [main, side] } }, WEST);
    const g = new StreetGraph();
    g.addCell(WEST, cell);
    const mid = nodeId(WEST.x * 4096 + 200, WEST.y * 4096 + 100);
    expect(g.neighbors(mid)).toHaveLength(3);
  });

  it("keeps named places inside the tile", () => {
    const poi: Layer = {
      extent: 4096,
      features: [
        { tags: { name: "Cafe", class: "cafe", subclass: "cafe", rank: 3 }, points: [10, 10] },
        { tags: { name: "Stop", class: "bus", subclass: "bus_stop" }, points: [20, 20] },
        { tags: { name: "Over", class: "shop" }, points: [5000, 10] },
        { tags: { class: "shop" }, points: [30, 30] },
      ],
    };
    const p = fromLayers({ poi }, WEST).places;
    expect(p.map((x) => x.name)).toEqual(["Cafe"]);
    expect(p[0]!.rank).toBe(3);
  });

  it("makes one connected network from real Sofia tiles", () => {
    const g = new StreetGraph();
    for (const t of [WEST, EAST]) g.addCell(t, fromPbf(pbf(t), t));
    expect(g.cells.has(cellKey(WEST))).toBe(true);
    expect(g.adjacency.size).toBeGreaterThan(3000);
    const seam = tileBbox(WEST, 14)[3];
    let crossings = 0;
    for (const [id, links] of g.adjacency) if (Math.abs(g.nodes.get(id)![1] - seam) < 1e-7 && links.size >= 2) crossings++;
    expect(crossings).toBeGreaterThan(20);
    const start = g.nearestNode(42.687, 23.319)!;
    const seen = new Set([start]);
    const todo = [start];
    while (todo.length) for (const n of g.neighbors(todo.pop()!)) if (!seen.has(n)) seen.add(n), todo.push(n);
    expect(seen.size).toBeGreaterThan(g.adjacency.size * 0.8);
    let named = 0;
    for (const links of g.adjacency.values()) for (const name of links.values()) if (name) named++;
    expect(named / 2).toBeGreaterThan(1000);
  });

  it("converts a dense tile quickly", () => {
    const bytes = pbf(WEST);
    const t0 = performance.now();
    fromPbf(bytes, WEST);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});
