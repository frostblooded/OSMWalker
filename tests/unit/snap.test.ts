// How tall a dragged sheet ends up: where it was let go, or closed.
import { describe, expect, it } from "vitest";
import { CLOSE_AT, settle, TALL } from "../../src/ui/snap";

describe("a dragged sheet", () => {
  const screen = 1000;

  it("stays where it was let go", () => {
    expect(settle(450, screen, false)).toBe(0.45);
    expect(settle(800, screen, true)).toBe(0.8);
  });

  it("is never taller than its tallest", () => {
    expect(settle(900, screen, false)).toBe(TALL);
    expect(settle(1200, screen, true)).toBe(1);
  });

  it(`closes when let go below ${CLOSE_AT * 100}% of the screen`, () => {
    expect(settle(299, screen, false)).toBe("close");
    expect(settle(0, screen, true)).toBe("close");
    expect(settle(300, screen, false)).toBe(0.3);
  });
});
