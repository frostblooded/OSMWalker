// The sheets: Help, Stats, History and Debug, with fake map services.
import { expect, test, type Page } from "@playwright/test";
import { mockServices } from "./mock";

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

test("Stats shows his level, meters, attributes and gear", async ({ page }) => {
  await startInSofia(page);
  await page.getByRole("button", { name: "Stats" }).click();
  const sheet = page.getByRole("dialog", { name: /Stats/ });
  for (const t of ["Level 1", "Vitals", "Health", "Attributes", "Strength", "Gear", "Vehicle", "Bag", "Effects"]) await expect(sheet).toContainText(t);
  expect(await smallButtons(page)).toEqual([]);
  await sheet.getByRole("button", { name: /Close/ }).click();
  await expect(sheet).toBeHidden();
});

test("History lists what he did and shows it on the map", async ({ page }) => {
  await startInSofia(page);
  // The test tiles have no places of note, so a Debug trip makes the first event.
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Debug/ }).click();
  await page.getByRole("button", { name: /New city/ }).click();
  await page.getByRole("button", { name: "History" }).click();
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
