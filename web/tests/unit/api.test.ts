import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import * as A from "../../src/net/api";

const BOX: [number, number, number, number] = [1, 2, 3, 4];
const pbf = () => readFileSync(fileURLToPath(new URL("../fixtures/ofm/14_9253_6039.pbf", import.meta.url)));
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });

/** An Api whose fetch answers with `answer(url)`; every asked url is kept. */
function fake(answer: (url: string) => Response | Promise<Response>) {
  const asked: string[] = [];
  let t = 0;
  const api = new A.Api(
    async (url) => {
      asked.push(url);
      return answer(url);
    },
    () => t,
  );
  return { api, asked, tick: (ms: number) => (t += ms) };
}

/** Servers where only the last one works. */
const flaky = () => fake((url) => (url.startsWith(A.OVERPASS_URLS.at(-1)!) ? json({ elements: [] }) : new Response("", { status: 504 })));

describe("overpass", () => {
  it("has fallback servers", () => {
    expect(A.OVERPASS_URLS.length).toBeGreaterThanOrEqual(2);
  });

  it("falls back to the next server on failure", async () => {
    const { api, asked } = flaky();
    expect(await api.streets(BOX)).toEqual({ elements: [] });
    expect(asked).toHaveLength(A.OVERPASS_URLS.length);
  });

  it("returns null when every server fails", async () => {
    const { api } = fake(() => Promise.reject(new TypeError("fetch failed")));
    expect(await api.streets(BOX)).toBeNull();
    expect(api.lastError!.error).toBe("can't connect");
  });

  it("asks for way names and lean nodes", () => {
    const q = A.overpassQuery(BOX);
    expect(q).toContain("out body;");
    expect(q).toContain("out skel qt;");
    expect(q).toContain("(1,2,3,4)");
  });

  it("starts at the requested server", async () => {
    const { api, asked } = flaky();
    await api.streets(BOX, 1);
    expect(asked[0]!.startsWith(A.OVERPASS_URLS[1]!)).toBe(true);
  });

  it("counts a runtime error remark as a failure", async () => {
    let n = 0;
    const { api } = fake(() => (n++ === 0 ? json({ elements: [], remark: 'runtime error: Query timed out in "query"' }) : json({ elements: [{ type: "node", id: 1, lat: 1, lon: 2 }] })));
    const data = await api.streets(BOX);
    expect(n).toBe(2);
    expect(data!.elements).toHaveLength(1);
    expect(api.lastError!.error).toContain("Query timed out");
    expect(api.lastError!.host).toBe(A.hostOf(A.OVERPASS_URLS[0]!));
  });

  it("waits longer than Overpass itself allows", () => {
    expect(A.OVERPASS_TIMEOUT_S).toBeGreaterThan(25);
  });

  it("rests failing servers and tries them last", async () => {
    const { api, asked } = flaky();
    await api.streets(BOX);
    asked.length = 0;
    await api.streets(BOX);
    expect(asked[0]!.startsWith(A.OVERPASS_URLS.at(-1)!)).toBe(true);
    expect(asked).toHaveLength(1);
  });

  it("counts successes and failures per server", async () => {
    const { api } = flaky();
    await api.streets(BOX);
    expect(api.serverStats.get(A.hostOf(A.OVERPASS_URLS[0]!))).toMatchObject({ ok: 0, fail: 1, last_error: "HTTP 504 (server timed out)" });
    expect(api.serverStats.get(A.hostOf(A.OVERPASS_URLS.at(-1)!))!.ok).toBe(1);
  });
});

describe("failures", () => {
  it("are described in plain words", () => {
    expect(A.describeFailure(429)).toBe("HTTP 429 (server busy)");
    expect(A.describeFailure(504)).toBe("HTTP 504 (server timed out)");
    expect(A.describeFailure(new DOMException("t", "TimeoutError"))).toBe("no answer in time");
    expect(A.describeFailure(new TypeError("x"))).toBe("can't connect");
  });

  it("know the host of a url", () => {
    expect(A.hostOf("https://overpass-api.de/api/interpreter?data=x")).toBe("overpass-api.de");
  });

  it("are told to the problem log", async () => {
    const { api } = fake(() => new Response("", { status: 503 }));
    const seen: string[] = [];
    api.onProblem = (t) => seen.push(t);
    await api.getBytes("https://example.org/x");
    expect(seen).toEqual(["Request to example.org failed: HTTP 503 (server overloaded)"]);
  });

  it("say when JSON is broken", async () => {
    const { api } = fake(() => new Response("{nope"));
    expect(await api.getJson("https://example.org/x")).toBeNull();
    expect(api.lastError!.error).toBe("answer was not valid JSON");
  });
});

