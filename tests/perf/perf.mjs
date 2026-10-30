// Perf budget check: loads the production build under a mid-range phone profile
// and fails if any number in budgets.json is exceeded.
// Usage: node tests/perf/perf.mjs   (after npm run build)
// PW_CHROMIUM=/path/to/chrome uses a local Chromium; CI uses the runner's Chrome.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "./serve.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, "../../dist");
const out = path.resolve(here, "../../perf-results");
const { budgets, profile } = JSON.parse(fs.readFileSync(path.join(here, "budgets.json"), "utf8"));
const PORT = 4174;

const server = await serve(dist, PORT);
const browser = await chromium.launch({
  channel: process.env.CI ? "chrome" : undefined,
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("Performance.enable");
await cdp.send("Network.enable");
await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 85, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 });
await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(process.env.PERF_CPU ?? 4) });
await page.addInitScript(() => {
  window.__longTasks = [];
  new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__longTasks.push([e.startTime, e.duration]))).observe({ type: "longtask", buffered: true });
  // Long animation frames say which script made a frame slow, so a failing run shows the culprit.
  window.__frames = [];
  new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__frames.push({ start: Math.round(e.startTime), ms: Math.round(e.duration), block: Math.round(e.blockingDuration), render: Math.round(e.renderStart ? e.startTime + e.duration - e.renderStart : 0), scripts: e.scripts.map((s) => `${s.invoker || s.invokerType} @ ${s.sourceURL.split("/").pop()}:${s.sourceCharPosition} ${Math.round(s.duration)}ms`) }))).observe({ type: "long-animation-frame", buffered: true });
});

await page.goto(`http://localhost:${PORT}/`);
await page.waitForFunction(() => performance.getEntriesByName("osmwalker:ready").length > 0 && performance.getEntriesByName("first-contentful-paint").length > 0, null, { timeout: 60000, polling: 50 });
const load = await page.evaluate(() => {
  const nav = performance.getEntriesByType("navigation")[0];
  const res = performance.getEntriesByType("resource");
  const local = res.filter((r) => r.name.startsWith(location.origin));
  return {
    transfer: nav.encodedBodySize + local.reduce((s, r) => s + r.encodedBodySize, 0),
    firstPaint: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? Infinity,
    ready: performance.getEntriesByName("osmwalker:ready")[0].startTime,
  };
});

// Steady state: 10 s of the running game.
const metric = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
const m0 = await metric();
await page.waitForTimeout(10000);
const m1 = await metric();
const longTasks = await page.evaluate((ready) => window.__longTasks.filter(([start]) => start > ready).length, load.ready);
const late = await page.evaluate((ready) => ({ tasks: window.__longTasks.filter(([start]) => start > ready).map(([s, d]) => [Math.round(s), Math.round(d)]), frames: window.__frames.filter((f) => f.start + f.ms > ready) }), load.ready);
if (late.tasks.length || process.env.PERF_DEBUG) console.log("Long tasks after ready:", JSON.stringify(late, null, 1), "ready", Math.round(load.ready));

const results = {
  transfer_kb: Math.round(load.transfer / 1024),
  first_paint_ms: Math.round(load.firstPaint),
  ready_ms: Math.round(load.ready),
  main_thread_busy_pct: Math.round(((m1.TaskDuration - m0.TaskDuration) / (m1.Timestamp - m0.Timestamp)) * 100),
  long_tasks_after_ready: longTasks,
};
await browser.close();
server.close();

// Both key sets, so a budget without a number or a number without a budget fails.
const rows = [...new Set([...Object.keys(results), ...Object.keys(budgets)])].map((k) => ({ metric: k, value: results[k], budget: budgets[k], ok: results[k] <= budgets[k] }));
const md = [`### Perf budgets (${profile})`, "", "| Metric | Value | Budget | |", "| --- | --- | --- | --- |", ...rows.map((r) => `| ${r.metric} | ${r.value} | ${r.budget} | ${r.ok ? "✅" : "❌"} |`)].join("\n");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "perf.json"), JSON.stringify(results, null, 2));
fs.writeFileSync(path.join(out, "perf.md"), md + "\n");
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
console.log(md);
if (rows.some((r) => !r.ok)) {
  console.error("Perf budget exceeded.");
  process.exit(1);
}
