// Network access to map services: OpenFreeMap vector tiles for streets
// (Overpass as backup), Photon (Nominatim as backup) for city search, OSRM
// for road routes between cities, Wikidata for city trivia and Nominatim for
// city outlines. Fetch is injected, so it is easy to test.
import * as CityFacts from "../core/cityFacts";
import type { BBox, Tile } from "../core/geo";
import type { Cell, OverpassData } from "../core/graph";
import { fromPbf, TILE_ZOOM } from "../core/ofm";
import type { LatLon } from "../core/trips";

/** Public Overpass servers, tried in order; the main one is often busy (429/504). */
export const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
/** Free vector tiles, no key needed. The TileJSON names the current tile set. */
export const OFM_TILEJSON = "https://tiles.openfreemap.org/planet";
export const TILE_TIMEOUT_S = 20;
/** Built for search-as-you-type; the Nominatim policy forbids autocomplete, so it only steps in when Photon fails. */
export const PHOTON_URL = "https://photon.komoot.io/api/";
/** Only settlements: cities, towns and villages, suburbs, hamlets. */
const PHOTON_PLACES = "&layer=city&layer=district&layer=locality";
export const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
export const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";
/** Public OSRM demo server: one driving route per trip by bus or car. */
export const OSRM_URL = "https://router.project-osrm.org/route/v1/driving/";
/** Most points a route keeps, so saves stay small. */
export const MAX_ROUTE_POINTS = 300;
const WALKABLE = "primary|secondary|tertiary|unclassified|residential|living_street|pedestrian|footway|path|service|track|steps|cycleway";
/** Longer than the query's own [timeout:25], or slow but valid answers get thrown away. */
export const OVERPASS_TIMEOUT_S = 35;
/** A server that just failed is tried last for this long. */
export const REST_MS = 60_000;

export type SearchPlace = { name: string; lat: number; lon: number; bbox: BBox | null };
export type ServerStat = { ok: number; fail: number; last_error: string; rest_until_ms: number };
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export const hostOf = (url: string) => url.split("://")[1]?.split("/")[0] ?? "";

export function overpassQuery(b: BBox): string {
  // Ways with tags (for street names), then their nodes as bare coordinates.
  return `[out:json][timeout:25];way["highway"~"^(${WALKABLE})$"](${b[0]},${b[1]},${b[2]},${b[3]});out body;node(w);out skel qt;`;
}

/** A failed request in plain words: an HTTP status or a fetch error. */
export function describeFailure(f: number | Error): string {
  if (typeof f === "number") {
    if (f === 429) return "HTTP 429 (server busy)";
    if (f === 504) return "HTTP 504 (server timed out)";
    if (f === 503) return "HTTP 503 (server overloaded)";
    return `HTTP ${f}`;
  }
  if (f.name === "TimeoutError" || f.name === "AbortError") return "no answer in time";
  if (f.name === "TypeError") return "can't connect";
  return `request failed (${f.message})`;
}

/** Places from a Photon GeoJSON answer, or null if it isn't one. */
export function photonPlaces(data: unknown): SearchPlace[] | null {
  const features = (data as { features?: unknown })?.features;
  if (!Array.isArray(features)) return null;
  const out: SearchPlace[] = [];
  for (const f of features) {
    const p = (f?.properties ?? {}) as Record<string, unknown>;
    const c = f?.geometry?.coordinates;
    if (!Array.isArray(c) || c.length < 2) continue;
    const parts: string[] = [];
    for (const k of ["name", "city", "state", "country"]) {
      const v = p[k] === undefined ? "" : String(p[k]);
      if (v !== "" && !parts.includes(v)) parts.push(v);
    }
    const e = p.extent; // [west, north, east, south]
    const bbox: BBox | null = Array.isArray(e) && e.length === 4 ? [+e[3], +e[0], +e[1], +e[2]] : null;
    out.push({ name: parts.join(", "), lat: +c[1], lon: +c[0], bbox });
  }
  return out;
}

/** Places from a Nominatim jsonv2 answer, or null if it isn't one. */
export function nominatimPlaces(data: unknown): SearchPlace[] | null {
  if (!Array.isArray(data)) return null;
  return data.map((r) => {
    const b = r.boundingbox; // [south, north, west, east]
    const bbox: BBox | null = Array.isArray(b) && b.length === 4 ? [+b[0], +b[2], +b[1], +b[3]] : null;
    return { name: String(r.display_name ?? ""), lat: +r.lat, lon: +r.lon, bbox };
  });
}

