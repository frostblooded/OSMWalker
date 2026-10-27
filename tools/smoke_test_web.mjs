// Loads the exported web build in headless Chromium and fails on script errors.
// Usage: node tools/smoke_test_web.mjs <url> <screenshot.png>
import { chromium } from "playwright";

const [url, shot] = process.argv.slice(2);
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const logs = [];
page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
await page.goto(url);
const started = await page
  .waitForEvent("console", { predicate: (m) => m.text().includes("OSM Walker ready"), timeout: 60000 })
  .then(() => true, () => false);
await page.waitForTimeout(5000);
await page.screenshot({ path: shot });
await browser.close();
console.log(logs.join("\n"));
const bad = logs.filter((l) => /SCRIPT ERROR|Parse Error|pageerror|ERROR:/.test(l));
if (!started || bad.length) {
  console.error(started ? `Script errors:\n${bad.join("\n")}` : "The game never reported ready");
  process.exit(1);
}
console.log("Web build started cleanly.");
