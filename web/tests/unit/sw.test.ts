import { describe, expect, it } from "vitest";
import { MAP_CACHE_MAX, strategyFor } from "../../src/sw/strategy";

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
});
