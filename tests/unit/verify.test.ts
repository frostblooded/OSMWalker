// The pre-push plan, the docs-only filter and the check scoping in tools/verify.ts.
import { describe, expect, it } from "vitest";
import { docsOnly, pushPlan, scope } from "../../tools/verify";

describe("verify before a push", () => {
  it("counts Markdown and docs/ as docs, anything else as code", () => {
    expect(docsOnly(["CLAUDE.md", "docs/ui-guidelines.md", "docs/shot.png", "src/README.md"])).toBe(true);
    expect(docsOnly(["CLAUDE.md", "src/main.tsx"])).toBe(false);
    expect(docsOnly([])).toBe(true);
  });

  it("lets a docs-only or already passed push through, checks what is on disk, and refuses the rest", () => {
    const at = { files: ["src/main.tsx"], verified: false, checked: false, onDisk: true, master: false };
    expect(pushPlan({ ...at, files: ["CLAUDE.md"] })).toBe("docs");
    // A branch needs the quick check; master needs every check.
    expect(pushPlan(at)).toBe("check");
    expect(pushPlan({ ...at, checked: true, onDisk: false })).toBe("pass");
    expect(pushPlan({ ...at, verified: true, onDisk: false })).toBe("pass");
    expect(pushPlan({ ...at, master: true })).toBe("verify");
    expect(pushPlan({ ...at, master: true, checked: true })).toBe("verify");
    expect(pushPlan({ ...at, master: true, verified: true, onDisk: false })).toBe("pass");
    expect(pushPlan({ ...at, onDisk: false })).toBe("refuse");
    expect(pushPlan({ ...at, master: true, checked: true, onDisk: false })).toBe("refuse");
  });

  it("runs only the checks a change can break", () => {
    const full = [["lint", "typecheck", "test", "build"], ["e2e"], ["perf"]];
    expect(scope(["tests/unit/walker.test.ts", "tests/support/game.ts", "tests/integration/game.test.ts"])).toEqual([["lint", "typecheck", "test"]]);
    expect(scope(["tests/e2e/play.spec.ts", "tests/e2e/mock.ts"])).toEqual([["lint", "typecheck", "build"], ["e2e"]]);
    expect(scope(["tests/e2e/play.spec.ts", "tests/unit/walker.test.ts"])).toEqual([["lint", "typecheck", "test", "build"], ["e2e"]]);
    expect(scope(["src/main.tsx", "tests/unit/walker.test.ts"])).toEqual(full);
    expect(scope(["tests/perf/perf.mjs"])).toEqual(full);
    expect(scope(null)).toEqual(full);
  });
});
