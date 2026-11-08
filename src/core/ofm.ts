// Turns an OpenFreeMap (OpenMapTiles schema) z14 vector tile into one street
// graph cell, with the tile's named places of note (shops, cafes, sights...).
//
// Tiles carry no OSM node ids, so a node's id is its position on the tile
// grid: the same point gets the same id in every tile. Lines are clipped at
// the tile's edge, and the cut point is snapped so both neighbours agree on it.
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { pxToLat, pxToLon, type Tile } from "./geo";
import type { Cell, Way } from "./graph";
import type { Place } from "./stats";

export const TILE_ZOOM = 14;
/** Positions are kept in units of 1/4096 of a z14 tile, which are pixels at zoom 18. */
export const UNIT_ZOOM = 18;
export const UNITS = 4096;
export const LAYERS = ["transportation", "transportation_name", "poi"];
const WALKABLE = new Set(["primary", "secondary", "tertiary", "minor", "service", "track", "path"]);
const NOT_WALKABLE_SUBCLASS = new Set(["platform", "corridor"]);
/** Stops and entrances are everywhere and not worth a walk. */
export const NOT_A_PLACE_SUBCLASS = new Set(["bus_stop", "tram_stop", "subway_entrance", "train_station_entrance", "platform"]);
/** A named street bridge is a place too, of this class; rank 10 (POIs are mostly 1 to 5) makes it a goal now and then. */
export const BRIDGE = "bridge";
export const BRIDGE_RANK = 10;
/** A street name that already says bridge, in a few languages (a whole word, or the end of a compound like "Oberbaumbrücke"); others become "Bridge on <street>". */
const BRIDGE_WORD = /(?<!\p{L})(bridge|pont|puente|ponte|most|мост)(?!\p{L})|(brücke|brug|híd|köprüsü|köprü)(?!\p{L})/iu;
/** Edge cuts are rounded to this many units (about 2 m), so both tiles' clipped copies of a street meet. */
const SNAP = 4;
/** How close (in units, about 0.6 m) a dead end or other node must be to a segment to be joined onto it. */
const JOIN_TOL = 1.5;
const GRID = 64;
/** Grid coordinates stay below 2^26 (2^14 tiles x 4096 units), so ids stay below 2^52. */
const SHIFT = 2 ** 26;

export type Feature = { tags: Record<string, string | number | boolean>; lines?: number[][]; points?: number[] };
export type Layer = { extent: number; features: Feature[] };
export type Layers = Record<string, Layer>;
type Pt = [number, number];

export const nodeId = (gx: number, gy: number) => gx * SHIFT + gy;
/** A node's position in grid units, from its id. */
export const posOf = (id: number): Pt => [Math.floor(id / SHIFT), id % SHIFT];

/** The wanted layers of a pbf tile, as flat [x0, y0, x1, y1, ...] lines and points in tile units. */
export function decode(bytes: Uint8Array, wanted = LAYERS): Layers {
  const vt = new VectorTile(new PbfReader(bytes));
  const out: Layers = {};
  for (const name of wanted) {
    const layer = vt.layers[name];
    if (!layer) continue;
    const features: Feature[] = [];
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      if (f.type !== 1 && f.type !== 2) continue;
      const geom = f.loadGeometry();
      const tags = f.properties;
      if (f.type === 2) features.push({ tags, lines: geom.map((ring) => ring.flatMap((p) => [p.x, p.y])) });
      else features.push({ tags, points: geom.flatMap((ring) => ring.flatMap((p) => [p.x, p.y])) });
    }
    out[name] = { extent: layer.extent, features };
  }
  return out;
}

export function fromPbf(bytes: Uint8Array, tile: Tile): Cell {
  return fromLayers(decode(bytes), tile);
}

export function fromLayers(layers: Layers, tile: Tile): Cell {
  const names = segmentNames(layers.transportation_name, tile);
  const t = layers.transportation;
  const scale = UNITS / (t?.extent ?? UNITS);
  const nodes = new Map<number, Pt>();
  // Only streets on the ground are joined where they cross: bridges, tunnels and other layers pass over or under.
  const ground: Way[] = [];
  const raised: Way[] = [];
  for (const f of t?.features ?? []) {
    if (!WALKABLE.has(String(f.tags.class)) || NOT_WALKABLE_SUBCLASS.has(String(f.tags.subclass))) continue;
    const onGround = (f.tags.brunnel === undefined || f.tags.brunnel === "ford") && !f.tags.layer;
    for (const line of f.lines ?? []) addLine(line, scale, tile, names, nodes, onGround ? ground : raised);
  }
  const ways = joinJunctions([...joinCrossings(ground, tile, nodes), ...raised]);
  const found = places(layers.poi, tile);
  const ids = new Float64Array(nodes.size);
  const coords = new Float64Array(nodes.size * 2);
  let i = 0;
  for (const [id, p] of nodes) {
    ids[i] = id;
    coords[i * 2] = p[0];
    coords[i * 2 + 1] = p[1];
    i++;
  }
  return { ids, coords, ways, places: [...found, ...bridges(t, layers.transportation_name, tile)] };
}

