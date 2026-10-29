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
  await expect.poll(() => page.evaluate(() => localStorage.getItem("osmwalker.save"))).not.toBeNull();
  // The page and every file of the game it has loaded (code, fonts, data) are in the service worker's cache.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const own = [
            location.href.split("#")[0]!,
            ...performance
              .getEntriesByType("resource")
              .map((e) => e.name)
              .filter((u) => u.startsWith(`${location.origin}/assets/`) || u.startsWith(`${location.origin}/data/`)),
          ];
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
