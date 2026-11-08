// The sheets: Help, Stats, History and Debug, with fake map services.
import { expect, test, type Page } from "@playwright/test";
import { mockServices, orderNow, reopenWith } from "./mock";

test.beforeEach(async ({ context }) => {
  await mockServices(context);
});

async function startInSofia(page: Page) {
  await page.goto("./");
  await page.getByLabel("City name").fill("Sofia");
  await page.getByRole("button", { name: /Sofia/ }).click();
  await expect(page.locator(".street")).toBeVisible({ timeout: 20000 });
  // The map scene is up (GameScreen marks it), so a sheet opened next reaches it.
  await page.waitForFunction(() => performance.getEntriesByName("osmwalker:map").length > 0);
}

/** Visible buttons smaller than a 48 px tap target. */
const smallButtons = (page: Page) =>
  page.$$eval("button", (bs) =>
    bs
      .filter((b) => b.offsetParent !== null && !b.closest(".maplibregl-ctrl"))
      .map((b) => [b.textContent?.trim(), Math.round(b.getBoundingClientRect().width), Math.round(b.getBoundingClientRect().height)] as const)
      .filter(([, w, h]) => w < 48 || h < 48),
  );

test("Help lists topics and opens a page with the real numbers", async ({ page }) => {
  await startInSofia(page);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Help/ }).click();
  const help = page.getByRole("dialog", { name: /Help/ });
  await help.getByRole("button", { name: "How he rides" }).click();
  await expect(help).toContainText("5 km/h");
  await expect(help).not.toContainText("{");
  expect(await smallButtons(page)).toEqual([]);
  await help.getByRole("button", { name: "Back" }).click();
  await expect(help.getByRole("button", { name: "Money" })).toBeVisible();
});

test("Help that couldn't load offers Try again", async ({ page }) => {
  let fail = true;
  await page.route("**/data/help.txt?*", (route) => (fail ? route.abort() : route.fallback()));
  await startInSofia(page);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Help/ }).click();
  const help = page.getByRole("dialog", { name: /Help/ });
  await expect(help).toContainText("Couldn't load Help");
  fail = false;
  await help.getByRole("button", { name: /Try again/ }).click();
  await expect(help.getByRole("button", { name: "How he rides" })).toBeVisible();
});

test("Help search finds pages by their text and keeps the results after Back", async ({ page }) => {
  await startInSofia(page);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Help/ }).click();
  const help = page.getByRole("dialog", { name: /Help/ });
  const box = help.getByRole("searchbox", { name: "Search Help" });
  await box.fill("battery");
  const results = help.getByRole("region", { name: /Results/ });
  await expect(results.locator("mark").first()).toHaveText(/battery/i);
  await expect(help.getByRole("button", { name: "Money" })).toBeHidden();
  expect(await smallButtons(page)).toEqual([]);
  await results.getByRole("button", { name: /^The map/ }).click();
  await expect(help.locator(".page-title")).toHaveText("The map");
  await help.getByRole("button", { name: "Back" }).click();
  await expect(box).toHaveValue("battery");
  await box.fill("zzzqqq");
  await expect(help).toContainText("Nothing found");
  await help.getByRole("button", { name: "Clear search" }).click();
  await expect(box).toHaveValue("");
  await expect(help.getByRole("button", { name: "Money" })).toBeVisible();
});

test("Stats shows his money, deliveries, places and upgrades", async ({ page }) => {
  await startInSofia(page);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Stats/ }).click();
  const sheet = page.getByRole("dialog", { name: /Stats/ });
  for (const t of ["Money€0", "Deliveries0", "Places visited0", "Bike tune-up×0", "Speed45 km/h"]) await expect(sheet).toContainText(t);
  expect(await smallButtons(page)).toEqual([]);
  await sheet.getByRole("button", { name: /Close/ }).click();
  await expect(sheet).toBeHidden();
});

test("History lists what he did and shows it on the map", async ({ page }) => {
  await startInSofia(page);
  // Setting off is the first event.
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /History/ }).click();
  const sheet = page.getByRole("dialog", { name: /History/ });
  await expect(sheet.locator("li").first()).toBeVisible({ timeout: 10000 });
  await expect(sheet.locator(".num").first()).toHaveText("1");
  expect(await smallButtons(page)).toEqual([]);
  await sheet.locator("li button").first().click();
  await expect(page.getByRole("button", { name: /Back to him/ })).toBeVisible();
});

test("Debug shows the city, problems and buttons that work", async ({ page }) => {
  await startInSofia(page);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Debug/ }).click();
  const sheet = page.getByRole("dialog", { name: /Debug/ });
  for (const t of ["City", "Loaded", "Street squares", "Problems", "Orders"]) await expect(sheet).toContainText(t);
  expect(await smallButtons(page)).toEqual([]);
  await sheet.getByRole("button", { name: /New order/ }).click();
  await expect(sheet).toBeHidden();
  await expect(page.locator(".chip")).toContainText("Picking up at");
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Debug/ }).click();
  await sheet.getByRole("button", { name: /Orders/ }).click();
  await expect(sheet).toContainText(/🛎 Order \(button\): /);
});

