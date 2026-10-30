// Runs before every unit and integration test file: the daily forecast is
// pinned to one that changes nothing the tests look at, so results don't
// depend on today's date. tests/unit/forecast.test.ts tests the real one.
import { vi } from "vitest";

vi.mock("../../src/core/forecast", async (real) => {
  const F = await real<typeof import("../../src/core/forecast")>();
  const quiet: import("../../src/core/forecast").Forecast = { id: "test", icon: "", text: "A quiet day", effect: "mood", kind: "none", mult: 1 };
  return { ...F, forecastAt: () => quiet };
});
