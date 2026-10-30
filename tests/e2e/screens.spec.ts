// The sheets: Help, Stats, Collection, History and Debug, with fake map services.
import { expect, test, type Page } from "@playwright/test";
import { KEEPSAKES, mockServices, reopenWith } from "./mock";

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

test("Help that couldn't load offers Try again", async ({ page }) => {
  let fail = true;
  await page.route("**/data/help.txt", (route) => (fail ? route.abort() : route.fallback()));
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
  for (const t of ["Level 1", "Saving for", "Bike", "Vitals", "Health", "Attributes", "Strength", "Gear", "Vehicle", "Bag", "Effects"]) await expect(sheet).toContainText(t);
  // He starts with €200, more than a €150 bike plus his €20 reserve.
  await expect(sheet).toContainText("✔ €170 / €170");
  expect(await smallButtons(page)).toEqual([]);
  await sheet.getByRole("button", { name: /Close/ }).click();
  await expect(sheet).toBeHidden();
});

test("Collection shows his cards, Placedex, souvenirs and crawls", async ({ page }) => {
  await startInSofia(page);
  await reopenWith(page, KEEPSAKES);
  await expect(page.locator(".street")).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Collection/ }).click();
  const sheet = page.getByRole("dialog", { name: /Collection/ });
  for (const t of ["Landmark cards", "City cards", "Placedex", "Souvenirs", "Crawls", "1 / 6 done"]) await expect(sheet).toContainText(t);
  await sheet.getByRole("button", { name: /Countries/ }).click();
  await expect(sheet).toContainText("bottle of rose oil");
  await sheet.getByRole("button", { name: /Today/ }).click();
  await expect(sheet).toContainText("Coffee crawl");
  await expect(sheet).toContainText("✔ Done");
  await sheet.getByRole("button", { name: /His cards/ }).click();
  await expect(sheet.locator(".lcard.gold")).toContainText("Alexander Nevsky Cathedral");
  expect(await smallButtons(page)).toEqual([]);
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
