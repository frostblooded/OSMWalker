// Player flows in the browser, with fake map services.
import { expect, test } from "@playwright/test";
import { mockServices, orderNow, reopenWith } from "./mock";

test.beforeEach(async ({ context }) => {
  await mockServices(context);
});

async function startInSofia(page: import("@playwright/test").Page) {
  await page.goto("./");
  await page.getByLabel("City name").fill("Sofia");
  await page.getByRole("button", { name: /Sofia/ }).click();
  await expect(page.locator(".street")).toBeVisible({ timeout: 20000 });
}

test("picks a city and rides about until an order comes, then rides to pick it up", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await startInSofia(page);
  await expect(page.locator(".hud .city")).toContainText("Sofia");
  await expect(page.locator(".marker.him")).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect(page.locator(".chip")).toContainText("Riding about, waiting for an order");
  await expect(page.locator(".hud .street")).toContainText("Riding along");
  await orderNow(page);
  // The order says where, how far, how long and the pay.
  await expect(page.locator(".chip .eta")).toContainText(/\d+(\.\d)? k?m · (~\d+ min|<1 min) · 💶 €[\d.]+/);
  await page.screenshot({ path: "test-results/game.png" });
  expect(errors).toEqual([]);
});

test("buys a faster bike in the Shop with his money", async ({ page }) => {
  await startInSofia(page);
  await reopenWith(page, "d.stats.cents = 1000;");
  await expect(page.locator(".pill.coins")).toHaveText("€10");
  await page.getByRole("button", { name: /Shop/ }).click();
  const shop = page.getByRole("dialog", { name: /Shop/ });
  await expect(shop).toContainText("🔒 Opens after10 Bike tune-ups (0 / 10)");
  await shop.getByRole("button", { name: "Buy · €4.50" }).click();
  await expect(page.locator(".pill.coins")).toHaveText("€5.50");
  await expect(shop).toContainText("×1");
  await expect(page.locator(".toast")).toContainText("Bought 🔧 Bike tune-up #1 for €4.50");
});

test("picks up where he was after a reload", async ({ page }) => {
  await startInSofia(page);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("osmwalker.save"))).not.toBeNull();
  await page.reload();
  await expect(page.locator(".hud .city")).toContainText("Sofia", { timeout: 20000 });
});

test("New city asks for RESET first", async ({ page }) => {
  await startInSofia(page);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /New city/ }).click();
  const go = page.getByRole("button", { name: "Start over" });
  await expect(go).toBeDisabled();
  await page.getByLabel("Type RESET").fill("RESET");
  await go.click();
  await expect(page.getByLabel("City name")).toBeVisible();
});

test("says when search can't reach the server", async ({ context, page }) => {
  await context.unrouteAll();
  await mockServices(context, { failSearch: true });
  await page.goto("./");
  await page.getByLabel("City name").fill("Sofia");
  await expect(page.getByRole("status")).toContainText(/Couldn't reach the search server|Nothing found/);
});

test("every tap target is at least 48 px", async ({ page }) => {
  await startInSofia(page);
  const small = await page.$$eval("button", (bs) =>
    bs
      .filter((b) => b.offsetParent !== null && !b.closest(".maplibregl-ctrl"))
      .map((b) => [b.textContent?.trim(), b.getBoundingClientRect().width, b.getBoundingClientRect().height] as const)
      .filter(([, w, h]) => w < 48 || h < 48),
  );
  expect(small).toEqual([]);
});

test("the top card shows his money", async ({ page }) => {
  await startInSofia(page);
  await expect(page.locator(".pill.coins")).toHaveText("€0");
});
