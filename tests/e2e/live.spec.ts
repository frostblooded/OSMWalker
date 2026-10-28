// The deployed game with the real map services: search a city, walk its streets.
// Runs only after a deploy (LIVE_URL); the other specs mock every service.
import { expect, test } from "@playwright/test";

test.skip(!process.env.LIVE_URL, "only against the deployed site");

test("plays on the live site", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await page.getByLabel("City name").fill("Sofia");
  await page.getByRole("button", { name: /Sofia/ }).first().click({ timeout: 20000 });
  await expect(page.locator(".street")).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".marker.him")).toBeVisible();
  await expect(page.locator(".chip")).toContainText(/Going to|Heading to/, { timeout: 60000 });
  expect(errors).toEqual([]);
});
