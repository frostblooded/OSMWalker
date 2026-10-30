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

/** A save change that gives him a gold card, a Placedex kind, a souvenir, a finished crawl and a treasured hat with its story. */
export const KEEPSAKES = `d.stats.keepsakes = {
  cards: [["Nevsky@42.6960,23.3328", { name: "Alexander Nevsky Cathedral", kind: "place_of_worship/christian", city: "Sofia", rarity: "Rare", finish: "gold", t: 1 }]],
  dex: [["place_of_worship/christian", { t: 1, city: "Sofia" }]],
  souvenirs: [["BGR", { name: "bottle of rose oil", country: "Bulgaria", city: "Sofia", t: 1 }]],
  done: [["coffee", 1]], progress: {}, day: "", city: "",
};
d.stats.gear.head = { name: "Lucky Cap", slot: "head", stats: { luck: 1 }, rarity: "Uncommon", price: 2000,
  story: { from: "Sofia", t: 1, countries: ["BGR", "FRA", "ITA"], km: 42 } };`;

/** Reloads with `change` made to the stored save first (once), the way an older or longer game would have it. */
export async function reopenWith(page: Page, change: string) {
  await expect.poll(() => page.evaluate(() => localStorage.getItem("osmwalker.save"))).not.toBeNull();
  await page.addInitScript((body) => {
    if (sessionStorage.getItem("changed-save")) return;
    sessionStorage.setItem("changed-save", "1");
    const d = JSON.parse(localStorage.getItem("osmwalker.save")!);
    new Function("d", body)(d);
    localStorage.setItem("osmwalker.save", JSON.stringify(d));
  }, change);
  await page.reload();
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
