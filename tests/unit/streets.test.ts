import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Tile } from "../../src/core/geo";
import { cellKey, cellOf, cellsByPriority, StreetGraph, type Cell } from "../../src/core/graph";
import { Api, OFM_TILEJSON } from "../../src/net/api";
import type { LoadFn } from "../../src/streets/client";
import { MAX_PARALLEL, RETRY_MS, StreetLoader } from "../../src/streets/loader";
import { cacheKey, loadCell, MAX_AGE_S, type Cached, type Loaded, type Store } from "../../src/streets/source";
import { plus } from "../support/osm";

const SOFIA: Tile = { x: 9253, y: 6039 };
const pbf = () => readFileSync(fileURLToPath(new URL("../fixtures/ofm/14_9253_6039.pbf", import.meta.url)));
const TILEJSON = JSON.stringify({ tiles: ["https://t.example/{z}/{x}/{y}.pbf"] });

class MapStore implements Store {
  data = new Map<string, Cached>();
  async get(k: string) {
    return this.data.get(k);
  }
  async put(k: string, v: Cached) {
    this.data.set(k, structuredClone(v));
  }
}

function api(opts: { tiles?: boolean; overpass?: boolean } = {}) {
  const asked: string[] = [];
  const a = new Api(async (url) => {
    asked.push(url);
    if (url === OFM_TILEJSON) return new Response(TILEJSON);
    if (url.startsWith("https://t.example/")) return opts.tiles === false ? new Response("", { status: 503 }) : new Response(pbf());
    return opts.overpass ? new Response(JSON.stringify(plus())) : new Response("", { status: 504 });
  });
  return { a, asked };
}

describe("loadCell", () => {
  it("downloads the tile and caches it", async () => {
    const { a } = api();
    const store = new MapStore();
    const r = await loadCell(SOFIA, a, store, { nowS: 1000 });
    expect("cell" in r && r.from).toBe("tile");
    expect(store.data.get(cacheKey(SOFIA))!.t).toBe(1000);
  });

  it("reads the cache first", async () => {
    const { a, asked } = api();
    const store = new MapStore();
    await loadCell(SOFIA, a, store, { nowS: 1000 });
    asked.length = 0;
    const r = await loadCell(SOFIA, a, store, { nowS: 2000 });
    expect(r).toMatchObject({ from: "cache", stale: false });
    expect(asked).toEqual([]);
  });

  it("flags old cache entries as stale, and refreshes past the cache", async () => {
    const { a, asked } = api();
    const store = new MapStore();
    await loadCell(SOFIA, a, store, { nowS: 0 });
    expect(await loadCell(SOFIA, a, store, { nowS: MAX_AGE_S + 1 })).toMatchObject({ from: "cache", stale: true });
    asked.length = 0;
    expect(await loadCell(SOFIA, a, store, { nowS: MAX_AGE_S + 1, refresh: true })).toMatchObject({ from: "tile" });
    expect(store.data.get(cacheKey(SOFIA))!.t).toBe(MAX_AGE_S + 1);
  });

  it("falls back to Overpass when the tile fails", async () => {
    const { a } = api({ tiles: false, overpass: true });
    const home = cellOf(42, 23);
    const r = await loadCell(home, a, null);
    expect("cell" in r && r.from).toBe("overpass");
    expect("cell" in r && r.cell.ids.length).toBe(5);
  });

  it("says why when everything fails", async () => {
    const { a } = api({ tiles: false });
    expect(await loadCell(SOFIA, a, null)).toEqual({ error: "HTTP 504 (server timed out)" });
  });
});

/** A load function whose answers the test hands out. */
function manual() {
  const pending: { tile: Tile; refresh: boolean; done: (r: Loaded) => void }[] = [];
  const load: LoadFn = (tile, opts) => new Promise((done) => pending.push({ tile, refresh: !!opts.refresh, done }));
  return { load, pending };
}
const empty = (): Cell => ({ ids: new Float64Array(), coords: new Float64Array(), ways: [], places: [] });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("StreetLoader", () => {
  const ring = cellsByPriority(42, 23, 2);

  it("loads a few cells at once, his own first", () => {
    const { load, pending } = manual();
    new StreetLoader(new StreetGraph(), load).request(ring);
    expect(pending).toHaveLength(MAX_PARALLEL);
    expect(pending[0]!.tile).toEqual(ring[0]);
  });

  it("keeps a slot free for his own cell", () => {
    const { load, pending } = manual();
    const g = new StreetGraph();
    g.cells.add(cellKey(ring[0]!));
    new StreetLoader(g, load).request(ring);
    expect(pending).toHaveLength(MAX_PARALLEL - 1);
  });

  it("adds loaded cells to the graph and counts them", async () => {
    const { load, pending } = manual();
    const g = new StreetGraph();
    const loader = new StreetLoader(g, load);
    loader.request(ring);
    pending[0]!.done({ cell: empty(), from: "cache", stale: false });
    pending[1]!.done({ cell: empty(), from: "tile", stale: false });
    await flush();
    expect(g.cells.has(cellKey(ring[0]!))).toBe(true);
    expect(loader.stats()).toMatchObject({ loaded: 2, from_cache: 1, downloaded: 1, loading: 1 });
    expect(loader.cellState(ring[0]!)).toBe("loaded");
    expect(loader.cellState(ring[2]!)).toBe("loading");
  });

  it("waits before retrying a failed cell", async () => {
    const { load, pending } = manual();
    let t = 0;
    const problems: string[] = [];
    const loader = new StreetLoader(new StreetGraph(), load, () => t);
    loader.onProblem = (p) => problems.push(p);
    loader.request([ring[0]!]);
    pending[0]!.done({ error: "HTTP 503 (server overloaded)" });
    await flush();
    expect(loader.isFailing()).toBe(true);
    expect(problems[0]).toContain("HTTP 503");
    loader.request([ring[0]!]);
    expect(pending).toHaveLength(1);
    expect(loader.cellState(ring[0]!)).toBe("download failed, retry in 15 s");
    t = RETRY_MS;
    loader.request([ring[0]!]);
    expect(pending).toHaveLength(2);
  });

  it("refreshes stale cells when nothing else waits, keeping only their places", async () => {
    const { load, pending } = manual();
    const g = new StreetGraph();
    const loader = new StreetLoader(g, load);
    const c = ring[0]!;
    loader.request([c]);
    pending[0]!.done({ cell: empty(), from: "cache", stale: true });
    await flush();
    loader.request([c]);
    expect(pending[1]).toMatchObject({ tile: c, refresh: true });
    const cafe = { name: "Cafe", class: "cafe", subclass: "cafe", rank: 1, lat: 42, lon: 23 };
    pending[1]!.done({ cell: { ...empty(), places: [cafe] }, from: "tile", stale: false });
    await flush();
    expect(g.places.get(cellKey(c))).toEqual([cafe]);
  });

  it("drops loads for a graph it no longer serves", async () => {
    const { load, pending } = manual();
    const old = new StreetGraph();
    const loader = new StreetLoader(old, load);
    loader.request(ring);
    const fresh = new StreetGraph();
    loader.setGraph(fresh);
    pending[0]!.done({ cell: empty(), from: "tile", stale: false });
    await flush();
    expect(old.cells.size).toBe(0);
    expect(fresh.cells.size).toBe(0);
    loader.request(ring);
    expect(pending).toHaveLength(MAX_PARALLEL * 2);
  });
});
