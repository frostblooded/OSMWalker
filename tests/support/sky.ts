// A catch-up sky with no weather whose sun hour (and clock) is `hourAt(ms)`, for tests that pin the time of day.
import type { AwayCity } from "../../src/core/catchup";
import { skyAt, type Sky } from "../../src/core/sky";

export const hourSky =
  (hourAt: (ms: number) => number) =>
  (ms: number, c: AwayCity): Sky => ({ ...skyAt(ms, c.center[0], c.center[1], 0, null), hour: hourAt(ms), clock: hourAt(ms) });
