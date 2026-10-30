// Fake map services for the browser tests: city search, a tiny OpenFreeMap
// style, the Sofia street tiles from the fixtures, and empty answers for the rest;
// and a way to reopen the game as if it had been closed for a while.
import { expect, type BrowserContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`../fixtures/ofm/${name}`, import.meta.url)));
export const SOFIA = { name: "Sofia", lat: 42.687, lon: 23.319 };
const TILES = "https://tiles.openfreemap.org/planet/test/{z}/{x}/{y}.pbf";

export const STYLE = {
  version: 8,
  sources: { openmaptiles: { type: "vector", tiles: [TILES], minzoom: 0, maxzoom: 14, attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> <a href="https://www.openmaptiles.org/">© OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' } },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#f2efe9" } },
    { id: "roads", type: "line", source: "openmaptiles", "source-layer": "transportation", paint: { "line-color": "#ffffff", "line-width": 4 } },
    { id: "building-3d", type: "fill-extrusion", source: "openmaptiles", "source-layer": "building", paint: {} },
  ],
};

export type Mock = { asked: string[] };

export async function mockServices(context: BrowserContext, opts: { failSearch?: boolean } = {}): Promise<Mock> {
  const asked: string[] = [];
  await context.route(/^https:\/\/(?!localhost)/, async (route) => {
    const url = route.request().url();
    asked.push(url);
    if (url.startsWith("https://photon.komoot.io/")) {
      if (opts.failSearch) return route.fulfill({ status: 503 });
      return route.fulfill({
        json: { features: [{ geometry: { coordinates: [SOFIA.lon, SOFIA.lat] }, properties: { name: "Sofia", country: "Bulgaria", extent: [23.2, 42.8, 23.5, 42.6] } }] },
      });
    }
    if (url === "https://tiles.openfreemap.org/styles/liberty") return route.fulfill({ json: STYLE });
    if (url === "https://tiles.openfreemap.org/planet") return route.fulfill({ json: { tiles: [TILES] } });
    const tile = url.match(/planet\/test\/14\/(\d+)\/(\d+)\.pbf$/);
    if (tile) {
      const name = `14_${tile[1]}_${tile[2]}.pbf`;
      if (name === "14_9253_6039.pbf" || name === "14_9254_6039.pbf") return route.fulfill({ body: fixture(name), contentType: "application/x-protobuf" });
      return route.fulfill({ body: Buffer.alloc(0), contentType: "application/x-protobuf" });
    }
    if (url.includes("/planet/test/")) return route.fulfill({ body: Buffer.alloc(0) }); // other zooms: nothing to draw
    if (url.startsWith("https://query.wikidata.org/")) return route.fulfill({ json: { results: { bindings: [] } } });
    return route.fulfill({ status: 404 });
  });
  return { asked };
}

/** Reloads as if the game had been closed `hours` ago: the save's time is moved back before the game reads it. */
export async function reopenAfter(page: Page, hours: number) {
  await expect.poll(() => page.evaluate(() => localStorage.getItem("osmwalker.save"))).not.toBeNull();
  await page.addInitScript((ms) => {
    if (sessionStorage.getItem("moved-back")) return;
    sessionStorage.setItem("moved-back", "1");
    const d = JSON.parse(localStorage.getItem("osmwalker.save")!);
    d.saved_at -= ms;
    localStorage.setItem("osmwalker.save", JSON.stringify(d));
  }, hours * 3600_000);
  await page.reload();
}

/** Reloads with him walking to a bus station for a trip to Plovdiv, the "Where to?" guess open. */
export async function reopenDeparting(page: Page) {
  await expect.poll(() => page.evaluate(() => localStorage.getItem("osmwalker.save"))).not.toBeNull();
  await page.addInitScript(() => {
    if (sessionStorage.getItem("departing")) return;
    sessionStorage.setItem("departing", "1");
    const d = JSON.parse(localStorage.getItem("osmwalker.save")!);
    const station = { name: "Central Bus", class: "bus", subclass: "bus_station", rank: 1, lat: 42.69, lon: 23.322 };
    const city = { name: "Plovdiv", code: "BGR", country: "Bulgaria", lat: 42.15, lon: 24.75, pop: 340000 };
    Object.assign(d.walker, { goal: [station.lat, station.lon], goal_node: null, route: [], place: station, rest_m: 0, rest_total_m: 0, rested_m: 0 });
    d.walker.departing = { city, mode: "bus", station, fare: 1248, arrive: [city.lat, city.lon], distance_m: 120000 };
    d.stats.care = { ...d.stats.care, guess: { abroad: false, choices: ["Varna", "Plovdiv", "Burgas"], answer: "Plovdiv", pick: "" } };
    d.saved_at = Date.now();
    localStorage.setItem("osmwalker.save", JSON.stringify(d));
  });
  await page.reload();
}
