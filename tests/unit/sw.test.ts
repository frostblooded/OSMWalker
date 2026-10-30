import { describe, expect, it } from "vitest";
import { APP_ASSETS_MAX, MAP_CACHE_MAX, overflow, replaced, strategyFor } from "../../src/sw/strategy";

const here = "https://frostblooded.github.io/OSMWalker/";
const s = (url: string, mode: RequestMode = "cors") => strategyFor(new URL(url, here), here, mode);

describe("service worker strategy", () => {
  it("fetches the page fresh but falls back to the cache offline", () => {
    expect(s(here, "navigate")).toEqual({ kind: "network-first", cache: "app" });
    expect(s(`${here}index.html`)).toEqual({ kind: "network-first", cache: "app" });
  });

  it("serves hashed build files from the cache", () => {
    expect(s(`${here}assets/index-abc123.js`)).toEqual({ kind: "cache-first", cache: "app" });
  });

  it("refreshes game data in the background", () => {
    expect(s(`${here}data/actions.json`)).toEqual({ kind: "stale-while-revalidate", cache: "app" });
  });

  it("serves a data file with a version in its address from the cache", () => {
    expect(s(`${here}data/help.txt?v=1a2b3c4d`)).toEqual({ kind: "cache-first", cache: "app" });
  });

  it("drops older versions of a data file when a new one is stored", () => {
    const keys = [`${here}data/help.txt?v=old1`, `${here}data/help.txt?v=new2`, `${here}data/actions.json`, `${here}data/help.txt`];
    expect(replaced(keys, `${here}data/help.txt?v=new2`)).toEqual([`${here}data/help.txt?v=old1`, `${here}data/help.txt`]);
    expect(replaced(keys, `${here}data/actions.json`)).toEqual([]);
  });

  it("keeps map tiles, which never change at a versioned address", () => {
    expect(s("https://tiles.openfreemap.org/planet/20251022_001001_pt/14/9253/6039.pbf")).toEqual({ kind: "cache-first", cache: "map" });
    expect(s("https://tiles.openfreemap.org/styles/liberty")).toEqual({ kind: "stale-while-revalidate", cache: "map" });
    expect(s("https://tiles.openfreemap.org/fonts/Noto%20Sans%20Bold/0-255.pbf")).toEqual({ kind: "cache-first", cache: "map" });
    expect(s("https://tiles.openfreemap.org/planet")).toEqual({ kind: "stale-while-revalidate", cache: "map" });
    expect(MAP_CACHE_MAX).toBeGreaterThan(500);
  });

  it("leaves live services alone", () => {
    for (const u of ["https://photon.komoot.io/api/?q=x", "https://overpass-api.de/api/interpreter", "https://query.wikidata.org/sparql?q=1", "https://router.project-osrm.org/route/v1/x"]) expect(s(u)).toBeNull();
  });

  it("leaves the save and other origins' pages alone", () => {
    expect(s(`${here}sw.js`)).toBeNull();
    expect(s("https://example.com/", "navigate")).toBeNull();
  });

  it("drops the oldest build files past the cap, never the page or game data", () => {
    const assets = Array.from({ length: APP_ASSETS_MAX + 5 }, (_, i) => `${here}assets/chunk-${i}.js`);
    const keys = [here, `${here}data/actions.json`, ...assets];
    expect(overflow(keys, APP_ASSETS_MAX, (u) => u.startsWith(`${here}assets/`))).toEqual(assets.slice(0, 5));
    expect(overflow(assets.slice(0, 3), APP_ASSETS_MAX, () => true)).toEqual([]);
    expect(APP_ASSETS_MAX).toBeGreaterThan(40);
  });
});
