// Where one street cell comes from: the on-device cache first, then its
// OpenFreeMap vector tile, then Overpass if the tile fails. Runs in the
// streets worker, so decoding never blocks a frame.
import { tileBbox, type Tile } from "../core/geo";
import { CELL_ZOOM, cellKey, compactCells, type Cell } from "../core/graph";
import { fromPbf } from "../core/ofm";
import type { Api } from "../net/api";

/** Bump when the cell format or node ids change, so old entries are not mixed in. */
export const CACHE_VERSION = "v1";
/** Cached cells older than this are used, then fetched again for next time. */
export const MAX_AGE_S = 30 * 86400;
/** Most cells kept on the device (about 100 KB each). */
export const MAX_CACHED = 400;

export type Cached = { t: number; cell: Cell };
export interface Store {
  get(key: string): Promise<Cached | undefined>;
  put(key: string, value: Cached): Promise<void>;
}
export type From = "cache" | "tile" | "overpass";
export type Loaded = { cell: Cell; from: From; stale: boolean } | { error: string };
export type LoadOpts = { refresh?: boolean; useTiles?: boolean; server?: number; nowS?: number };

export const cacheKey = (c: Tile) => `${CACHE_VERSION}_${CELL_ZOOM}_${c.x}_${c.y}`;
export const isStale = (savedAt: number, nowS: number, maxAgeS = MAX_AGE_S) => nowS - savedAt > maxAgeS;

export async function loadCell(tile: Tile, api: Api, store: Store | null, opts: LoadOpts = {}): Promise<Loaded> {
  const nowS = opts.nowS ?? Math.floor(Date.now() / 1000);
  const key = cacheKey(tile);
  if (store && !opts.refresh) {
    const hit = await store.get(key).catch(() => undefined);
    if (hit?.cell) return { cell: hit.cell, from: "cache", stale: isStale(hit.t, nowS) };
  }
  let from: From = "tile";
  let cell: Cell | null = null;
  if ((opts.useTiles ?? true) && !api.tilesResting()) {
    const bytes = await api.streetTileBytes(tile);
    cell = bytes ? fromPbf(bytes, tile) : null;
  }
  if (!cell) {
    from = "overpass";
    const data = await api.streets(tileBbox(tile, CELL_ZOOM), opts.server ?? 0);
    cell = data ? (compactCells(data, [tile]).get(cellKey(tile)) ?? null) : null;
  }
  if (!cell) return { error: api.lastError?.error ?? "failed" };
  if (store) await store.put(key, { t: nowS, cell }).catch((e: Error) => api.onProblem(`Couldn't save streets to the device: ${e.message}`));
  return { cell, from, stale: false };
}