/**
 * One place per walkable bridge in the tile (see bridgeAt): a street bridge
 * by the street's name, an unnamed footbridge as "Footbridge". The name layer
 * is simplified past a bridge's own cut points, so names are matched by the
 * points they share with the bridge, and the name most of them carry wins
 * (a point at a crossing carries both streets).
 */
export function bridges(layer: Layer | undefined, nameLayer: Layer | undefined, tile: Tile): Place[] {
  if (!layer) return [];
  const scale = UNITS / layer.extent;
  const named = new Map<number, string[]>();
  for (const f of nameLayer?.features ?? []) {
    const name = String(f.tags.name ?? "");
    const k = UNITS / nameLayer!.extent;
    if (name === "") continue;
    for (const line of f.lines ?? []) {
      for (let i = 0; i + 1 < line.length; i += 2) {
        const id = idAt([line[i]! * k, line[i + 1]! * k], tile);
        const list = named.get(id);
        if (!list) named.set(id, [name]);
        else if (!list.includes(name)) list.push(name);
      }
    }
  }
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const f of layer.features) {
    if (f.tags.brunnel !== "bridge" || !WALKABLE.has(String(f.tags.class)) || NOT_WALKABLE_SUBCLASS.has(String(f.tags.subclass))) continue;
    for (const line of f.lines ?? []) {
      const p = bridgeAt(line, scale);
      if (!p) continue;
      const votes = new Map<string, number>();
      for (let j = 0; j + 1 < line.length; j += 2) for (const n of named.get(idAt([line[j]! * scale, line[j + 1]! * scale], tile)) ?? []) votes.set(n, (votes.get(n) ?? 0) + 1);
      let street = "";
      for (const [n, v] of votes) if (v > (votes.get(street) ?? 0)) street = n;
      const name = street === "" ? (f.tags.class === "path" ? "Footbridge" : "") : BRIDGE_WORD.test(street) ? street : `Bridge on ${street}`;
      const gx = tile.x * UNITS + p[0];
      const gy = tile.y * UNITS + p[1];
      const key = `${name}@${Math.round(gx / GRID)},${Math.round(gy / GRID)}`;
      if (name === "" || seen.has(key)) continue;
      seen.add(key);
      out.push({ name, class: BRIDGE, subclass: BRIDGE, rank: BRIDGE_RANK, lat: pxToLat(gy, UNIT_ZOOM), lon: pxToLon(gx, UNIT_ZOOM) });
    }
  }
  return out;
}

/**
 * Where a bridge line's place goes, in tile units, or null when another tile
 * has it. A line inside the tile: its middle point. One that leaves the tile
 * belongs to the tile it doesn't enter from the left or top: there it sits at
 * the first right or bottom edge crossing, snapped as street cuts are, so the
 * tiles next door (which see it cross their left or top edge) skip it. Only a
 * bridge that runs down-left through three tiles is placed twice.
 */
function bridgeAt(line: number[], scale: number): Pt | null {
  let crosses = false;
  let at: Pt | null = null;
  for (let i = 0; i + 3 < line.length; i += 2) {
    const p: Pt = [line[i]! * scale, line[i + 1]! * scale];
    const q: Pt = [line[i + 2]! * scale, line[i + 3]! * scale];
    if (inside(p) && inside(q)) continue;
    const cut = clip(p, q, UNITS);
    if (!cut) continue;
    crosses = true;
    for (const [c, end] of [[cut[0], p], [cut[1], q]] as const) {
      if (same(c, end)) continue;
      const e = snapToEdge(c, UNITS);
      if (e[0] === 0 || e[1] === 0) return null;
      at ??= e;
    }
  }
  if (crosses || line.length < 4) return at;
  const i = Math.floor((line.length / 2 - 1) / 2) * 2;
  const mid: Pt = [line[i]! * scale, line[i + 1]! * scale];
  return inside(mid) ? mid : null; // all in the buffer past the edge: the neighbouring tile has it
}

