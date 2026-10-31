// Every check the game has, run on this machine: lint, typecheck, unit and integration
// tests and the build side by side, then the browser e2e, then the perf budgets.
// A pass is remembered by the git tree it checked, so the pre-push hook
// (.githooks/pre-push) lets that exact code through without running it again.
// Usage: npm run verify            (all checks, then remember the pass)
//        node tools/verify.ts --pre-push   (what the hook runs; reads git's refs on stdin)
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Markdown anywhere and everything under docs/ never reach the game, so they need no checks. */
export function docsOnly(files: string[]): boolean {
  return files.every((f) => f.endsWith(".md") || f.startsWith("docs/"));
}

/** What the hook does with one pushed commit. */
export function pushPlan(at: { files: string[]; verified: boolean; onDisk: boolean }): "docs" | "verified" | "run" | "refuse" {
  if (docsOnly(at.files)) return "docs";
  if (at.verified) return "verified";
  return at.onDisk ? "run" : "refuse";
}

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const stamps = () => path.resolve(git("rev-parse", "--git-path", "verified"));

/** The tree of the files on disk now, untracked ones too, without touching the real index. */
function diskTree(): string {
  const index = path.resolve(git("rev-parse", "--git-path", "index"));
  const tmp = `${index}.verify`;
  if (existsSync(index)) copyFileSync(index, tmp);
  try {
    const env = { ...process.env, GIT_INDEX_FILE: tmp };
    execFileSync("git", ["add", "-A"], { env });
    return execFileSync("git", ["write-tree"], { env, encoding: "utf8" }).trim();
  } finally {
    rmSync(tmp, { force: true });
  }
}

/** The cloud sessions' Chromium, when no other browser is named. */
function chromium(): string | undefined {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const root = "/opt/pw-browsers";
  const dir = existsSync(root) ? readdirSync(root).find((d) => /^chromium-\d+$/.test(d)) : undefined;
  const bin = dir && path.join(root, dir, "chrome-linux64", "chrome");
  return bin && existsSync(bin) ? bin : undefined;
}

/** Runs npm scripts side by side; each one's output prints when it ends. */
function run(scripts: string[], env: NodeJS.ProcessEnv): Promise<boolean> {
  return Promise.all(
    scripts.map(
      (s) =>
        new Promise<boolean>((done) => {
          const t0 = Date.now();
          const child = spawn("npm", ["run", "--silent", s], { env, stdio: scripts.length > 1 ? "pipe" : "inherit" });
          let out = "";
          child.stdout?.on("data", (d) => (out += d));
          child.stderr?.on("data", (d) => (out += d));
          child.on("close", (code) => {
            if (code !== 0 && out) process.stdout.write(out);
            console.log(`${code === 0 ? "✓" : "✗"} ${s} (${Math.round((Date.now() - t0) / 1000)} s)`);
            done(code === 0);
          });
        }),
    ),
  ).then((ok) => ok.every(Boolean));
}

/** All checks; remembers the tree on a pass. */
async function verify(): Promise<boolean> {
  const tree = diskTree();
  const env = { ...process.env, PW_CHROMIUM: chromium() };
  for (const group of [["lint", "typecheck", "test", "build"], ["e2e"], ["perf"]]) {
    if (!(await run(group, env))) {
      console.log("Checks failed: fix them and run npm run verify again.");
      return false;
    }
  }
  mkdirSync(stamps(), { recursive: true });
  writeFileSync(path.join(stamps(), tree), new Date().toISOString());
  console.log(`All checks passed for tree ${tree.slice(0, 8)}; a push of it goes straight through.`);
  return true;
}

const ZERO = /^0+$/;
const has = (sha: string) => {
  try {
    return git("cat-file", "-t", sha) === "commit";
  } catch {
    return false;
  }
};

/** The pre-push hook: every pushed commit that changes the game must be verified. */
async function prePush(): Promise<boolean> {
  for (const line of readFileSync(0, "utf8").split("\n")) {
    const [, sha, , remoteSha] = line.trim().split(" ");
    if (!sha || ZERO.test(sha)) continue; // a deleted branch
    // A new branch, or a remote commit this clone hasn't fetched, is compared with master.
    const base = remoteSha && !ZERO.test(remoteSha) && has(remoteSha) ? remoteSha : git("merge-base", sha, "origin/master");
    const files = git("diff", "--name-only", base, sha).split("\n").filter(Boolean);
    const tree = git("rev-parse", `${sha}^{tree}`);
    const plan = pushPlan({ files, verified: existsSync(path.join(stamps(), tree)), onDisk: diskTree() === tree });
    if (plan === "refuse") {
      console.log(`${sha.slice(0, 8)} hasn't passed npm run verify. Check it out, run npm run verify, then push again.`);
      return false;
    }
    if (plan === "run" && !(await verify())) return false;
  }
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ok = process.argv.includes("--pre-push") ? await prePush() : await verify();
  process.exit(ok ? 0 : 1);
}
