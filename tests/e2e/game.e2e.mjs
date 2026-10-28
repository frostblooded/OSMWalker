// Browser e2e: plays the exported web build with touch taps and a mocked OSM backend.
// Usage: node tests/e2e/game.e2e.mjs <url> [screenshot-dir]
// E2E_CHANNEL=chrome uses the runner's installed Chrome instead of Playwright's Chromium.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:8080/index.html";
const shots = process.argv[3] ?? "e2e-screenshots";
mkdirSync(shots, { recursive: true });

// 5x5 street grid around (42.0, 23.0), ~110 m blocks, all named.
function overpassGrid() {
  const elements = [];
  const id = (r, c) => 1 + r * 5 + c;
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++)
      elements.push({ type: "node", id: id(r, c), lat: 41.998 + r * 0.001, lon: 22.9973 + c * 0.00135 });
  for (let r = 0; r < 5; r++)
    elements.push({ type: "way", id: 100 + r, nodes: [0, 1, 2, 3, 4].map((c) => id(r, c)), tags: { highway: "residential", name: `Row ${r} Street` } });
  for (let c = 0; c < 5; c++)
    elements.push({ type: "way", id: 200 + c, nodes: [0, 1, 2, 3, 4].map((r) => id(r, c)), tags: { highway: "residential", name: `Column ${c} Avenue` } });
  return { elements };
}
// A real OpenFreeMap street tile from Sofia, served for every tile asked for.
const OFM_TILE = readFileSync(new URL("../fixtures/ofm/14_9253_6039.pbf", import.meta.url));
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==", "base64");
const cors = { "Access-Control-Allow-Origin": "*" };

