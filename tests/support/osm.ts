// A small "+" shaped street network around (42.0, 23.0), in Overpass JSON form.
//
//            2 (N)
//            |
//   5 (W) -- 1 -- 3 (E)        all arms ~111 m
//            |
//            4 (S)
import { cellOf, cellsBbox } from "../../src/core/graph";
import type { OverpassData } from "../../src/core/graph";

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