/** Named places inside the tile. A lower rank is more important within its tile. */
export function places(layer: Layer | undefined, tile: Tile): Place[] {
  if (!layer) return [];
  const scale = UNITS / layer.extent;
  const out: Place[] = [];
  for (const f of layer.features) {
    const name = String(f.tags.name ?? "");
    const subclass = String(f.tags.subclass ?? "");
    if (name === "" || NOT_A_PLACE_SUBCLASS.has(subclass)) continue;
    const pts = f.points ?? [];
    for (let i = 0; i + 1 < pts.length; i += 2) {
      const x = pts[i]! * scale;
      const y = pts[i + 1]! * scale;
      if (x < 0 || y < 0 || x >= UNITS || y >= UNITS) continue; // the neighbouring tile has it
      const gx = tile.x * UNITS + x;
      const gy = tile.y * UNITS + y;
      out.push({ name, class: String(f.tags.class ?? ""), subclass, rank: Number(f.tags.rank ?? 1), lat: pxToLat(gy, UNIT_ZOOM), lon: pxToLon(gx, UNIT_ZOOM) });
    }
  }
  return out;
}

/** The point of segment a-b closest to p, and how far along it that is (0 at a, 1 at b). */
function foot(p: Pt, a: Pt, b: Pt): [number, Pt] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return [0, a];
  const t = Math.min(Math.max(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2, 0), 1);
  return [t, [a[0] + dx * t, a[1] + dy * t]];
}

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const gridKey = (cx: number, cy: number) => cx * 4194304 + cy;

/**
 * Tiles drop some junction points, so a side street can end on the middle of
 * another street's segment without sharing a node. Splits that segment at the
 * street's end (and at any node lying right on a segment), so they connect.
 */
export function joinJunctions(ways: Way[]): Way[] {
  const degree = new Map<number, number>();
  for (const w of ways) {
    for (let i = 0; i < w.ids.length - 1; i++) {
      degree.set(w.ids[i]!, (degree.get(w.ids[i]!) ?? 0) + 1);
      degree.set(w.ids[i + 1]!, (degree.get(w.ids[i + 1]!) ?? 0) + 1);
    }
  }
  const grid = new Map<number, number[]>();
  for (const [n, d] of degree) {
    if (d !== 1) continue;
    const p = posOf(n);
    const k = gridKey(Math.floor(p[0] / GRID), Math.floor(p[1] / GRID));
    const list = grid.get(k);
    if (list) list.push(n);
    else grid.set(k, [n]);
  }
  // dead end -> [distance, way, segment, t, u, v]
  const best = new Map<number, [number, number, number, number, number, number]>();
  ways.forEach((w, wi) => {
    for (let i = 0; i < w.ids.length - 1; i++) {
      const u = w.ids[i]!;
      const v = w.ids[i + 1]!;
      const a = posOf(u);
      const b = posOf(v);
      const lox = Math.floor((Math.min(a[0], b[0]) - JOIN_TOL) / GRID);
      const loy = Math.floor((Math.min(a[1], b[1]) - JOIN_TOL) / GRID);
      const hix = Math.floor((Math.max(a[0], b[0]) + JOIN_TOL) / GRID);
      const hiy = Math.floor((Math.max(a[1], b[1]) + JOIN_TOL) / GRID);
      for (let cx = lox; cx <= hix; cx++) {
        for (let cy = loy; cy <= hiy; cy++) {
          for (const n of grid.get(gridKey(cx, cy)) ?? []) {
            if (n === u || n === v) continue;
            const p = posOf(n);
            const [t, q] = foot(p, a, b);
            const d = dist(q, p);
            if (d <= JOIN_TOL && d < (best.get(n)?.[0] ?? Infinity)) best.set(n, [d, wi, i, t, u, v]);
          }
        }
      }
    }
  });
  const splits: Splits = new Map();
  const extra: Way[] = [];
  for (const [n, e] of best) {
    const t = e[3];
    if (t < 0.01 || t > 0.99) extra.push({ name: "", ids: [n, t < 0.5 ? e[4] : e[5]] }); // next to its end: just link them
    else addSplit(splits, e[1], e[2], t, n);
  }
  return [...split(ways, splits), ...extra];
}

/** Way index * 2^20 + segment index -> the points [t along it, node id] it is cut at. */
type Splits = Map<number, [number, number][]>;

function addSplit(splits: Splits, way: number, seg: number, t: number, id: number): void {
  const key = way * 2 ** 20 + seg;
  const list = splits.get(key);
  if (list) list.push([t, id]);
  else splits.set(key, [[t, id]]);
}

