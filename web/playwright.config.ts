import { defineConfig, devices } from "@playwright/test";

// E2E against the production build. PW_CHROMIUM points at a local Chromium
// (the cloud sandbox); CI uses the runner's Chrome.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    ...devices["Pixel 7"],
    channel: process.env.CI ? "chrome" : undefined,
    launchOptions: {
      executablePath: process.env.PW_CHROMIUM || undefined,
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
    baseURL: "http://localhost:4173/",
    trace: "retain-on-failure",
    // Most tests want the network as the mocks answer it; offline.spec turns the service worker on.
    serviceWorkers: "block",
  },
  webServer: { command: "npm run preview", url: "http://localhost:4173/", reuseExistingServer: !process.env.CI },
});