export function osrmUrl(a: LatLon, b: LatLon): string {
  const f = (v: number) => v.toFixed(5);
  return `${OSRM_URL}${f(a[1])},${f(a[0])};${f(b[1])},${f(b[0])}?overview=simplified&geometries=geojson`;
}

/** OSRM's answer as [[lat, lon]...], thinned to MAX_ROUTE_POINTS; [] when it has no route. */
export function osrmPath(data: unknown): LatLon[] {
  const d = data as { code?: string; routes?: { geometry?: { coordinates?: number[][] } }[] } | null;
  if (!d || d.code !== "Ok" || !d.routes?.length) return [];
  const coords = d.routes[0]!.geometry?.coordinates ?? [];
  const step = Math.max(Math.ceil(coords.length / MAX_ROUTE_POINTS), 1);
  const out: LatLon[] = [];
  for (let i = 0; i < coords.length; i += step) out.push([coords[i]![1]!, coords[i]![0]!]);
  if (coords.length > 1 && (coords.length - 1) % step !== 0) out.push([coords.at(-1)![1]!, coords.at(-1)![0]!]);
  return out.length >= 2 ? out : [];
}

/** Nominatim's city-level area around a point, with its outline simplified. */
export function outlineUrl(lat: number, lon: number): string {
  return `${NOMINATIM_REVERSE_URL}?format=jsonv2&zoom=10&polygon_geojson=1&polygon_threshold=0.001&lat=${lat}&lon=${lon}`;
}

/** Rings of [lat, lon] from a Nominatim answer's GeoJSON outline; [] when it has no area. */
export function outlineRings(data: unknown): LatLon[][] {
  const g = (data as { geojson?: { type?: string; coordinates?: unknown } } | null)?.geojson;
  if (!g || typeof g !== "object") return [];
  const polys = (g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : []) as number[][][][];
  return polys.flatMap((poly) => poly.map((ring) => ring.map((p): LatLon => [p[1]!, p[0]!])));
}