test("Only zoom, the menu and the Shop sit on the map", async ({ page }) => {
  await startInSofia(page);
  const onMap = () => page.locator(".game > button, .game > .zoom > button").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? e.textContent?.trim()));
  expect((await onMap()).sort()).toEqual(["Menu", "Zoom in", "Zoom out", "🛒 Shop"]);
  await page.getByRole("button", { name: /Shop/ }).click();
  expect((await onMap()).sort()).toEqual(["Menu", "Zoom in", "Zoom out"]);
});

test("Map credit is a folded ⓘ bottom left that opens on tap", async ({ page }) => {
  await startInSofia(page);
  const credit = page.locator(".maplibregl-ctrl-attrib");
  const text = credit.getByText("OpenStreetMap");
  const info = credit.locator(".maplibregl-ctrl-attrib-button");
  await expect(info).toBeVisible();
  // Folded once the map has loaded, and it stays folded.
  await page.waitForTimeout(1500);
  await expect(text).toBeHidden();
  const box = (await info.boundingBox())!;
  const view = page.viewportSize()!;
  expect(box.width).toBeGreaterThanOrEqual(48);
  expect(box.height).toBeGreaterThanOrEqual(48);
  expect(box.x).toBeLessThan(view.width / 4);
  expect(box.y + box.height).toBeGreaterThan(view.height - 100);
  await info.click();
  await expect(text).toBeVisible();
  await info.click();
  await expect(text).toBeHidden();
});

test("Route switch draws his route and is remembered", async ({ page }) => {
  await startInSofia(page);
  await page.getByRole("button", { name: "Menu" }).click();
  const sw = page.getByRole("switch", { name: /Route to goal/ });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(page.locator(".street")).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("switch", { name: /Route to goal/ })).toHaveAttribute("aria-checked", "true");
});

test("He glides between steps instead of hopping", async ({ page }) => {
  await startInSofia(page);
  const him = page.locator(".marker.him");
  await expect(him).toHaveClass(/glide/);
  await expect.poll(() => him.evaluate((e) => parseFloat(getComputedStyle(e).transitionDuration))).toBeGreaterThan(0);
});

test("His face shows on the map, with the kind of place he heads for over his head", async ({ page }) => {
  await startInSofia(page);
  await expect(page.locator(".marker.him .face")).toHaveText("🙂");
  // The test tiles' only places of note are bridges, which are sights.
  await orderNow(page);
  await expect(page.locator(".marker.him .bubble")).toHaveText("🌉", { timeout: 20000 });
});

/** Drags the map well away from him with a finger (the test phone is touch only). */
async function dragAway(page: Page) {
  // The game loop has started on the map once it sets his glide time.
  await expect.poll(() => page.locator(".marker.him").evaluate((e) => e.style.getPropertyValue("--glide"))).not.toBe("");
  const box = (await page.locator(".map canvas").boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - 15 * i, y: y - 25 * i }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test("Back to him shows after a drag only while the camera follows him", async ({ page }) => {
  // Two drags and a reload: about 28 s on a busy CI runner, so it gets room.
  test.setTimeout(60_000);
  await startInSofia(page);
  const back = page.getByRole("button", { name: /Back to him/ });
  await dragAway(page);
  await expect(back).toBeVisible();
  await back.click();
  await expect(back).toBeHidden();

  await page.getByRole("button", { name: "Menu" }).click();
  const sw = page.getByRole("switch", { name: /Camera follows him/ });
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await page.getByRole("button", { name: "Close" }).click();
  await dragAway(page);
  // The drag has ended once he glides again; the pill would have shown by then.
  await expect(page.locator(".marker.him")).toHaveClass(/glide/);
  await expect(back).toBeHidden();

  await page.reload();
  await expect(page.locator(".street")).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("switch", { name: /Camera follows him/ })).toHaveAttribute("aria-checked", "false");
});

test("City area switch is remembered", async ({ page }) => {
  await startInSofia(page);
  await page.getByRole("button", { name: "Menu" }).click();
  const sw = page.getByRole("switch", { name: /City area/ });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(page.locator(".street")).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("switch", { name: /City area/ })).toHaveAttribute("aria-checked", "true");
});

