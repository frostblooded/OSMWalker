// The service worker: a returning player can open the game with no network.
import { expect, test } from "@playwright/test";
import { mockServices } from "./mock";

test.use({ serviceWorkers: "allow" });

test("opens offline after one visit, where he was", async ({ context, page }) => {
  await mockServices(context);
  await page.goto("./");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.getByLabel("City name").fill("Sofia");
  await page.getByRole("button", { name: /Sofia/ }).click();
  await expect(page.locator(".street")).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(1500); // a save, and the map's first tiles
  // Every file of the app the page has loaded so far is in the service worker's cache.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const own = performance
            .getEntriesByType("resource")
            .map((e) => e.name)
            .filter((u) => u.startsWith(location.origin) && u.includes("/assets/"));
          const missing = [];
          for (const u of own) if (!(await caches.match(u, { ignoreVary: true }))) missing.push(u);
          return missing;
        }),
      { timeout: 10000 },
    )
    .toEqual([]);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".hud .city")).toContainText("Sofia", { timeout: 20000 });
  await expect(page.locator(".marker.him")).toBeVisible();
});
