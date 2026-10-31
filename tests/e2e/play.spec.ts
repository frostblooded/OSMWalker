// Player flows in the browser, with fake map services.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { mockServices, reopenAfter, reopenDeparting, reopenWith } from "./mock";

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

test("shows the weather in his city on the top card and the Stats sheet", async ({ page }) => {
  await startInSofia(page);
  await expect(page.locator(".pill.sky")).toHaveText("🌧 9°", { timeout: 10000 });
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Stats/ }).click();
  await expect(page.locator(".card", { hasText: "Sky" })).toContainText("Rain, 9°C");
});

test("shades the map after dark and not by day", async ({ page }) => {
  // 22:30 in Sofia, long after sunset.
  await page.clock.setFixedTime(new Date("2026-10-29T20:30:00Z"));
  await startInSofia(page);
  await expect(page.locator(".night")).toHaveCSS("opacity", "0.45");
  await page.clock.setFixedTime(new Date("2026-10-29T10:00:00Z"));
  await expect(page.locator(".night")).toHaveCount(0, { timeout: 5000 });
});

test("on a dragon he can feed, it shows at his side", async ({ page }) => {
  await startInSofia(page);
  // He starts with enough money to feed it, so it eats as soon as he sets off.
  await reopenWith(page, `d.stats.gear.vehicle = { name: "Dragon", slot: "vehicle", vehicle: "dragon", stats: { speed: 2 }, rarity: "Common", price: 4000000 };`);
  await expect(page.locator(".marker.him .mount")).toHaveText("🐉", { timeout: 20000 });
});

test("picks up where he was after a reload", async ({ page }) => {
  await startInSofia(page);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("osmwalker.save"))).not.toBeNull();
  await page.reload();
  await expect(page.locator(".hud .city")).toContainText("Sofia", { timeout: 20000 });
});

test("the storyteller switches from the menu, is remembered, and brings incidents while he is away", async ({ page }) => {
  await startInSofia(page);
  await page.getByRole("button", { name: "Menu" }).click();
  const teller = page.getByRole("button", { name: /Storyteller/ });
  await expect(teller).toContainText("Classic");
  await teller.click();
  await expect(teller).toContainText("Chaotic");
  // Chaotic and at full tension, six hours away bring incidents for sure; an empty quest board leaves every stop to them.
  await reopenWith(page, "d.saved_at -= 6 * 3600_000; d.stats.story.tension = 100; d.stats.quests = { city: d.city, rolled: true, board: [] };");
  const away = page.getByRole("dialog", { name: /While you were away/ });
  await away.getByRole("button", { name: /events, newest first/ }).click({ timeout: 20000 });
  const icons = (JSON.parse(readFileSync("public/data/incidents.json", "utf8")) as { icon: string }[]).map((c) => c.icon);
  const lines = await away.locator(".away-log li").allTextContents();
  expect(lines.some((l) => icons.some((i) => l.includes(`${i} `)))).toBe(true);
  await away.getByRole("button", { name: "Carry on" }).click();
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("button", { name: /Storyteller/ })).toContainText("Chaotic");
});

test("Viktor shows beside him after a meeting, and his card on the Stats sheet keeps the score", async ({ page }) => {
  await startInSofia(page);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Stats/ }).click();
  await expect(page.getByRole("dialog", { name: /Stats/ })).toContainText("Not met yet");
  await reopenWith(
    page,
    `d.stats.rival = { level: 3, wins: 2, losses: 1, chats: 1, feeling: -6, town: d.stats.where.city, inTown: true, seenUntil: Date.now() / 1000 + 600, seenAt: [42.6977, 23.3219], memory: [{ t: 1, city: "Plovdiv, Bulgaria", contest: "chess", won: true }] };`,
  );
  await expect(page.locator(".marker.rival")).toHaveText("🎩", { timeout: 20000 });
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Stats/ }).click();
  const sheet = page.getByRole("dialog", { name: /Stats/ });
  await expect(sheet).toContainText("Nemesis");
  await expect(sheet).toContainText("2 won · 1 lost");
  await expect(sheet).toContainText("Plovdiv");
});

