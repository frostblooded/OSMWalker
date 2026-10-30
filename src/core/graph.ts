// Walkable street network. Streets come in fixed cells (map tiles at
// CELL_ZOOM, one OpenFreeMap vector tile each), so downloads never overlap,
// add up, and can be cached by name. Node ids are numbers: tile grid ids are
// positive (see ofm.ts) and OSM node ids from Overpass are negated.
import { bboxAround, distanceM, latToPx, lonToPx, tileBbox, tileOf, TILE_SIZE, type BBox, type Tile } from "./geo";
import type { Place } from "./stats";

/** A z14 tile is about 1.8 x 2.4 km at 42°N. */
export const CELL_ZOOM = 14;
/** Nudges [lon, lat] in degrees, about 1 cm, to see every cell a point touches. */
const EDGE_EPS: [number, number][] = [[-1e-7, -1e-7], [1e-7, -1e-7], [-1e-7, 1e-7], [1e-7, 1e-7]];

export type Way = { name: string; ids: number[] };
/** One cell's streets: node ids, their [lat, lon] pairs, ways and places of note. Structured-clone friendly. */
export type Cell = { ids: Float64Array; coords: Float64Array; ways: Way[]; places: Place[] };
/** Overpass JSON, as far as the graph reads it. */
export type OverpassData = {
  elements?: { type: string; id?: number; lat?: number; lon?: number; nodes?: number[]; tags?: Record<string, string> }[];
  places?: Place[];
};

const inBox = (p: Place, box: BBox) => p.lat >= box[0] && p.lat <= box[2] && p.lon >= box[1] && p.lon <= box[3];

export const cellKey = (c: Tile) => c.x * 2 ** CELL_ZOOM + c.y;
export const cellOf = (lat: number, lon: number): Tile => tileOf(lat, lon, CELL_ZOOM);

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

/**
 * Cells within `ring` cells of the point, most urgent first: his own cell,
 * then by distance, with cells ahead of `heading` [east, south] pulled forward.
 */
export function cellsByPriority(lat: number, lon: number, ring: number, heading: [number, number] = [0, 0]): Tile[] {
  const home = cellOf(lat, lon);
  const px = lonToPx(lon, CELL_ZOOM) / TILE_SIZE;
  const py = latToPx(lat, CELL_ZOOM) / TILE_SIZE;
  const len = Math.hypot(heading[0], heading[1]) || 1;
  const hx = heading[0] / len;
  const hy = heading[1] / len;
  const scored: [number, Tile][] = [];
  for (let dy = -ring; dy <= ring; dy++) {
    for (let dx = -ring; dx <= ring; dx++) {
      const c = { x: home.x + dx, y: home.y + dy };
      const ox = c.x + 0.5 - px;
      const oy = c.y + 0.5 - py;
      scored.push([dx === 0 && dy === 0 ? -1 : Math.hypot(ox, oy) - 0.5 * (ox * hx + oy * hy), c]);
    }
  }
  return scored.sort((a, b) => a[0] - b[0]).map((s) => s[1]);
}

/**
 * Splits an Overpass response into per-cell data. Each cell gets every way
 * that has a node inside it, with all of that way's nodes, so the links of
 * every node in the cell are complete, and the places inside it.
 */
export function compactCells(data: OverpassData, list: Tile[]): Map<number, Cell> {
  const n = 2 ** CELL_ZOOM;
  const coords = new Map<number, [number, number]>();
  const nodeCell = new Map<number, number>();
  const ids = new Map<number, number[]>();
  const xy = new Map<number, number[]>();
  const ways = new Map<number, Way[]>();
  const places = new Map<number, Place[]>();
  const seen = new Map<number, Set<number>>();
  for (const c of list) {
    const k = cellKey(c);
    ids.set(k, []);
    xy.set(k, []);
    ways.set(k, []);
    places.set(k, []);
    seen.set(k, new Set());
  }
  for (const p of data.places ?? []) places.get(cellKey(cellOf(p.lat, p.lon)))?.push(p);
  const els = data.elements ?? [];
  for (const el of els) {
    if (el.type !== "node" || el.id === undefined || el.lat === undefined || el.lon === undefined) continue;
    const id = -el.id;
    coords.set(id, [el.lat, el.lon]);
    const r = (el.lat * Math.PI) / 180;
    const x = Math.floor(((el.lon + 180) / 360) * n);
    const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
    nodeCell.set(id, x * n + y);
  }
  for (const el of els) {
    if (el.type !== "way") continue;
    const name = el.tags?.name ?? el.tags?.ref ?? "";
    const wayIds: number[] = [];
    const touched = new Set<number>();
    for (const raw of el.nodes ?? []) {
      const id = -raw;
      if (!coords.has(id)) continue;
      wayIds.push(id);
      const c = nodeCell.get(id)!;
      if (ways.has(c)) touched.add(c);
    }
    for (const c of touched) {
      ways.get(c)!.push({ name, ids: wayIds });
      const s = seen.get(c)!;
      for (const id of wayIds) {
        if (s.has(id)) continue;
        s.add(id);
        ids.get(c)!.push(id);
        const p = coords.get(id)!;
        xy.get(c)!.push(p[0], p[1]);
      }
    }
  }
  const out = new Map<number, Cell>();
  for (const c of list) {
    const k = cellKey(c);
    out.set(k, { ids: Float64Array.from(ids.get(k)!), coords: Float64Array.from(xy.get(k)!), ways: ways.get(k)!, places: places.get(k)! });
  }
  return out;
}

