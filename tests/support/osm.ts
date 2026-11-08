// A small "+" shaped street network around (42.0, 23.0), in Overpass JSON form.
//
//            2 (N)
//            |
//   5 (W) -- 1 -- 3 (E)        all arms ~111 m
//            |
//            4 (S)
import { tileBbox, type BBox, type Tile } from "../../src/core/geo";
import { CELL_ZOOM, cellKey, cellOf, compactCells, type OverpassData, type StreetGraph } from "../../src/core/graph";

/** Box around a set of cells. */
export function cellsBbox(list: Tile[]): BBox {
  const box: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const c of list) {
    const b = tileBbox(c, CELL_ZOOM);
    box[0] = Math.min(box[0], b[0]);
    box[1] = Math.min(box[1], b[1]);
    box[2] = Math.max(box[2], b[2]);
    box[3] = Math.max(box[3], b[3]);
  }
  return box;
}

/** Adds an Overpass response covering `bbox` to `g`. Only cells entirely inside it count as loaded. */
export function addOverpass(g: StreetGraph, data: OverpassData, bbox: BBox): void {
  const nw = cellOf(bbox[2], bbox[1]);
  const se = cellOf(bbox[0], bbox[3]);
  const inside: Tile[] = [];
  for (let y = nw.y; y <= se.y; y++) {
    for (let x = nw.x; x <= se.x; x++) {
      const b = tileBbox({ x, y }, CELL_ZOOM);
      if (b[0] >= bbox[0] && b[1] >= bbox[1] && b[2] <= bbox[2] && b[3] <= bbox[3]) inside.push({ x, y });
    }
  }
  const compact = compactCells(data, inside);
  for (const c of inside) g.addCell(c, compact.get(cellKey(c))!);
}

const home = cellOf(42, 23);
/** The 3 x 3 cells around the cross. */
export const PLUS_BBOX = cellsBbox([
  { x: home.x - 1, y: home.y - 1 },
  { x: home.x + 1, y: home.y + 1 },
]);

export function plus(): OverpassData {
  return {
    elements: [
      { type: "node", id: 1, lat: 42.0, lon: 23.0 },
      { type: "node", id: 2, lat: 42.001, lon: 23.0 },
      { type: "node", id: 3, lat: 42.0, lon: 23.00135 },
      { type: "node", id: 4, lat: 41.999, lon: 23.0 },
      { type: "node", id: 5, lat: 42.0, lon: 22.99865 },
      { type: "way", id: 100, nodes: [4, 1, 2], tags: { highway: "residential", name: "Main St" } },
      { type: "way", id: 101, nodes: [5, 1, 3], tags: { highway: "footway" } },
    ],
  };
}