async function gunzipIfNeeded(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export class Api {
  /** What happened to the latest requests, for the loading details. */
  lastOk: { host: string; bytes: number; ms: number; at_ms: number } | null = null;
  lastError: { host: string; error: string; at_ms: number } | null = null;
  active = 0;
  readonly serverStats = new Map<string, ServerStat>();
  /** Told about every failed request (the Debug panel's problems). */
  onProblem: (text: string) => void = () => {};
  private tileUrl = "";
  private searchCache = new Map<string, SearchPlace[]>();

  constructor(
    private readonly fetchFn: Fetch = (u, i) => fetch(u, i),
    private readonly now: () => number = () => performance.now(),
  ) {}

  private fail(url: string, error: string): void {
    this.lastError = { host: hostOf(url), error, at_ms: this.now() };
    this.onProblem(`Request to ${hostOf(url)} failed: ${error}`);
  }

  /** GETs `url` and returns the body, or null on any failure. */
  async getBytes(url: string, timeoutS = 60): Promise<Uint8Array | null> {
    const started = this.now();
    this.active++;
    try {
      const res = await this.fetchFn(url, { signal: AbortSignal.timeout(timeoutS * 1000) });
      if (res.status !== 200) {
        this.fail(url, describeFailure(res.status));
        return null;
      }
      const body = new Uint8Array(await res.arrayBuffer());
      this.lastOk = { host: hostOf(url), bytes: body.length, ms: this.now() - started, at_ms: this.now() };
      return body;
    } catch (e) {
      this.fail(url, describeFailure(e as Error));
      return null;
    } finally {
      this.active--;
    }
  }

  /** GETs `url` and returns parsed JSON, or null on any failure. */
  async getJson(url: string, timeoutS = 60): Promise<unknown> {
    const body = await this.getBytes(url, timeoutS);
    if (!body) return null;
    try {
      return JSON.parse(new TextDecoder().decode(body));
    } catch {
      this.fail(url, "answer was not valid JSON");
      return null;
    }
  }

  private errorFor(url: string): string {
    return this.lastError?.host === hostOf(url) ? this.lastError.error : "failed";
  }

  private serverResult(url: string, error: string): void {
    const host = hostOf(url);
    const st = this.serverStats.get(host) ?? { ok: 0, fail: 0, last_error: "", rest_until_ms: 0 };
    if (error === "") {
      st.ok++;
      st.rest_until_ms = 0;
    } else {
      st.fail++;
      st.last_error = error;
      st.rest_until_ms = this.now() + REST_MS;
    }
    this.serverStats.set(host, st);
  }

  /** The raw pbf of one z14 street tile from OpenFreeMap, or null. */
  async streetTileBytes(tile: Tile): Promise<Uint8Array | null> {
    if (this.tileUrl === "") {
      const tj = (await this.getJson(OFM_TILEJSON, TILE_TIMEOUT_S)) as { tiles?: string[] } | null;
      const first = tj?.tiles?.[0];
      if (!first) {
        this.serverResult(OFM_TILEJSON, this.errorFor(OFM_TILEJSON));
        return null;
      }
      this.tileUrl = first;
    }
    const url = this.tileUrl.replace("{z}", String(TILE_ZOOM)).replace("{x}", String(tile.x)).replace("{y}", String(tile.y));
    const body = await this.getBytes(url, TILE_TIMEOUT_S);
    if (!body) {
      this.serverResult(url, this.errorFor(url));
      return null;
    }
    this.serverResult(url, "");
    return gunzipIfNeeded(body);
  }

  /** Walkable streets of one z14 tile from OpenFreeMap, or null. */
  async streetTile(tile: Tile): Promise<Cell | null> {
    const bytes = await this.streetTileBytes(tile);
    return bytes ? fromPbf(bytes, tile) : null;
  }

  /** True while the tile server is resting after a failure. */
  tilesResting(): boolean {
    return this.now() < (this.serverStats.get(hostOf(OFM_TILEJSON))?.rest_until_ms ?? 0);
  }

  /** Overpass servers to try, starting at `first`; ones resting after a recent failure go last. */
  serverOrder(first = 0): string[] {
    const fresh: string[] = [];
    const resting: string[] = [];
    for (let i = 0; i < OVERPASS_URLS.length; i++) {
      const url = OVERPASS_URLS[(first + i) % OVERPASS_URLS.length]!;
      (this.now() < (this.serverStats.get(hostOf(url))?.rest_until_ms ?? 0) ? resting : fresh).push(url);
    }
    return [...fresh, ...resting];
  }

  /** Walkable streets inside the box as Overpass JSON, or null. Servers are tried in turn from `first`. */
  async streets(bbox: BBox, first = 0): Promise<OverpassData | null> {
    const q = encodeURIComponent(overpassQuery(bbox));
    for (const url of this.serverOrder(first)) {
      let data = (await this.getJson(`${url}?data=${q}`, OVERPASS_TIMEOUT_S)) as (OverpassData & { remark?: string }) | null;
      // Overpass answers 200 with a "remark" when the query died half way: that data is incomplete.
      const remark = typeof data?.remark === "string" ? data.remark : "";
      if (remark.toLowerCase().includes("error")) {
        this.fail(url, `server error: ${remark.slice(0, 80)}`);
        data = null;
      }
      if (data && typeof data === "object") {
        this.serverResult(url, "");
        return data;
      }
      this.serverResult(url, this.errorFor(url));
    }
    return null;
  }

  /** Up to 6 towns or cities matching `text`. Null when every search server fails. Kept for the session. */
  async searchPlaces(text: string): Promise<SearchPlace[] | null> {
    const key = text.trim().toLowerCase();
    const hit = this.searchCache.get(key);
    if (hit) return hit;
    const q = encodeURIComponent(text.trim());
    let places = photonPlaces(await this.getJson(`${PHOTON_URL}?limit=6${PHOTON_PLACES}&q=${q}`));
    places ??= nominatimPlaces(await this.getJson(`${NOMINATIM_URL}?format=jsonv2&limit=6&featureType=city&q=${q}`));
    if (places) this.searchCache.set(key, places);
    return places;
  }

  /** Wikidata facts about the city around a point, as SPARQL result rows; [] on failure. */
  async cityFacts(lat: number, lon: number): Promise<CityFacts.Row[]> {
    const data = (await this.getJson(CityFacts.url(lat, lon), 30)) as { results?: { bindings?: CityFacts.Row[] } } | null;
    return data?.results?.bindings ?? [];
  }

  /** The road route between two points, or [] on failure. */
  async route(a: LatLon, b: LatLon): Promise<LatLon[]> {
    return osrmPath(await this.getJson(osrmUrl(a, b), 30));
  }

  /** The city's real outline around a point as rings, [] on failure. */
  async cityOutline(lat: number, lon: number): Promise<LatLon[][]> {
    const rings = outlineRings(await this.getJson(outlineUrl(lat, lon), 30));
    if (rings.length === 0) this.onProblem(`No city outline from Nominatim near ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
    return rings;
  }
}
