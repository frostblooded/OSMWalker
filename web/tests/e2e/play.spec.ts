// Player flows in the browser, with fake map services.
import { expect, test } from "@playwright/test";
import { mockServices } from "./mock";

test.beforeEach(async ({ context }) => {
  await mockServices(context);
});

async function startInSofia(page: import("@playwright/test").Page) {
  await page.goto("./");
  await page.getByLabel("City name").fill("Sofia");
  await page.getByRole("button", { name: /Sofia/ }).click();
  await expect(page.locator(".street")).toBeVisible({ timeout: 20000 });
}

test("picks a city and walks its streets", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await startInSofia(page);
  await expect(page.locator(".city")).toContainText("Sofia, Bulgaria");
  await expect(page.locator(".marker.him")).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect(page.locator(".chip")).toContainText(/Going to|Heading to/, { timeout: 10000 });
  await page.screenshot({ path: "test-results/game.png" });
  expect(errors).toEqual([]);
});

test("picks up where he was after a reload", async ({ page }) => {
  await startInSofia(page);
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.locator(".city")).toContainText("Sofia, Bulgaria", { timeout: 20000 });
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
