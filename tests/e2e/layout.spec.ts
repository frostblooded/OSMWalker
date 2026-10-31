// Layout guardrail: on every screen, at small and large phone widths, no two
// pieces of text or controls overlap and nothing scrolls sideways. Each screen is also
// saved as a screenshot in screens/ so a PR can be eyeballed.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { encode } from "../../src/core/postcard";
import { KEEPSAKES, mockServices, reopenAfter, reopenWith } from "./mock";

test.beforeEach(async ({ context }) => {
  await mockServices(context);
});

/** An elder of the third generation, with a long home name and heirloom on the tree; his heir sets out in Sofia, whose streets the mock serves. */
const FAMILY = `const ago = (d) => Math.floor(Date.now() / 1000) - d * 86400;
const letter = "Dear heir,\\nI walked 812 km through 14 cities and reached level 23. Sofia felt most like home.\\nTake my Mighty Bronze Sword of the Fox.\\n— Walker I, Hearty Elder";
const a = (gen, title) => ({ gen, born: ago(200 - gen * 56), retired: ago(144 - gen * 56), by: "age", title, level: 23, km: 812, cities: 14, home: "Villeneuve-lès-Avignon, France", heirloom: "Mighty Bronze Sword of the Fox", letter, chronicle: [] });
d.stats.life = { born: ago(50), stage: 3, gen: 3, tiers: ["fine", "poor", "good", "fine"], cityMin: { "Sofia, Bulgaria": 600 }, cityAt: { "Sofia, Bulgaria": [42.687, 23.319] }, family: [a(1, "Hearty Elder"), { ...a(2, "Weary Elder"), countries: 3, best: { stretchM: 9000, dayM: 31000, dayStops: 24, cents: 1234500, noFaintS: 900000 } }] };`;

/** Drags a sheet's title bar down by dy px. */
async function dragTitle(page: Page, sheet: Locator, dy: number) {
  const b = (await sheet.locator("header h2").boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(x, y + (dy * i) / 5);
  await page.mouse.up();
}

/** Pairs of visible text runs and controls whose boxes overlap, as "a | b" strings. */
const overlaps = (page: Page) =>
  page.evaluate(() => {
    type Run = { el: Element; text: string; r: DOMRect };
    const clipped = (el: Element, r: DOMRect): DOMRect | null => {
      let { left, top, right, bottom } = r;
      for (let a = el.parentElement; a; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (s.overflowX === "visible" && s.overflowY === "visible") continue;
        const c = a.getBoundingClientRect();
        left = Math.max(left, c.left);
        top = Math.max(top, c.top);
        right = Math.min(right, c.right);
        bottom = Math.min(bottom, c.bottom);
      }
      left = Math.max(left, 0);
      top = Math.max(top, 0);
      right = Math.min(right, innerWidth);
      bottom = Math.min(bottom, innerHeight);
      return right - left > 1 && bottom - top > 1 ? new DOMRect(left, top, right - left, bottom - top) : null;
    };
    const runs: Run[] = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const text = n.textContent?.trim();
      const el = n.parentElement;
      if (!text || !el || el.closest("script, style, [aria-hidden='true']")) continue;
      const s = getComputedStyle(el);
      if (s.visibility !== "visible" || Number(s.opacity) === 0 || el.getClientRects().length === 0) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) {
        const c = clipped(el, r);
        if (c) runs.push({ el, text, r: c });
      }
    }
    // Icon buttons and fields carry no text but must not be covered either.
    for (const el of document.querySelectorAll("button, summary, input, select, textarea, a[href], [role='button'], [role='switch']")) {
      if (getComputedStyle(el).visibility !== "visible") continue;
      const c = el.getClientRects().length ? clipped(el, el.getBoundingClientRect()) : null;
      if (c) runs.push({ el, text: el.getAttribute("aria-label") ?? el.textContent?.trim() ?? el.tagName, r: c });
    }
    // An open sheet covers the game on purpose: text under it is out of sight.
    const sheets = [...document.querySelectorAll("[role='dialog']")].filter((d) => d.getClientRects().length > 0);
    const under = (run: Run) => sheets.some((d) => !d.contains(run.el) && hit(d.getBoundingClientRect(), run.r));
    const seen = runs.filter((run) => !under(run));
    // One pixel of slack: line boxes of neighbouring lines may touch.
    function hit(a: DOMRect, b: DOMRect) {
      return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
    }
    const found = new Set<string>();
    for (let i = 0; i < seen.length; i++)
      for (let j = i + 1; j < seen.length; j++) {
        const a = seen[i];
        const b = seen[j];
        if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
        if (hit(a.r, b.r)) found.add(`${a.text.slice(0, 30)} | ${b.text.slice(0, 30)}`);
      }
    return [...found];
  });