export class StreetGraph {
  /** id -> [lat, lon] */
  readonly nodes = new Map<number, [number, number]>();
  /** id -> neighbour id -> street name ("" when unnamed) */
  readonly adjacency = new Map<number, Map<number, string>>();
  /** Every cell whose streets are all loaded, by cellKey. */
  readonly cells = new Set<number>();
  /** Places of note per loaded cell. */
  readonly places = new Map<number, Place[]>();
  /** Made-up places (core/poiGen.ts); each counts once its cell is loaded. */
  made: Place[] = [];

  /** Adds one cell's data and marks the cell loaded. */
  addCell(cell: Tile, data: Cell): void {
    for (let i = 0; i < data.ids.length; i++) {
      const id = data.ids[i]!;
      if (!this.nodes.has(id)) this.nodes.set(id, [data.coords[i * 2]!, data.coords[i * 2 + 1]!]);
    }
    for (const way of data.ways) {
      for (let i = 0; i < way.ids.length - 1; i++) {
        const a = way.ids[i]!;
        const b = way.ids[i + 1]!;
        if (a === b || !this.nodes.has(a) || !this.nodes.has(b)) continue;
        this.link(a, b, way.name);
      }
    }
    this.places.set(cellKey(cell), data.places);
    this.cells.add(cellKey(cell));
  }

  /** Merges an Overpass response covering `bbox`. Only cells entirely inside it count as loaded. */
  addOverpass(data: OverpassData, bbox: BBox): Map<number, Cell> {
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
    for (const c of inside) this.addCell(c, compact.get(cellKey(c))!);
    return compact;
  }

  /** Places of note in loaded cells inside the box. */
  placesIn(box: BBox): Place[] {
    const out: Place[] = [];
    for (const list of this.places.values()) {
      for (const p of list) if (inBox(p, box)) out.push(p);
    }
    for (const p of this.made) if (inBox(p, box) && this.cells.has(cellKey(cellOf(p.lat, p.lon)))) out.push(p);
    return out;
  }

  private link(a: number, b: number, name: string): void {
    this.linkOne(a, b, name);
    this.linkOne(b, a, name);
  }

  private linkOne(a: number, b: number, name: string): void {
    let m = this.adjacency.get(a);
    if (!m) this.adjacency.set(a, (m = new Map()));
    if (name !== "" || !m.has(b)) m.set(b, name);
  }

  hasNode(id: number): boolean {
    return this.nodes.has(id);
  }

  neighbors(id: number): number[] {
    const m = this.adjacency.get(id);
    return m ? [...m.keys()] : [];
  }

  edgeLength(a: number, b: number): number {
    const pa = this.nodes.get(a)!;
    const pb = this.nodes.get(b)!;
    return distanceM(pa[0], pa[1], pb[0], pb[1]);
  }

  edgeName(a: number, b: number): string {
    return this.adjacency.get(a)?.get(b) ?? "";
  }

  /**
   * True when the node's cell is loaded, so all its links are known. A node
   * on a cell's edge (where tile streets are cut) needs the cells on both sides.
   */
  isComplete(id: number): boolean {
    const p = this.nodes.get(id);
    if (!p) return false;
    return EDGE_EPS.every((d) => this.cells.has(cellKey(cellOf(p[0] + d[1], p[1] + d[0]))));
  }

  /** True when every cell within marginM of the point is loaded. */
  covers(lat: number, lon: number, marginM: number): boolean {
    const m = bboxAround(lat, lon, marginM);
    const nw = cellOf(m[2], m[1]);
    const se = cellOf(m[0], m[3]);
    for (let y = nw.y; y <= se.y; y++) for (let x = nw.x; x <= se.x; x++) if (!this.cells.has(cellKey({ x, y }))) return false;
    return true;
  }

  /** Closest node with at least one street attached, or null if none. */
  nearestNode(lat: number, lon: number): number | null {
    let best: number | null = null;
    let bestD = Infinity;
    for (const [id, links] of this.adjacency) {
      if (links.size === 0) continue;
      const p = this.nodes.get(id)!;
      const d = distanceM(lat, lon, p[0], p[1]);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }
}