describe("street tiles", () => {
  const TILEJSON = { tiles: ["https://tiles.openfreemap.org/planet/v1/{z}/{x}/{y}.pbf"] };
  const tiles = (opts: { gzip?: boolean; down?: boolean } = {}) =>
    fake((url) => {
      if (opts.down) return new Response("", { status: 503 });
      if (url === A.OFM_TILEJSON) return json(TILEJSON);
      return new Response(opts.gzip ? gzipSync(pbf()) : pbf());
    });

  it("come from OpenFreeMap, reading the TileJSON once", async () => {
    const { api, asked } = tiles();
    const cell = await api.streetTile({ x: 9253, y: 6039 });
    expect(cell!.ids.length).toBeGreaterThan(1000);
    expect(asked).toEqual([A.OFM_TILEJSON, "https://tiles.openfreemap.org/planet/v1/14/9253/6039.pbf"]);
    await api.streetTile({ x: 9253, y: 6040 });
    expect(asked).toHaveLength(3);
  });

  it("unzip gzipped answers", async () => {
    const { api } = tiles({ gzip: true });
    expect((await api.streetTile({ x: 9253, y: 6039 }))!.ids.length).toBeGreaterThan(1000);
  });

  it("rest the tile server after a failure", async () => {
    const { api, tick } = tiles({ down: true });
    expect(await api.streetTile({ x: 9253, y: 6039 })).toBeNull();
    expect(api.tilesResting()).toBe(true);
    expect(api.serverStats.get(A.hostOf(A.OFM_TILEJSON))!.fail).toBe(1);
    tick(A.REST_MS + 1);
    expect(api.tilesResting()).toBe(false);
  });
});

describe("search", () => {
  const PHOTON = {
    features: [
      { geometry: { coordinates: [23.32, 42.69] }, properties: { name: "Sofia", state: "Sofia City", country: "Bulgaria", extent: [23.2, 42.8, 23.5, 42.6] } },
      { geometry: { coordinates: [1] }, properties: { name: "Broken" } },
    ],
  };

  it("reads Photon answers", () => {
    expect(A.photonPlaces(PHOTON)).toEqual([{ name: "Sofia, Sofia City, Bulgaria", lat: 42.69, lon: 23.32, bbox: [42.6, 23.2, 42.8, 23.5] }]);
    expect(A.photonPlaces({})).toBeNull();
  });

  it("reads Nominatim answers", () => {
    expect(A.nominatimPlaces([{ display_name: "Sofia, Bulgaria", lat: "42.69", lon: "23.32", boundingbox: ["42.6", "42.8", "23.2", "23.5"] }])).toEqual([
      { name: "Sofia, Bulgaria", lat: 42.69, lon: 23.32, bbox: [42.6, 23.2, 42.8, 23.5] },
    ]);
    expect(A.nominatimPlaces({})).toBeNull();
  });

  it("falls back to Nominatim and caches answers", async () => {
    const { api, asked } = fake((url) => (url.startsWith(A.PHOTON_URL) ? new Response("", { status: 502 }) : json([{ display_name: "Sofia", lat: "1", lon: "2" }])));
    expect(await api.searchPlaces(" Sofia ")).toEqual([{ name: "Sofia", lat: 1, lon: 2, bbox: null }]);
    expect(asked).toHaveLength(2);
    await api.searchPlaces("sofia");
    expect(asked).toHaveLength(2);
  });
});

describe("routes and outlines", () => {
  it("build an OSRM url lon first", () => {
    expect(A.osrmUrl([42.1, 23.2], [43.1, 24.2])).toBe(`${A.OSRM_URL}23.20000,42.10000;24.20000,43.10000?overview=simplified&geometries=geojson`);
  });

  it("thin long routes and keep the end", () => {
    const coords = Array.from({ length: 1000 }, (_, i) => [i, 1000 - i]);
    const path = A.osrmPath({ code: "Ok", routes: [{ geometry: { coordinates: coords } }] });
    expect(path.length).toBeLessThanOrEqual(A.MAX_ROUTE_POINTS + 1);
    expect(path[0]).toEqual([1000, 0]);
    expect(path.at(-1)).toEqual([1, 999]);
    expect(A.osrmPath({ code: "NoRoute" })).toEqual([]);
  });

  it("read outline rings lat first", () => {
    expect(A.outlineRings({ geojson: { type: "Polygon", coordinates: [[[23, 42], [24, 42], [24, 43]]] } })).toEqual([[[42, 23], [42, 24], [43, 24]]]);
    expect(A.outlineRings({ geojson: { type: "MultiPolygon", coordinates: [[[[1, 2]]], [[[3, 4]]]] } })).toEqual([[[2, 1]], [[4, 3]]]);
    expect(A.outlineRings({})).toEqual([]);
  });

  it("read city facts rows", async () => {
    const { api } = fake(() => json({ results: { bindings: [{ cityLabel: { value: "Sofia" } }] } }));
    expect(await api.cityFacts(42, 23)).toEqual([{ cityLabel: { value: "Sofia" } }]);
  });
});
