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

test("keeps one Help text, the current one, and opens it offline", async ({ context, page }) => {
  await mockServices(context);
  await page.goto("./");
  await page.evaluate(() => navigator.serviceWorker.ready);
  const find = () => page.evaluate(() => performance.getEntriesByType("resource").find((e) => e.name.includes("/data/help.txt?v="))?.name ?? "");
  await expect.poll(find, { timeout: 10000 }).not.toBe("");
  const url = await find();
  // Wait for the worker's own store of it, so the test's store below is the only one.
  await expect.poll(() => page.evaluate((u) => caches.match(u).then(Boolean), url), { timeout: 10000 }).toBe(true);
  // An older Help from before a deploy is in the cache; storing the current one drops it.
  const old = url.replace(/\?v=.*/, "?v=old");
  await page.evaluate(
    async ([url, old]) => {
      const cache = await caches.open("osmwalker-app-v1");
      await cache.delete(url!);
      await cache.put(old!, new Response("old"));
      (await navigator.serviceWorker.ready).active!.postMessage({ cache: [url] });
    },
    [url, old],
  );
  const keys = () => page.evaluate(async () => (await (await caches.open("osmwalker-app-v1")).keys()).map((k) => k.url).filter((k) => k.includes("help.txt")));
  await expect.poll(keys, { timeout: 10000 }).toEqual([url]);
  await page.getByLabel("City name").fill("Sofia");
  await page.getByRole("button", { name: /Sofia/ }).click();
  await expect(page.locator(".street")).toBeVisible({ timeout: 20000 });
  await context.setOffline(true);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Help/ }).click();
  await expect(page.getByRole("dialog", { name: /Help/ }).getByRole("button", { name: "How he walks" })).toBeVisible();
});
