// The sheets: Help, Stats, Collection, History and Debug, with fake map services.
import { expect, test, type Page } from "@playwright/test";
import { KEEPSAKES, mockServices, reopenAfter, reopenWith } from "./mock";

test.beforeEach(async ({ context }) => {
  await mockServices(context);
});

async function startInSofia(page: Page) {
  await page.goto("./");
  await page.getByLabel("City name").fill("Sofia");
  await page.getByRole("button", { name: /Sofia/ }).click();
  await expect(page.locator(".street")).toBeVisible({ timeout: 20000 });
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
  await help.getByRole("button", { name: "How he walks" }).click();
  await expect(help).toContainText("5 km/h");
  await expect(help).not.toContainText("{");
  expect(await smallButtons(page)).toEqual([]);
  await help.getByRole("button", { name: "Back" }).click();
  await expect(help.getByRole("button", { name: "Fares" })).toBeVisible();
});

test("The top card shows today's forecast once the game data is in", async ({ page }) => {
  await startInSofia(page);
  const line = page.locator(".hud .forecast");
  await expect(line).toBeVisible();
  await expect(line).not.toContainText("quiet day");
  await expect(line).not.toContainText("{n}");
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
  await expect(help.getByRole("button", { name: "How he walks" })).toBeVisible();
});

test("Help search finds pages by their text and keeps the results after Back", async ({ page }) => {
  await startInSofia(page);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Help/ }).click();
  const help = page.getByRole("dialog", { name: /Help/ });
  const box = help.getByRole("searchbox", { name: "Search Help" });
  await box.fill("hospital");
  const results = help.getByRole("region", { name: /Results/ });
  await expect(results.locator("mark").first()).toHaveText(/hospital/i);
  await expect(help.getByRole("button", { name: "Fares" })).toBeHidden();
  expect(await smallButtons(page)).toEqual([]);
  await results.getByRole("button", { name: /^Health/ }).click();
  await expect(help.locator(".page-title")).toHaveText("Health");
  await help.getByRole("button", { name: "Back" }).click();
  await expect(box).toHaveValue("hospital");
  await box.fill("zzzqqq");
  await expect(help).toContainText("Nothing found");
  await help.getByRole("button", { name: "Clear search" }).click();
  await expect(box).toHaveValue("");
  await expect(help.getByRole("button", { name: "Fares" })).toBeVisible();
});

test("Stats shows his level, meters, attributes and gear", async ({ page }) => {
  await startInSofia(page);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Stats/ }).click();
  const sheet = page.getByRole("dialog", { name: /Stats/ });
  for (const t of ["Level 1", "Saving for", "Bike", "Vitals", "Health", "🔮 Magic", "Spells", "none yet", "Attributes", "Strength", "Gear", "Vehicle", "Bag", "Effects"]) await expect(sheet).toContainText(t);
  // He starts with €200, more than a €150 bike plus his €20 reserve.
  await expect(sheet).toContainText("✔ €170 / €170");
  expect(await smallButtons(page)).toEqual([]);
  await sheet.getByRole("button", { name: /Close/ }).click();
  await expect(sheet).toBeHidden();
});

test("Collection shows his cards, places, world, gear and badges in tabs", async ({ page }) => {
  await startInSofia(page);
  await reopenWith(page, `${KEEPSAKES} d.stats.keepsakes.title = "Globetrotter";`);
  await expect(page.locator(".street")).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Collection/ }).click();
  const sheet = page.getByRole("dialog", { name: /Collection/ });
  for (const t of ["Completion", "Globetrotter", "Landmark cards", "City cards"]) await expect(sheet).toContainText(t);
  await expect(sheet.locator(".dex-tile.gold")).toContainText("Alexander Nevsky Cathedral");
  // No word on a tile is split across lines.
  const split = await sheet.locator(".dex-tile .small").evaluateAll((spans) =>
    spans.flatMap((el) => {
      const text = el.firstChild!;
      const words: string[] = [];
      for (const m of (text.textContent ?? "").matchAll(/\S+/g)) {
        const r = document.createRange();
        r.setStart(text, m.index!);
        r.setEnd(text, m.index! + m[0].length);
        if (r.getClientRects().length > 1) words.push(m[0]);
      }
      return words;
    }),
  );
  expect(split).toEqual([]);
  await sheet.getByRole("tab", { name: /Places/ }).click();
  for (const t of ["Placedex", "Crawls", "Coffee crawl"]) await expect(sheet).toContainText(t);
  await sheet.getByRole("tab", { name: /World/ }).click();
  await sheet.getByRole("button", { name: /^All/ }).last().click();
  await expect(sheet).toContainText("bottle of rose oil");
  await sheet.getByRole("button", { name: /Not found yet: Found in France/ }).click();
  await expect(sheet.locator(".dex-pick")).toHaveText("❓ Found in France");
  for (const t of ["Monuments", "🧱 Golden bricks", "Saving for"]) await expect(sheet).toContainText(t);
  await sheet.getByRole("tab", { name: /Gear/ }).click();
  for (const t of ["Item bases", "Materials", "Vehicles"]) await expect(sheet).toContainText(t);
  await sheet.getByRole("tab", { name: /Feats/ }).click();
  for (const t of ["Passport stamps", "Builder", "His life", "Set out from Sofia"]) await expect(sheet).toContainText(t);
  expect(await smallButtons(page)).toEqual([]);
  await sheet.getByRole("button", { name: /Close/ }).click();
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Stats/ }).click();
  await expect(page.getByRole("dialog", { name: /Stats/ })).toContainText("🎖 TitleGlobetrotter");
});

