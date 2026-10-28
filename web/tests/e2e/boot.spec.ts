import { expect, test } from "@playwright/test";

test("the game boots without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "OSM Walker" })).toBeVisible();
  await expect(page.locator("#boot")).toHaveCount(0);
  expect(errors).toEqual([]);
});