/** The ways with each segment cut at its splits, in order along it. */
function split(ways: Way[], splits: Splits): Way[] {
  if (splits.size === 0) return ways;
  return ways.map((w, wi) => {
    const joined = [w.ids[0]!];
    for (let i = 0; i < w.ids.length - 1; i++) {
      const end = w.ids[i + 1]!;
      const cut = (splits.get(wi * 2 ** 20 + i) ?? []).sort((x, y) => x[0] - y[0]);
      for (const c of cut) if (c[1] !== joined[joined.length - 1] && c[1] !== end) joined.push(c[1]);
      joined.push(end);
    }
    return { name: w.name, ids: joined };
  });
}

/**
 * Tiles drop the shared node where streets cross without bending, so two
 * streets can cross with no node in common, or one street's corner can lie
 * on the other's segment. Cuts both at the crossing (a new node), or the
 * segment at the corner, so they connect. Dead ends are joined here too;
 * joinJunctions still joins those of bridges and tunnels.
 */
export function joinCrossings(ways: Way[], tile: Tile, nodes: Map<number, Pt>): Way[] {
  // Each segment's box (min x, min y, max x, max y) is widened by JOIN_TOL.
  const segs: { w: number; i: number; a: Pt; b: Pt; ia: number; ib: number; box: [number, number, number, number] }[] = [];
  const grid = new Map<number, number[]>();
  // Tile units keep the grid keys small.
  const ox = tile.x * UNITS;
  const oy = tile.y * UNITS;
  const local = (id: number): Pt => {
    const p = posOf(id);
    return [p[0] - ox, p[1] - oy];
  };
  ways.forEach((w, wi) => {
    for (let i = 0; i < w.ids.length - 1; i++) {
      const a = local(w.ids[i]!);
      const b = local(w.ids[i + 1]!);
      const box: [number, number, number, number] = [Math.min(a[0], b[0]) - JOIN_TOL, Math.min(a[1], b[1]) - JOIN_TOL, Math.max(a[0], b[0]) + JOIN_TOL, Math.max(a[1], b[1]) + JOIN_TOL];
      const s = segs.push({ w: wi, i, a, b, ia: w.ids[i]!, ib: w.ids[i + 1]!, box }) - 1;
      for (let cx = Math.floor(box[0] / GRID); cx <= Math.floor(box[2] / GRID); cx++) {
        for (let cy = Math.floor(box[1] / GRID); cy <= Math.floor(box[3] / GRID); cy++) {
          const k = gridKey(cx, cy);
          const list = grid.get(k);
          if (list) list.push(s);
          else grid.set(k, [s]);
        }
      }
    }
  });
  const splits: Splits = new Map();
  /** Cuts segment `s` at corner `p` (node `id`) when the corner lies on it. */
  const onto = (p: Pt, id: number, s: number) => {
    const { w, i, a: q, b: r } = segs[s]!;
    const [t, f] = foot(p, q, r);
    if (t <= 0 || t >= 1 || dist(f, p) > JOIN_TOL) return false;
    addSplit(splits, w, i, t, id);
    return true;
  };
  for (const [k, list] of grid) {
    for (let x = 0; x < list.length; x++) {
      const i = list[x]!;
      const { w: wi, i: si, a, b, ia, ib, box: p } = segs[i]!;
      for (let y = x + 1; y < list.length; y++) {
        const j = list[y]!;
        const { w: wj, i: sj, a: c, b: d, ia: ic, ib: id, box: q } = segs[j]!;
        const lx = Math.max(p[0], q[0]);
        const ly = Math.max(p[1], q[1]);
        // Boxes apart, or the pair is tried in the grid square where their overlap starts.
        if (lx > Math.min(p[2], q[2]) || ly > Math.min(p[3], q[3])) continue;
        if (gridKey(Math.floor(lx / GRID), Math.floor(ly / GRID)) !== k) continue;
        if (ia === ic || ia === id || ib === ic || ib === id) continue;
        if (onto(a, ia, j) || onto(b, ib, j) || onto(c, ic, i) || onto(d, id, i)) continue;
        const at = cross(a, b, c, d);
        if (!at) continue;
        const n = node(at, false, tile, nodes);
        const m = local(n);
        addSplit(splits, wi, si, foot(m, a, b)[0], n);
        addSplit(splits, wj, sj, foot(m, c, d)[0], n);
      }
    }
  }
  return split(ways, splits);
}