/** How far the page scrolls sideways, in CSS px (0 is right). */
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

async function check(page: Page, name: string) {
  // Let CSS transitions (switches, pressed buttons) end before measuring.
  // Keyframe animations are not waited for: a spinner never ends and a toast
  // fades for 6 s. A screen that slides in must use a transition to be waited for.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a instanceof CSSTransition)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  const width = page.viewportSize()!.width;
  await page.screenshot({ path: `screens/${width}-${name}.png` });
  expect.soft(await overlaps(page), `${name} at ${width} px: overlapping text or controls`).toEqual([]);
  expect.soft(await sideways(page), `${name} at ${width} px: sideways scroll`).toBeLessThanOrEqual(0);
}

/** The save change that rests him at a corner (so the map holds still) and puts one quest, The Lost Dog, on his city's board about 80 map px east of him (a map px is 360 / (512 * 2^zoom) degrees of longitude). */
const QUEST_NEXT_TO_HIM = `const at = d.walker.from_pos;
d.walker.progress_m = 0; d.walker.rest_m = d.walker.rest_total_m = 1e6;
d.stats.quests = { city: d.city, board: [{ key: "lost_dog:Ana:0", kind: "lost_dog", giver: "Ana", item: 0, twist: -1,
  at: { name: "Test Park", class: "park", subclass: "park", lat: at[0], lon: at[1] + (80 * 360) / (512 * 2 ** d.zoom) } }],
  active: null, done: [], log: [], since: 0, wait: 4, nudge: "",
  events: [{ id: "bakery_oven@1", kind: "bakery_oven", line: 0, ends: Math.floor(Date.now() / 1000) + 2700,
    at: { name: "The Very Long Named Neighbourhood Bakery and Coffee House", class: "shop", subclass: "bakery", lat: at[0], lon: at[1] - (80 * 360) / (512 * 2 ** d.zoom) } }] };`;

/** Picks Sofia and waits for its streets and his first goal. */
async function startInSofia(page: Page) {
  await page.goto("./");
  await page.getByLabel("City name").fill("Sofia");
  await page.getByRole("button", { name: /Sofia/ }).click();
  await expect(page.locator(".street")).toBeVisible({ timeout: 20000 });
  await expect(page.locator(".chip .eta")).toBeVisible({ timeout: 20000 });
}

async function openMenuItem(page: Page, name: RegExp) {
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name }).click();
}