/** Drags a sheet's title bar by dy px with touch-like pointer moves. */
async function dragTitle(page: Page, name: RegExp, dy: number) {
  const head = page.getByRole("dialog", { name }).locator("header h2");
  const b = (await head.boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(x, y + (dy * i) / 5);
  await page.mouse.up();
}

test("a sheet stays where its title bar is let go, and closes below 30% of the screen", async ({ page }) => {
  await startInSofia(page);
  await page.getByRole("button", { name: "Menu" }).click();
  const menu = page.getByRole("dialog", { name: /Menu/ });
  const screen = page.viewportSize()!.height;
  const height = async () => (await menu.boundingBox())!.height;
  const tall = await height();
  await dragTitle(page, /Menu/, 100);
  await expect.poll(height).toBeLessThan(tall - 90);
  expect(await height()).toBeGreaterThan(tall - 110);
  await expect(menu.getByRole("button", { name: /History/ })).toBeVisible();
  await dragTitle(page, /Menu/, -400);
  expect(Math.abs((await height()) - tall)).toBeLessThan(4);
  await dragTitle(page, /Menu/, tall - screen * 0.28);
  await expect(menu).toBeHidden();
});

test("a full-screen sheet drags down to show the map", async ({ page }) => {
  await startInSofia(page);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Help/ }).click();
  const help = page.getByRole("dialog", { name: /Help/ });
  const screen = page.viewportSize()!.height;
  await dragTitle(page, /Help/, screen * 0.5);
  await expect.poll(async () => (await help.boundingBox())!.height).toBeLessThan(screen * 0.55);
  const hud = (await page.locator(".hud").boundingBox())!;
  expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x!, y!)?.closest(".hud"), [hud.x + hud.width / 2, hud.y + 20])).toBe(true);
});

test("History fits the map to the room left above its sheet after a drag", async ({ page }) => {
  await startInSofia(page);
  // A long History, so its sheet is tall enough to drag down without closing.
  await reopenWith(page, 'for (let i = 0; i < 30; i++) d.stats.history.entries.push({ text: "Found Cafe " + i, t: Math.floor(Date.now() / 1000) - 3600 + i * 60, at: [42.687 + i * 0.0002, 23.319], ti: 0 });');
  await page.getByRole("button", { name: "Menu" }).click();
  // With the camera off his ride is the only other thing that moves him on screen, a few px a second.
  await page.getByRole("switch", { name: /Camera follows him/ }).click();
  await page.getByRole("button", { name: /History/ }).click();
  const sheet = page.getByRole("dialog", { name: /History/ });
  await expect.poll(async () => (await sheet.boundingBox())?.height ?? 0, { timeout: 10000 }).toBeGreaterThan(page.viewportSize()!.height * 0.5);
  // The fit moves him far more than his ride does. Wait for the fit to end.
  const him = page.locator(".marker.him");
  const y = async () => (await him.boundingBox())!.y;
  let before = -1;
  await expect
    .poll(async () => {
      const last = before;
      await page.waitForTimeout(300);
      before = await y();
      return Math.abs(before - last) < 8;
    }, { timeout: 10000 })
    .toBe(true);
  await dragTitle(page, /History/, 150);
  await expect(sheet).toBeVisible();
  await expect.poll(async () => Math.abs((await y()) - before), { timeout: 5000 }).toBeGreaterThan(40);
});

test("the map credit stays under an open sheet's buttons", async ({ page }) => {
  await startInSofia(page);
  await page.getByRole("button", { name: "Menu" }).click();
  const menu = page.getByRole("dialog", { name: /Menu/ });
  await expect(menu).toBeVisible();
  const credit = (await page.locator(".maplibregl-ctrl-attrib").boundingBox())!;
  const top = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest("[role='dialog'], .maplibregl-ctrl")?.className, [credit.x + credit.width / 2, credit.y + credit.height / 2]);
  expect(top).toContain("sheet");
});

test("a sheet keeps its height when a second drag ends where it started", async ({ page }) => {
  await startInSofia(page);
  await page.getByRole("button", { name: "Menu" }).click();
  const menu = page.getByRole("dialog", { name: /Menu/ });
  const height = async () => (await menu.boundingBox())!.height;
  const tall = await height();
  await dragTitle(page, /Menu/, 120);
  await expect.poll(height).toBeLessThan(tall - 100);
  const kept = await height();
  const b = (await menu.locator("header h2").boundingBox())!;
  await page.mouse.move(b.x + 10, b.y + 10);
  await page.mouse.down();
  await page.mouse.move(b.x + 10, b.y + 40);
  await page.mouse.move(b.x + 10, b.y + 10);
  await page.mouse.up();
  expect(Math.abs((await height()) - kept)).toBeLessThan(2);
});

test("a short sheet stays open after a tiny or upward drag", async ({ page }) => {
  await startInSofia(page);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /History/ }).click();
  const sheet = page.getByRole("dialog", { name: /History/ });
  expect((await sheet.boundingBox())!.height).toBeLessThan(page.viewportSize()!.height * 0.3);
  await dragTitle(page, /History/, 3);
  await expect(sheet).toBeVisible();
  await dragTitle(page, /History/, -40);
  await expect(sheet).toBeVisible();
  await dragTitle(page, /History/, 40);
  await expect(sheet).toBeHidden();
});
