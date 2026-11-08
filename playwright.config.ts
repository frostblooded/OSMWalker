import { defineConfig, devices } from "@playwright/test";
import { chromium } from "./tools/chromium";

// E2E against the production build, in the Chromium tools/chromium.ts picks.
// LIVE_URL plays the deployed site instead, with no local server.
const live = process.env.LIVE_URL;
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  // One browser per core; the default is half.
  workers: "100%",
  reporter: "list",
  use: {
    ...devices["Pixel 7"],
    launchOptions: {
      executablePath: chromium(),
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
    baseURL: live ? live.replace(/\/?$/, "/") : "http://localhost:4173/",
    trace: "retain-on-failure",
    // Most tests want the network as the mocks answer it; offline.spec turns the service worker on.
    serviceWorkers: "block",
  },
  webServer: live ? undefined : { command: "npm run preview", url: "http://localhost:4173/", reuseExistingServer: true },
});