for (const width of [360, 412]) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: 740 } });

    // The Collection's five tabs have their own walk, so the one above stays well inside its time limit.
    test("no Collection tab has overlapping text or sideways scroll", async ({ page }) => {
      // Two city loads and five tabs: about 10 s locally, 17-30 s on a busy CI runner.
      test.setTimeout(60_000);
      await page.goto("./");
      await page.getByLabel("City name").fill("Sofia");
      await page.getByRole("button", { name: /Sofia/ }).click();
      await expect(page.locator(".street")).toBeVisible({ timeout: 20000 });
      await reopenWith(page, KEEPSAKES);
      await expect(page.locator(".street")).toBeVisible({ timeout: 20000 });
      await openMenuItem(page, /Collection/);
      const collection = page.getByRole("dialog", { name: /Collection/ });
      for (const tab of ["Cards", "Places", "World", "Gear", "Feats"]) {
        await collection.getByRole("tab", { name: new RegExp(tab) }).click();
        // Open the first fold on the tab, so a grid of tiles is checked too.
        const fold = collection.locator(".fold-head").first();
        if (await fold.count()) await fold.click();
        await check(page, `collection-${tab.toLowerCase()}`);
      }
    });

    // An elder with two walkers before him, retired from the menu: the confirm, his farewell letter, then the family tree.
    // Its own walk too, so the one below stays inside its time limit on a busy CI runner.
    test("no retirement or family screen has overlapping text or sideways scroll", async ({ page }) => {
      test.setTimeout(60_000);
      await page.goto("./");
      await page.getByLabel("City name").fill("Sofia");
      await page.getByRole("button", { name: /Sofia/ }).click();
      await expect(page.locator(".street")).toBeVisible({ timeout: 20000 });
      await reopenWith(page, FAMILY, "family-save");
      await expect(page.locator(".street")).toBeVisible({ timeout: 20000 });
      await openMenuItem(page, /Retire him now/);
      await check(page, "retire");
      await page.getByRole("dialog", { name: /Retire him now/ }).getByRole("button", { name: "Retire" }).click();
      const farewell = page.getByRole("dialog", { name: /farewell letter/ });
      await expect(farewell).toBeVisible({ timeout: 20000 });
      await check(page, "farewell");
      await farewell.getByRole("button", { name: "Carry on" }).click();
      await openMenuItem(page, /Stats/);
      const family = page.getByRole("dialog", { name: /Stats/ });
      await family.locator(".card", { hasText: "Family perk" }).scrollIntoViewIfNeeded();
      await check(page, "stats-life");
      await family.getByRole("button", { name: /Walker II ·/ }).click();
      await family.locator(".tree").scrollIntoViewIfNeeded();
      await check(page, "stats-family");
      await family.getByRole("button", { name: /Close/ }).click();
      await openMenuItem(page, /Records/);
      const records = page.getByRole("dialog", { name: /Records/ });
      const hall = records.locator(".card", { hasText: "Hall of walkers" });
      await hall.scrollIntoViewIfNeeded();
      await hall.getByRole("button", { name: /Bests/ }).click();
      await expect(hall).toContainText("Most money held");
      await expect(hall).toContainText("€12,345 · Walker II");
      await check(page, "records-hall");
      await records.getByRole("button", { name: /Close/ }).click();

    });

    // An item's story and the quest and event cards on the map: their own walk too, so the one below stays inside its time limit on a busy CI runner.
    test("no item story, quest card or event card has overlapping text or sideways scroll", async ({ page }) => {
      test.setTimeout(60_000);
      await page.goto("./");
      await page.getByLabel("City name").fill("Sofia");
      await page.getByRole("button", { name: /Sofia/ }).click();
      await expect(page.locator(".street")).toBeVisible({ timeout: 20000 });
      await reopenWith(page, KEEPSAKES);
      await expect(page.locator(".street")).toBeVisible({ timeout: 20000 });
      await openMenuItem(page, /Stats/);
      await page.getByRole("dialog", { name: /Stats/ }).getByRole("button", { name: /Lucky Cap/ }).click();
      await check(page, "stats-story");
      await page.getByRole("dialog", { name: /Stats/ }).getByRole("button", { name: /Close/ }).click();

      // A quest on the board about 80 px east of him: tap its icon for its card. The map's real scale moves it a little, so taps sweep along his row.
      await reopenWith(page, QUEST_NEXT_TO_HIM, "quest-save");
      await expect(page.locator(".street")).toBeVisible({ timeout: 20000 });
      const card = page.getByRole("dialog", { name: /The Lost Dog/ });
      await expect(async () => {
        const him = (await page.locator(".marker.him").boundingBox())!;
        for (let dx = 28; dx <= 160 && !(await card.count()); dx += 10) await page.mouse.click(him.x + him.width / 2 + dx, him.y + him.height / 2);
        await expect(card).toBeVisible({ timeout: 500 });
      }).toPass({ timeout: 20000 });
      await check(page, "quest-card");
      await card.getByRole("button", { name: /Go help/ }).click();
      await check(page, "quest-card-nudged");
      await card.getByRole("button", { name: /Close/ }).click();
      // The event about 80 px west of him, with a long place name.
      const event = page.getByRole("dialog", { name: /Oven trouble/ });
      await expect(async () => {
        const him = (await page.locator(".marker.him").boundingBox())!;
        for (let dx = 28; dx <= 160 && !(await event.count()); dx += 10) await page.mouse.click(him.x + him.width / 2 - dx, him.y + him.height / 2);
        await expect(event).toBeVisible({ timeout: 500 });
      }).toPass({ timeout: 20000 });
      await check(page, "event-card");
      await event.getByRole("button", { name: /Close/ }).click();
    });

    // The walk through every other screen comes in three parts, so each stays well inside its time limit
    // while the full e2e run keeps four browsers busy (one walk of it all ran past 180 s).
    test("no picker, menu, Help, Diary, Stats or Records screen has overlapping text or sideways scroll", async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto(`./#${encode({ from: "Ivan", city: "Kyoto, Japan", place: "Kinkaku-ji", level: 7, line: "Matcha at a tea house in Kyoto (-€6)" })}`);
      await expect(page.getByRole("dialog", { name: "Postcard" })).toBeVisible();
      await check(page, "postcard-received");
      await page.getByRole("button", { name: "Start my own walk" }).click();
      await expect(page.getByLabel("City name")).toBeVisible();
      await check(page, "picker");
      await page.getByLabel("City name").fill("Sofia");
      await expect(page.getByRole("button", { name: /Sofia/ })).toBeVisible();
      await check(page, "picker-results");
      await page.getByRole("button", { name: /Sofia/ }).click();
      await expect(page.locator(".street")).toBeVisible({ timeout: 20000 });
      await expect(page.locator(".chip .eta")).toBeVisible({ timeout: 20000 });
      await check(page, "game");

      await page.getByRole("button", { name: "Menu" }).click();
      await check(page, "menu");
      const menu = page.getByRole("dialog", { name: /Menu/ });
      await dragTitle(page, menu, (await menu.boundingBox())!.height - 740 * 0.32);
      await expect(menu).toHaveAttribute("style", /max-height/);
      await check(page, "menu-dragged");
      await page.getByRole("button", { name: "Close" }).click();

      await openMenuItem(page, /Help/);
      const help = page.getByRole("dialog", { name: /Help/ });
      await expect(help.getByRole("button", { name: "How he walks" })).toBeVisible();
      await check(page, "help");
      await help.getByRole("button", { name: "How he walks" }).click();
      await check(page, "help-page");
      await help.getByRole("button", { name: "Back" }).click();
      await help.getByRole("searchbox", { name: "Search Help" }).fill("hospital");
      await expect(help.getByRole("region", { name: /Results/ })).toBeVisible();
      await check(page, "help-search");
      await help.getByRole("button", { name: /Close/ }).click();

      await openMenuItem(page, /Diary/);
      await expect(page.getByRole("dialog", { name: /Diary/ })).toBeVisible();
      await check(page, "diary");
      await page.getByRole("dialog", { name: /Diary/ }).getByRole("button", { name: /Close/ }).click();

      await openMenuItem(page, /Stats/);
      await check(page, "stats");
      const mood = page.getByRole("dialog", { name: /Stats/ }).getByRole("button", { name: /🙂 Mood/ });
      await mood.click();
      await mood.scrollIntoViewIfNeeded();
      await check(page, "stats-mind");
      await page.getByRole("dialog", { name: /Stats/ }).getByRole("button", { name: /Close/ }).click();

      await openMenuItem(page, /Records/);
      const records = page.getByRole("dialog", { name: /Records/ });
      await expect(records).toContainText("Longest walk without a stop");
      await records.getByRole("button", { name: /Totals/ }).click();
      await expect(records).toContainText("🏙 Cities");
      await check(page, "records");
      await records.getByRole("button", { name: /Close/ }).click();
    });

    test("no Debug, History, away, postcard or care screen has overlapping text or sideways scroll", async ({ page }) => {
      test.setTimeout(120_000);
      await startInSofia(page);
      await openMenuItem(page, /Debug/);
      const debug = page.getByRole("dialog", { name: /Debug/ });
      await check(page, "debug");
      await debug.getByRole("button", { name: /Goal picks/ }).click();
      await check(page, "debug-goal-picks");
      await debug.getByRole("switch", { name: /One on every long reopen/ }).click();
      await debug.getByRole("button", { name: /New city/ }).click();

      await openMenuItem(page, /History/);
      await expect(page.getByRole("dialog", { name: /History/ }).locator("li").first()).toBeVisible({ timeout: 10000 });
      await check(page, "history");
      await page.getByRole("dialog", { name: /History/ }).getByRole("button", { name: /Close/ }).click();

      await openMenuItem(page, /Explored/);
      await expect(page.getByRole("dialog", { name: /Explored/ })).toContainText(/\d+ squares?/);
      await check(page, "explored");
      await page.getByRole("dialog", { name: /Explored/ }).getByRole("button", { name: /Close/ }).click();

      await reopenAfter(page, 5);
      const away = page.getByRole("dialog", { name: /While you were away/ });
      await expect(away).toContainText("One choice", { timeout: 20000 });
      await check(page, "away");
      await away.locator(".choices button").last().click();
      await check(page, "away-dilemma");
      await away.getByRole("button", { name: /events, newest first/ }).click();
      await check(page, "away-events");
      await away.getByRole("button", { name: "Carry on" }).click();

      await openMenuItem(page, /Send a postcard/);
      await check(page, "postcard");
      await page.getByRole("dialog", { name: /Send a postcard/ }).getByRole("button", { name: /Close/ }).click();

      await openMenuItem(page, /Care package/);
      const care = page.getByRole("dialog", { name: /Care package/ });
      await check(page, "care");
      await care.getByRole("button", { name: /Send Snack/ }).click();
      await check(page, "care-sent");
      await care.getByRole("button", { name: /Close/ }).click();
    });

    test("no timed moment or in-game postcard has overlapping text or sideways scroll", async ({ page }) => {
      test.setTimeout(120_000);
      await startInSofia(page);
      // The timed moments: a plain choice, then each mini-game, with the timer at 20 s so none closes mid-shot.
      await openMenuItem(page, /Choice timer/);
      await page.getByRole("button", { name: /Choice timer/ }).click();
      await expect(page.getByRole("button", { name: /Choice timer/ })).toContainText("20 s");
      await page.getByRole("dialog", { name: /Menu/ }).getByRole("button", { name: /Close/ }).click();
      for (const kind of ["choice", "timing", "cards", "taps", "odd"]) {
        await openMenuItem(page, /Debug/);
        await page.getByRole("dialog", { name: /Debug/ }).getByRole("button", { name: /Try a moment/ }).click();
        const moment = page.getByRole("dialog", { name: kind === "choice" ? /Quick choice/ : /Timing|Pick a card|Tap fast|Odd one out/ });
        await expect(moment.getByRole("timer")).toBeVisible();
        await check(page, `moment-${kind}`);
        await moment.getByRole("button", { name: /Close/ }).click();
        await expect(moment).toBeHidden();
      }

      await page.goto(`./#${encode({ from: "Ivan", city: "Kyoto, Japan", place: "Kinkaku-ji", level: 7, line: "Matcha at a tea house in Kyoto (-€6)" })}`);
      await page.reload(); // only the fragment changed, so the page has to load again to read it
      await expect(page.getByRole("dialog", { name: "📮 Postcard" })).toBeVisible({ timeout: 20000 });
      await check(page, "postcard-in-game");
    });
  });
}