test("his friends and partner show on the Stats sheet", async ({ page }) => {
  await startInSofia(page);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Stats/ }).click();
  await expect(page.getByRole("dialog", { name: /Stats/ })).toContainText("No one yet");
  await reopenWith(
    page,
    `d.stats.friends = { list: [{ id: "a", name: "Mira", icon: "👩", city: "Plovdiv, Bulgaria", kind: "cafe", place: { name: "Cafe", lat: 42.1, lon: 24.7 }, hearts: 10, met: 1, seen: 2 }, { id: "b", name: "Hugo", icon: "🧔", city: d.stats.where.city, kind: "park", place: { name: "Park", lat: 42.7, lon: 23.3 }, hearts: 3, met: 1, seen: 2 }], partner: "a", companion: null };`,
  );
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Stats/ }).click();
  const sheet = page.getByRole("dialog", { name: /Stats/ });
  await expect(sheet).toContainText("Mira (partner)");
  await expect(sheet).toContainText("💗💗💗 · Sofia");
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

test("you can whisper to him three times a day, and praise his latest line once", async ({ page }) => {
  await startInSofia(page);
  // A reopen gives him a day of deeds to praise, and trust from the check-in.
  await reopenAfter(page, 3);
  await page.getByRole("dialog", { name: /While you were away/ }).getByRole("button", { name: "Carry on" }).click();
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Care package/ }).click();
  const care = page.getByRole("dialog", { name: /Care package/ });
  await expect(care).toContainText("His trust in you");
  await expect(care).toContainText("3 left today");
  for (let i = 0; i < 3; i++) await care.getByRole("button", { name: "Whisper eat" }).click();
  await expect(care).toContainText("0 left today");
  await expect(care.getByRole("button", { name: "Whisper rest" })).toBeDisabled();
  await expect(care).not.toContainText("Heard a whisper");
  await care.getByRole("button", { name: /Praise/ }).click();
  await expect(care.getByRole("button", { name: /Scold/ })).toBeDisabled();
  await expect(care).toContainText(/\(\+\d+ of ±100\)/);
});

test("a long reopen may hold one choice, which a tap settles", async ({ page }) => {
  await startInSofia(page);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Debug/ }).click();
  const debug = page.getByRole("dialog", { name: /Debug/ });
  await debug.getByRole("switch", { name: /One on every long reopen/ }).click();
  await expect(debug.getByRole("switch", { name: /One on every long reopen/ })).toHaveAttribute("aria-checked", "true");
  await reopenAfter(page, 5);
  const away = page.getByRole("dialog", { name: /While you were away/ });
  await expect(away).toContainText("One choice", { timeout: 20000 });
  await expect(away).toContainText("he decides by himself");
  await away.locator(".choices button").last().click();
  await expect(away).toContainText("You chose");
  await expect(away.locator(".choices")).toBeHidden();
  await away.getByRole("button", { name: "Carry on" }).click();
  await expect(away).toBeHidden();
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

test("a postcard goes out as a link and opens in a friend's game", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await startInSofia(page);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Send a postcard/ }).click();
  const sheet = page.getByRole("dialog", { name: /Send a postcard/ });
  await sheet.getByLabel("Your name").fill("Ivan");
  await sheet.getByRole("button", { name: /Share postcard/ }).click();
  await expect(sheet).toContainText("Link copied");
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toMatch(/#postcard=[\w-]+$/);

  // Same browser, so the "friend" has a game going too and can reply.
  const friend = await context.newPage();
  await friend.goto(url);
  const card = friend.getByRole("dialog", { name: "Postcard" });
  await expect(card).toContainText("A postcard from Ivan in Sofia", { timeout: 20000 });
  await expect(card).toContainText("Level");
  expect(new URL(friend.url()).hash).toBe("");
  await card.getByRole("button", { name: "Send one back" }).click();
  await expect(friend.getByRole("dialog", { name: /Send a postcard/ })).toBeVisible();
});

