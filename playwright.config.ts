import { defineConfig, devices } from "@playwright/test";

// E2E against the production build. PW_CHROMIUM points at a local Chromium
// (the cloud sandbox); CI uses the runner's Chrome. LIVE_URL plays the
// deployed site instead (after a deploy), with no local server.
const live = process.env.LIVE_URL;
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  // Every core of the CI runner (4); the default is half.
  workers: process.env.CI ? "100%" : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    ...devices["Pixel 7"],
    channel: process.env.CI ? "chrome" : undefined,
    launchOptions: {
      executablePath: process.env.PW_CHROMIUM || undefined,
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
    baseURL: live ? live.replace(/\/?$/, "/") : "http://localhost:4173/",
    trace: "retain-on-failure",
    // Most tests want the network as the mocks answer it; offline.spec turns the service worker on.
    serviceWorkers: "block",
  },
  webServer: live ? undefined : { command: "npm run preview", url: "http://localhost:4173/", reuseExistingServer: !process.env.CI },
});
