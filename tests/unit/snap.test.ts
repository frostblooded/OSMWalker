import { describe, expect, it } from "vitest";
import { HALF, snapTo, TALL } from "../../src/ui/snap";

describe("a dragged sheet", () => {
  const screen = 1000;
  const head = 70;

  it("settles at the nearest height", () => {
    expect(snapTo(560, screen, head, false)).toBe("tall");
    expect(snapTo(400, screen, head, false)).toBe("half");
    expect(snapTo(150, screen, head, false)).toBe("peek");
  });

  it("goes full again when a full sheet is dragged near the top", () => {
    expect(snapTo(900, screen, head, true)).toBe("tall");
    expect(snapTo(600, screen, head, true)).toBe("half");
    expect(TALL).toBeGreaterThan(HALF);
  });

  it("closes when dragged below half its title bar", () => {
    expect(snapTo(34, screen, head, false)).toBe("close");
    expect(snapTo(0, screen, head, true)).toBe("close");
    expect(snapTo(36, screen, head, false)).toBe("peek");
  });
});