test("an elder whose time ran out retires, leaves a letter, and his heir carries on with the family tree", async ({ page }) => {
  await startInSofia(page);
  // Born a whole life ago (4 stages of 14 days), an elder: his first step retires him.
  await reopenWith(page, `d.stats.life = { born: Math.floor(Date.now() / 1000) - 56 * 86400 - 60, stage: 3, tiers: ["fine", "good", "fine", "good"], cityMin: { [d.city]: 600 }, km: 321 };`);
  const letter = page.getByRole("dialog", { name: /farewell letter/ });
  await expect(letter).toContainText("From Walker I", { timeout: 20000 });
  await expect(letter).toContainText("321 km");
  await letter.getByRole("button", { name: "Carry on" }).click();
  await expect(letter).toBeHidden();
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("button", { name: /Retire him/ })).toBeHidden();
  await page.getByRole("button", { name: /Stats/ }).click();
  const stats = page.getByRole("dialog", { name: /Stats/ });
  await expect(stats.locator(".card", { hasText: "2 generations" })).toContainText("Walker II");
  await stats.getByRole("button", { name: /Walker I · Hearty Elder/ }).click();
  await expect(stats.locator(".letter")).toContainText("Dear heir");
  await expect(stats.locator(".card", { hasText: "Backpacker" }).first()).toContainText("Family perk");
});

test("an elder can be retired early from the menu, after a confirm", async ({ page }) => {
  await startInSofia(page);
  await reopenWith(page, `d.stats.life = { born: Math.floor(Date.now() / 1000) - 50 * 86400, stage: 3, cityMin: { [d.city]: 600 } };`);
  await expect(page.locator(".street")).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Retire him now/ }).click();
  const ask = page.getByRole("dialog", { name: /Retire him now/ });
  await ask.getByRole("button", { name: "Keep walking" }).click();
  await expect(ask).toBeHidden();
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Retire him now/ }).click();
  await ask.getByRole("button", { name: "Retire" }).click();
  await expect(page.getByRole("dialog", { name: /farewell letter/ })).toContainText("From Walker I", { timeout: 20000 });
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

test("after a week turns over, the away sheet opens with his week", async ({ page }) => {
  await startInSofia(page);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("osmwalker.save"))).not.toBeNull();
  // His week started 8 days ago, with a few stops in it.
  await page.addInitScript(() => {
    if (sessionStorage.getItem("old-week")) return;
    sessionStorage.setItem("old-week", "1");
    const d = JSON.parse(localStorage.getItem("osmwalker.save")!);
    d.stats.week = { tally: { start: Math.floor(Date.now() / 1000) - 8 * 86400, walkedM: 4200, stops: 9, newPlaces: 4, kinds: { cafe: 5, park: 4 }, cities: [], cents: 20000, level: 1 }, last: null, shown: true };
    localStorage.setItem("osmwalker.save", JSON.stringify(d));
  });
  await reopenAfter(page, 1);
  const away = page.getByRole("dialog", { name: /While you were away/ });
  await expect(away).toContainText("His week", { timeout: 20000 });
  await expect(away).toContainText("cafe ×5");
});

test("the city rolls a quest board, the Stats sheet shows it, and he goes on quests while he is away", async ({ page }) => {
  await startInSofia(page);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("osmwalker.save") ?? "{}").stats?.quests?.board?.length ?? 0), { timeout: 30000 }).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Stats/ }).click();
  const stats = page.getByRole("dialog", { name: /Stats/ });
  await expect(stats).toContainText("On the board");
  await stats.getByRole("button", { name: /Close/ }).click();
  // Six hours away, ready for his next quest: he takes one on and walks it (no trip dice before that first stop, or a trip may take him off first).
  await reopenWith(page, "d.saved_at -= 6 * 3600_000; d.stats.quests.since = 9; d.skip_roll = true;");
  const away = page.getByRole("dialog", { name: /While you were away/ });
  await away.getByRole("button", { name: /events, newest first/ }).click({ timeout: 20000 });
  const lines = await away.locator(".away-log li").allTextContents();
  expect(lines.some((l) => l.includes("❗ New quest:"))).toBe(true);
});
