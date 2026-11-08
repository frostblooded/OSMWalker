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

test("picks a city, then a place from the cards, and walks there", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await startInSofia(page);
  await expect(page.locator(".hud .city")).toContainText("Sofia");
  await expect(page.locator(".marker.him")).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect(page.locator(".hud")).toContainText("He waits for you to pick where next", { timeout: 10000 });
  await page.getByRole("button", { name: /Where next/ }).click();
  const sheet = page.getByRole("dialog", { name: /Where next/ });
  const cards = sheet.locator("button.offer");
  await expect(cards).toHaveCount(3);
  // Each card says what it gives and how far it is.
  for (const t of await cards.allTextContents()) expect(t).toMatch(/(💶 €[\d.]+|⭐ \d+ XP).*\d+(\.\d)? k?m · (~\d+ min|<1 min)/);
  const name = (await cards.first().locator(".offer-name").textContent())!.replace(/🆕 New/, "").trim();
  await cards.first().click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("button", { name: /Where next/ })).toBeHidden();
  await expect(page.locator(".chip")).toContainText(`Going to ${name.replace(/^\S+ /, "")}`, { timeout: 10000 });
  await page.screenshot({ path: "test-results/game.png" });
  expect(errors).toEqual([]);
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

test("the top card shows his money and level", async ({ page }) => {
  await startInSofia(page);
  await expect(page.locator(".pill.coins")).toHaveText("€0");
  await expect(page.locator(".pill.level")).toHaveText("Lv 1");
});