test("Suggest a line opens a pre-filled GitHub issue", async ({ page }) => {
  await startInSofia(page);
  await page.getByRole("button", { name: "Menu" }).click();
  const link = page.getByRole("link", { name: /Suggest a line/ });
  await expect(link).toHaveAttribute("href", /^https:\/\/github\.com\/frostblooded\/OSMWalker\/issues\/new\?title=Line.*Your%20name%20for%20the%20credit/);
  await expect(link).toHaveAttribute("target", "_blank");
});

test("Stats tells a bought item's story", async ({ page }) => {
  await startInSofia(page);
  await reopenWith(page, KEEPSAKES);
  await expect(page.locator(".street")).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Stats/ }).click();
  const sheet = page.getByRole("dialog", { name: /Stats/ });
  await sheet.getByRole("button", { name: /Lucky Cap/ }).click();
  for (const t of ["🛒 Bought", "Sofia", "🌍 Countries", "3: BGR, FRA, ITA", "42 km", "💎 Treasured", "he won't sell it"]) await expect(sheet).toContainText(t);
  expect(await smallButtons(page)).toEqual([]);
});

test("History lists what he did and shows it on the map", async ({ page }) => {
  await startInSofia(page);
  // The test tiles have no places of note, so a Debug trip makes the first event.
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Debug/ }).click();
  await page.getByRole("button", { name: /New city/ }).click();
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
  for (const t of ["City", "Loaded", "Street squares", "Trip dice", "Problems", "Goal picks"]) await expect(sheet).toContainText(t);
  await sheet.getByRole("button", { name: /Goal picks/ }).click();
  expect(await smallButtons(page)).toEqual([]);
  await sheet.getByRole("button", { name: /New goal/ }).click();
  await expect(sheet).toBeHidden();
});

test("Only zoom and the menu sit on the map", async ({ page }) => {
  await startInSofia(page);
  const onMap = await page.locator(".game > button, .game > .zoom > button").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? e.textContent?.trim()));
  expect(onMap.sort()).toEqual(["Menu", "Zoom in", "Zoom out"]);
  await expect(page.locator(".chip .eta")).toContainText(/~\d+ min|<1 min/, { timeout: 20000 });
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

test("His face shows on the map, with his need or his goal over his head", async ({ page }) => {
  await startInSofia(page);
  await expect(page.locator(".marker.him .face")).toHaveText(/^(🤒|😩|😖|😞|😄|🙂)$/u);
  // Hungry, he wants food over everything. The save is edited as the page loads, after the old page saved on leaving.
  await expect.poll(() => page.evaluate(() => localStorage.getItem("osmwalker.save"))).not.toBeNull();
  await page.addInitScript(() => {
    if (sessionStorage.getItem("hungry")) return;
    sessionStorage.setItem("hungry", "1");
    const d = JSON.parse(localStorage.getItem("osmwalker.save")!);
    d.stats.meters.fullness = 5;
    localStorage.setItem("osmwalker.save", JSON.stringify(d));
  });
  await page.reload();
  await expect(page.locator(".marker.him .bubble")).toHaveText("🍔", { timeout: 20000 });
});

test("City sound is off at first, and the switch is remembered", async ({ page }) => {
  await startInSofia(page);
  await page.getByRole("button", { name: "Menu" }).click();
  const sw = page.getByRole("switch", { name: /City sound/ });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(page.locator(".street")).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("switch", { name: /City sound/ })).toHaveAttribute("aria-checked", "true");
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

test("A city gets its made-up places, saved, and the game's icons load for the map", async ({ page }) => {
  const icons = page.waitForResponse(/\/icons-[\w-]+\.js$/, { timeout: 30000 });
  await startInSofia(page);
  await expect
    .poll(() => page.evaluate(() => Object.values(JSON.parse(localStorage.getItem("osmwalker.save") ?? "{}").made_places ?? {}).flat().length), { timeout: 30000 })
    .toBeGreaterThan(0);
  expect((await icons).ok()).toBe(true);
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
  await page.getByRole("button", { name: /Stats/ }).click();
  const stats = page.getByRole("dialog", { name: /Stats/ });
  const screen = page.viewportSize()!.height;
  await dragTitle(page, /Stats/, screen * 0.5);
  await expect.poll(async () => (await stats.boundingBox())!.height).toBeLessThan(screen * 0.55);
  const hud = (await page.locator(".hud").boundingBox())!;
  expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x!, y!)?.closest(".hud"), [hud.x + hud.width / 2, hud.y + 20])).toBe(true);
});

test("History fits the map to the room left above its sheet after a drag", async ({ page }) => {
  await startInSofia(page);
  // Hours away fill History, so its sheet is tall enough to drag down without closing.
  await reopenAfter(page, 8);
  await page.getByRole("button", { name: "Carry on" }).click({ timeout: 20000 });
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /History/ }).click();
  const sheet = page.getByRole("dialog", { name: /History/ });
  await expect.poll(async () => (await sheet.boundingBox())?.height ?? 0, { timeout: 10000 }).toBeGreaterThan(page.viewportSize()!.height * 0.5);
  // He walks a px or so a second; the fit moves him far more. Wait for the fit to end.
  const him = page.locator(".marker.him");
  const y = async () => (await him.boundingBox())!.y;
  let before = -1;
  await expect
    .poll(async () => {
      const last = before;
      await page.waitForTimeout(300);
      before = await y();
      return Math.abs(before - last) < 3;
    }, { timeout: 10000 })
    .toBe(true);
  await dragTitle(page, /History/, 150);
  await expect(sheet).toBeVisible();
  await expect.poll(async () => Math.abs((await y()) - before), { timeout: 5000 }).toBeGreaterThan(20);
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
