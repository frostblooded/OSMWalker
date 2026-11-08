// Which Chromium the browser checks use: PW_CHROMIUM if set, else the cloud sessions'
// headless one under /opt/pw-browsers (lighter than the full one: e2e about 6% faster),
// else undefined for Playwright's own (npx playwright install chromium).
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

export function chromium(): string | undefined {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const root = "/opt/pw-browsers";
  const dir = existsSync(root) ? readdirSync(root).find((d) => /^chromium_headless_shell-\d+$/.test(d)) : undefined;
  const bin = dir && path.join(root, dir, "chrome-headless-shell-linux64", "chrome-headless-shell");
  return bin && existsSync(bin) ? bin : undefined;
}