/** Where segments a-b and c-d cross between their ends, or null. */
function cross(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const r: Pt = [b[0] - a[0], b[1] - a[1]];
  const s: Pt = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (den === 0) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t > 0 && t < 1 && u > 0 && u < 1 ? [a[0] + r[0] * t, a[1] + r[1] * t] : null;
}

/** Segment key (either direction) -> street name, for every segment of every named line. */
function segmentNames(layer: Layer | undefined, tile: Tile): Map<string, string> {
  const out = new Map<string, string>();
  if (!layer) return out;
  const scale = UNITS / layer.extent;
  for (const f of layer.features) {
    const name = String(f.tags.name ?? "");
    if (name === "") continue;
    for (const line of f.lines ?? []) {
      for (let i = 0; i + 3 < line.length; i += 2) {
        const a = idAt([line[i]! * scale, line[i + 1]! * scale], tile);
        const b = idAt([line[i + 2]! * scale, line[i + 3]! * scale], tile);
        out.set(segKey(a, b), name);
      }
    }
  }
  return out;
}

const segKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
const idAt = (p: Pt, tile: Tile) => nodeId(tile.x * UNITS + Math.round(p[0]), tile.y * UNITS + Math.round(p[1]));
const inside = (p: Pt) => p[0] >= 0 && p[1] >= 0 && p[0] <= UNITS && p[1] <= UNITS;
const same = (a: Pt, b: Pt) => a[0] === b[0] && a[1] === b[1];

/** Adds the parts of `line` inside the tile as ways, one per run of same-named segments. */
function addLine(line: number[], scale: number, tile: Tile, names: Map<string, string>, nodes: Map<number, Pt>, ways: Way[]): void {
  let run: number[] = [];
  let runName = "";
  const flush = () => {
    if (run.length >= 2) ways.push({ name: runName, ids: run });
  };
  for (let i = 0; i + 3 < line.length; i += 2) {
    const p: Pt = [line[i]! * scale, line[i + 1]! * scale];
    const q: Pt = [line[i + 2]! * scale, line[i + 3]! * scale];
    const cut: [Pt, Pt] | null = inside(p) && inside(q) ? [p, q] : clip(p, q, UNITS);
    if (!cut) {
      flush();
      run = [];
      continue;
    }
    const a = node(cut[0], !same(cut[0], p), tile, nodes);
    const b = node(cut[1], !same(cut[1], q), tile, nodes);
    if (a === b) continue;
    const name = names.get(segKey(idAt(p, tile), idAt(q, tile))) ?? "";
    if (run.length === 0 || run[run.length - 1] !== a || name !== runName) {
      flush();
      run = [a];
      runName = name;
    }
    run.push(b);
  }
  flush();
}

/** Id of a point, adding it to `nodes`. Cut points are snapped along their edge. */
function node(p: Pt, cut: boolean, tile: Tile, nodes: Map<number, Pt>): number {
  if (cut) p = snapToEdge(p, UNITS);
  const gx = tile.x * UNITS + Math.round(p[0]);
  const gy = tile.y * UNITS + Math.round(p[1]);
  const id = nodeId(gx, gy);
  if (!nodes.has(id)) nodes.set(id, [pxToLat(gy, UNIT_ZOOM), pxToLon(gx, UNIT_ZOOM)]);
  return id;
}

/** A point on the tile's edge, with its position along the edge rounded to SNAP. */
export function snapToEdge(p: Pt, size: number): Pt {
  const dx = Math.min(Math.abs(p[0]), Math.abs(p[0] - size));
  const dy = Math.min(Math.abs(p[1]), Math.abs(p[1] - size));
  if (dx <= dy) return [Math.abs(p[0]) < Math.abs(p[0] - size) ? 0 : size, Math.round(p[1] / SNAP) * SNAP];
  return [Math.round(p[0] / SNAP) * SNAP, Math.abs(p[1]) < Math.abs(p[1] - size) ? 0 : size];
}

/** The part of segment p-q inside the square 0..size (Liang-Barsky), or null if none. */
export function clip(p: Pt, q: Pt, size: number): [Pt, Pt] | null {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  let t0 = 0;
  let t1 = 1;
  for (const [den, num] of [[-dx, p[0]], [dx, size - p[0]], [-dy, p[1]], [dy, size - p[1]]] as const) {
    if (den === 0) {
      if (num < 0) return null;
      continue;
    }
    const t = num / den;
    if (den < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [t0 > 0 ? [p[0] + dx * t0, p[1] + dy * t0] : p, t1 < 1 ? [p[0] + dx * t1, p[1] + dy * t1] : q];
}
