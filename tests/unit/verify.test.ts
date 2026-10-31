import { describe, expect, it } from "vitest";
import { docsOnly, pushPlan } from "../../tools/verify";

describe("verify before a push", () => {
  it("counts Markdown and docs/ as docs, anything else as code", () => {
    expect(docsOnly(["CLAUDE.md", "docs/ui-guidelines.md", "docs/shot.png", "src/README.md"])).toBe(true);
    expect(docsOnly(["CLAUDE.md", "src/main.tsx"])).toBe(false);
    expect(docsOnly([])).toBe(true);
  });

  it("lets a docs-only or already verified push through, runs the checks when the files on disk are the ones pushed, and refuses the rest", () => {
    const at = { files: ["src/main.tsx"], verified: false, onDisk: true };
    expect(pushPlan({ ...at, files: ["CLAUDE.md"] })).toBe("docs");
    expect(pushPlan({ ...at, verified: true })).toBe("verified");
    expect(pushPlan({ ...at, verified: true, onDisk: false })).toBe("verified");
    expect(pushPlan(at)).toBe("run");
    expect(pushPlan({ ...at, onDisk: false })).toBe("refuse");
  });
});