const browser = await chromium.launch({
  channel: process.env.E2E_CHANNEL || undefined,
  executablePath: process.env.E2E_EXECUTABLE || undefined,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const requests = { search: 0, nominatim: 0, streets: 0, streetTiles: 0, tiles: 0, wikidata: 0 };
// Photon: the search-as-you-type server.
await context.route(/photon\.komoot\.io/, (r) => {
  requests.search++;
  const props = { name: "Testville", country: "Nowhere", osm_key: "place", osm_value: "town", extent: [22.99, 42.01, 23.01, 41.99] };
  r.fulfill({ json: { features: [{ geometry: { type: "Point", coordinates: [23.0, 42.0] }, properties: props }] }, headers: cors });
});
// Nominatim: only the backup when Photon fails.
await context.route(/nominatim\.openstreetmap\.org/, (r) => {
  requests.nominatim++;
  r.fulfill({ json: [], headers: cors });
});
// Every Overpass mirror the game may spread downloads over.
await context.route(/overpass-api\.de|overpass\.private\.coffee|maps\.mail\.ru/, (r) => {
  requests.streets++;
  r.fulfill({ json: overpassGrid(), headers: cors });
});
// OpenFreeMap: the TileJSON, then vector tiles with the streets.
await context.route(/tiles\.openfreemap\.org/, (r) => {
  if (r.request().url().endsWith("/planet")) {
    r.fulfill({ json: { tiles: ["https://tiles.openfreemap.org/planet/test/{z}/{x}/{y}.pbf"] }, headers: cors });
    return;
  }
  requests.streetTiles++;
  r.fulfill({ body: OFM_TILE, contentType: "application/x-protobuf", headers: cors });
});
// Wikidata SPARQL: city trivia for random spots.
await context.route(/query\.wikidata\.org/, (r) => {
  requests.wikidata++;
  const row = { cityLabel: { value: "Testville" }, capLabel: { value: "Nowhere" }, pop: { value: "12345" } };
  r.fulfill({ json: { head: { vars: [] }, results: { bindings: [row] } }, headers: cors });
});
await context.route(/tile\.openstreetmap\.org/, (r) => {
  requests.tiles++;
  r.fulfill({ body: PNG_1PX, contentType: "image/png", headers: cors });
});

const page = await context.newPage();
const errors = [];
page.on("console", (m) => {
  const t = m.text();
  if (/SCRIPT ERROR|Parse Error|^ERROR:/.test(t)) errors.push(t);
});
page.on("pageerror", (e) => errors.push(e.message));

const state = () => page.evaluate(() => window.osmwalkerState ?? null);
async function until(pred, what, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const s = await state();
    if (s && pred(s)) return s;
    await page.waitForTimeout(100);
  }
  await page.screenshot({ path: `${shots}/timeout.png` });
  throw new Error(`Timed out waiting for ${what}. Last state: ${JSON.stringify(await state())}`);
}
async function tap(name) {
  const s = await until((s) => s.rects[name], `${name} on screen`);
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  const [x, y, w, h] = s.rects[name].map((v) => v / dpr);
  await page.touchscreen.tap(x + w / 2, y + h / 2);
  return { w, h };
}

let step = "load";
try {
  await page.goto(url);
  await until((s) => s.screen === "picker", "city picker");
  await page.screenshot({ path: `${shots}/1-picker.png` });
  assert.deepEqual((await state()).overlaps, [], "texts overlap on the picker");

  step = "touch targets";
  const s0 = await state();
  for (const name of ["search_box", "search_button"]) {
    const h = s0.rects[name][3] / (await page.evaluate(() => window.devicePixelRatio));
    assert.ok(h >= 44, `${name} is ${h}px tall, under the 44px touch minimum`);
  }

  step = "search a city";
  await tap("search_box");
  await page.keyboard.type("Testville", { delay: 50 });
  await until((s) => s.rects.result0, "suggestions while typing, without pressing Search");
  assert.equal(requests.search, 1, "one search once typing pauses");
  assert.equal(requests.nominatim, 0, "Nominatim is only a backup");
  await tap("result0");
  const game = await until((s) => s.screen === "game", "game screen");
  assert.equal(game.city, "Testville");
  assert.ok(requests.streetTiles >= 1, "street tiles were requested");
  assert.equal(requests.streets, 0, "Overpass is only a backup");
  await page.screenshot({ path: `${shots}/2-game.png` });

  step = "walks";
  const before = (await state()).total_m;
  await page.waitForTimeout(3000);
  const after = await state();
  assert.ok(after.total_m - before > 5, `walked only ${after.total_m - before} m in 3 s`);
  assert.match(after.street, /along |Stopped on /);
  assert.deepEqual(after.overlaps, [], "texts overlap on the game screen");
  assert.ok(requests.tiles > 0, "map tiles were requested");
  assert.equal(requests.wikidata, 1, "the city was looked up on Wikidata once");
  assert.equal(after.city_facts, 2, "city trivia from Wikidata");

  step = "goal line zooms to his goal";
  await until((s) => /^(Going to|Resting at) /.test(s.goal_line), "goal line in the top panel");
  // His goal can change between looking and tapping, which ends the view, so try a few times.
  for (let i = 0; i < 3 && !(await state()).goal_view; i++) {
    await tap("goal");
    await page.waitForTimeout(300);
  }
  const goalView = await until((s) => s.goal_view && s.rects.back_to_him, "goal view with Back to him");
  assert.equal(goalView.sheet_open, false, "tapping the goal line does not open the stats sheet");
  assert.deepEqual(goalView.overlaps, [], "texts overlap in the goal view");
  await page.screenshot({ path: `${shots}/2b-goal.png` });
  await tap("back_to_him");
  await until((s) => !s.goal_view && !s.rects.back_to_him, "following him again");

  step = "survives reload";
  await page.waitForTimeout(1000);
  const streetsBefore = requests.streets + requests.streetTiles;
  await page.reload();
  // The time spent reloading is caught up too, so he ends up further along.
  const resumed = await until((s) => s.screen === "game" && s.total_m >= after.total_m, "walk resumed after reload");
  assert.equal(resumed.city, "Testville");

  step = "streets come from the cache after reload";
  const moving = (await state()).total_m;
  await until((s) => s.total_m > moving + 3, "walking on cached streets");
  assert.equal(requests.streets + requests.streetTiles, streetsBefore, "no street downloads after reload");

  step = "menu";
  assert.equal((await state()).rects.history, undefined, "History hides in the menu");
  await tap("menu");
  const menu = await until((s) => s.rects.history && s.rects.new_city, "menu open");
  assert.deepEqual(menu.overlaps, [], "texts overlap with the menu open");
  await page.screenshot({ path: `${shots}/2c-menu.png` });

  step = "history panel";
  await tap("history");
  const hist = await until((s) => s.history_open && s.rects.history_panel, "history panel open");
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  const [, py, , ph] = hist.rects.history_panel.map((v) => v / dpr);
  assert.ok(py >= 844 * 0.45 && py + ph <= 845, `history panel sits in the bottom half (y ${py}, h ${ph})`);
  assert.ok(hist.rects.history_close[3] / dpr >= 44, "Close is big enough to tap");
  await page.screenshot({ path: `${shots}/3-history.png` });
  assert.deepEqual((await state()).overlaps, [], "texts overlap with the history open");
  if (hist.history_entries > 0) await tap("history_row0");
  await tap("history_close");
  await until((s) => !s.history_open, "history panel closed");

  step = "help";
  await tap("menu");
  await tap("help");
  const help = await until((s) => s.help_open && s.rects.help_topic0, "help topic list");
  assert.ok(help.rects.help_topic0[3] / dpr >= 44, "Help topics are big enough to tap");
  assert.deepEqual(help.overlaps, [], "texts overlap on the help list");
  await page.screenshot({ path: `${shots}/3a-help.png` });
  await tap("help_topic0");
  const helpPage = await until((s) => s.rects.help_back && s.help_title !== "Help", "help page open");
  assert.deepEqual(helpPage.overlaps, [], "texts overlap on a help page");
  await page.screenshot({ path: `${shots}/3a-help-page.png` });
  await tap("help_back");
  await until((s) => s.help_title === "Help" && s.rects.help_topic0, "back on the help list");
  await tap("help_close");
  await until((s) => !s.help_open, "help closed");

  step = "debug panel";
  await tap("menu");
  await tap("debug");
  const dbg = await until((s) => s.debug_open && s.rects.debug_goal, "debug panel open");
  assert.ok(dbg.rects.debug_goal[3] / dpr >= 44, "New goal is big enough to tap");
  await tap("debug_goal");
  await until((s) => s.debug_picks > dbg.debug_picks, "New goal adds a pick to the debug log");
  await page.screenshot({ path: `${shots}/3b-debug.png` });
  step = "touch scroll follows the finger";
  {
    const s0 = await state();
    const [px, py, pw, ph] = s0.rects.debug_panel.map((v) => v / dpr);
    const x = px + pw / 2, y0 = py + ph - 60, dist = 150;
    const cdp = await context.newCDPSession(page);
    const touch = (type, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
    await touch("touchStart", y0);
    for (let i = 1; i <= 15; i++) {
      await touch("touchMove", y0 - (dist * i) / 15);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(200);
    const s1 = await state();
    await touch("touchEnd", y0 - dist);
    const moved = (s1.debug_scroll - s0.debug_scroll) * s1.canvas_scale / dpr;  // in CSS px
    console.log(`touch scroll: finger ${dist} px, list ${moved.toFixed(1)} px`);
    assert.ok(Math.abs(moved - dist) <= dist * 0.15, `the list moved ${moved.toFixed(1)} CSS px for a ${dist} px drag`);
  }
  assert.deepEqual((await state()).overlaps, [], "texts overlap with the debug panel open");
  await tap("debug_close");
  await until((s) => !s.debug_open, "debug panel closed");

  step = "reset needs RESET";
  await tap("menu");
  await tap("new_city");
  await until((s) => s.confirm_visible, "reset dialog");
  await tap("confirm_box");
  await page.keyboard.type("reset");
  await page.waitForTimeout(300);
  assert.equal((await state()).confirm_enabled, false, "lowercase reset must not unlock");
  for (let i = 0; i < 5; i++) await page.keyboard.press("Backspace");
  await page.keyboard.type("RESET");
  await until((s) => s.confirm_enabled, "Start over unlocked");
  await page.screenshot({ path: `${shots}/4-confirm.png` });
  assert.deepEqual((await state()).overlaps, [], "texts overlap in the reset dialog");
  await tap("confirm_yes");
  await until((s) => s.screen === "picker", "picker after reset");

  assert.deepEqual(errors, [], "no script errors");
  console.log("E2E passed.");
} catch (e) {
  console.error(`E2E failed at step "${step}":`, e.message);
  if (errors.length) console.error("Script errors:\n" + errors.join("\n"));
  await page.screenshot({ path: `${shots}/failure.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
