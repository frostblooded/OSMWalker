// Player flows in the browser, with fake map services.
import { expect, test } from "@playwright/test";
import { mockServices, reopenAfter, reopenDeparting } from "./mock";

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
  await expect(page.locator(".hud .city")).toContainText("Sofia");
  await expect(page.locator(".marker.him")).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect(page.locator(".chip")).toContainText(/Going to|Heading to/, { timeout: 10000 });
  await page.screenshot({ path: "test-results/game.png" });
  expect(errors).toEqual([]);
});

test("picks up where he was after a reload", async ({ page }) => {
  await startInSofia(page);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("osmwalker.save"))).not.toBeNull();
  await page.reload();
  await expect(page.locator(".hud .city")).toContainText("Sofia", { timeout: 20000 });
});

test("sums up what he did while the game was closed", async ({ page }) => {
  await startInSofia(page);
  await reopenAfter(page, 3);
  const away = page.getByRole("dialog", { name: /While you were away/ });
  await expect(away).toBeVisible({ timeout: 20000 });
  await expect(away).toContainText("Lived through");
  await expect(away).toContainText("3 h");
  await away.getByRole("button", { name: /events, newest first/ }).click();
  await expect(away.locator(".away-log li").first()).toBeVisible();
  await away.getByRole("button", { name: "Carry on" }).click();
  await expect(away).toBeHidden();
  // He may have taken a trip while away, so only check that he is somewhere and walking on.
  await expect(page.locator(".hud .city")).toContainText(/\S/);
  await expect(page.locator(".marker.him")).toBeVisible();
});

test("a reopen earns a clover that sends him a care package", async ({ page }) => {
  await startInSofia(page);
  await reopenAfter(page, 3);
  const away = page.getByRole("dialog", { name: /While you were away/ });
  await expect(away).toContainText("Clover for checking in", { timeout: 20000 });
  await away.getByRole("button", { name: "Carry on" }).click();
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Care package/ }).click();
  const care = page.getByRole("dialog", { name: /Care package/ });
  await expect(care.getByRole("button", { name: /Send City guide/ })).toBeDisabled();
  await care.getByRole("button", { name: /Send Snack/ }).click();
  await expect(care).toContainText("Opens at his next stop");
  await expect(care.getByRole("button", { name: /Send Coffee/ })).toBeDisabled();
});

test("while he walks to a station you can guess where he is going, once", async ({ page }) => {
  await startInSofia(page);
  await reopenDeparting(page);
  const guess = page.getByRole("group", { name: "Guess where he is going" });
  await expect(guess).toContainText("Where to?", { timeout: 20000 });
  await guess.getByRole("button", { name: "Plovdiv" }).click();
  await expect(page.locator(".hud")).toContainText("Your guess: Plovdiv");
  await expect(guess).toBeHidden();
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
