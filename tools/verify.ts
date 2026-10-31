// The game's checks, run on this machine (GitHub Actions only deploys).
//   npm run verify   every check: lint, typecheck, unit and integration tests and the build
//                    side by side, then the browser e2e, then the perf budgets
//   npm run check    the quick one for while you work: lint, typecheck, and the unit and
//                    integration tests that the change since master touches
// A pass is remembered by the git tree it checked, so the pre-push hook (.githooks/pre-push)
// lets that exact code through without running it again: a branch needs a check, master a
// verify. After a verify, a change to tests only reruns those tests.
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Markdown anywhere and everything under docs/ never reach the game, so they need no checks. */
export function docsOnly(files: string[]): boolean {
  return files.every((f) => f.endsWith(".md") || f.startsWith("docs/"));
}

const FULL = [["lint", "typecheck", "test", "build"], ["e2e"], ["perf"]];

/**
 * The checks a change can break, as groups that run one after another (each group side by side).
 * A change to tests only reruns those tests; anything else, or no verified commit to compare with (null), runs all.
 */
export function scope(files: string[] | null): string[][] {
  if (!files) return FULL;
  const code = files.filter((f) => !docsOnly([f]));
  const unit = code.some((f) => /^tests\/(unit|integration|support|fixtures)\//.test(f));
  const e2e = code.some((f) => /^tests\/(e2e|fixtures)\//.test(f));
  if (!code.every((f) => /^tests\/(unit|integration|support|fixtures|e2e)\//.test(f))) return FULL;
  const first = ["lint", "typecheck", ...(unit ? ["test"] : []), ...(e2e ? ["build"] : [])];
  return e2e ? [first, ["e2e"]] : [first];
}

/** What the hook does with one pushed commit: master needs a verify, any other branch a check. */
export function pushPlan(at: { files: string[]; verified: boolean; checked: boolean; onDisk: boolean; master: boolean }): "docs" | "pass" | "check" | "verify" | "refuse" {
  if (docsOnly(at.files)) return "docs";
  if (at.verified || (at.checked && !at.master)) return "pass";
  if (!at.onDisk) return "refuse";
  return at.master ? "verify" : "check";
}

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const stampDir = (kind: "verified" | "checked") => path.resolve(git("rev-parse", "--git-path", kind));
const stamped = (kind: "verified" | "checked", tree: string) => existsSync(path.join(stampDir(kind), tree));
function stamp(kind: "verified" | "checked", tree: string) {
  mkdirSync(stampDir(kind), { recursive: true });
  writeFileSync(path.join(stampDir(kind), tree), new Date().toISOString());
}

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

/** Files on disk that differ from the newest verified commit among HEAD's last 100, or null if there is none. */
function changedSinceVerified(): string[] | null {
  for (const line of git("log", "-n", "100", "--format=%H %T").split("\n")) {
    const [commit, tree] = line.split(" ");
    if (!commit || !tree || !stamped("verified", tree)) continue;
    return [...git("diff", "--name-only", commit).split("\n"), ...git("ls-files", "--others", "--exclude-standard").split("\n")].filter(Boolean);
  }
  return null;
}

/** The cloud sessions' headless Chromium (lighter than the full one: e2e about 6% faster), when no other browser is named. */
function chromium(): string | undefined {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const root = "/opt/pw-browsers";
  const dir = existsSync(root) ? readdirSync(root).find((d) => /^chromium_headless_shell-\d+$/.test(d)) : undefined;
  const bin = dir && path.join(root, dir, "chrome-headless-shell-linux64", "chrome-headless-shell");
  return bin && existsSync(bin) ? bin : undefined;
}

/** Runs npm scripts (with their arguments) side by side; each one's output prints when it ends. */
function run(scripts: string[][]): Promise<boolean> {
  const env = { ...process.env, PW_CHROMIUM: chromium() };
  return Promise.all(
    scripts.map(
      ([script = "", ...args]) =>
        new Promise<boolean>((done) => {
          const t0 = Date.now();
          const child = spawn("npm", ["run", "--silent", script, ...(args.length ? ["--", ...args] : [])], { env, stdio: scripts.length > 1 ? "pipe" : "inherit" });
          let out = "";
          child.stdout?.on("data", (d) => (out += d));
          child.stderr?.on("data", (d) => (out += d));
          child.on("close", (code) => {
            if (code !== 0 && out) process.stdout.write(out);
            console.log(`${code === 0 ? "✓" : "✗"} ${script} (${Math.round((Date.now() - t0) / 1000)} s)`);
            done(code === 0);
          });
        }),
    ),
  ).then((ok) => ok.every(Boolean));
}

/** Every check this change can break; remembers the tree on a pass. */
async function verify(): Promise<boolean> {
  const tree = diskTree();
  if (stamped("verified", tree)) return console.log(`Tree ${tree.slice(0, 8)} already passed npm run verify.`), true;
  const groups = scope(changedSinceVerified());
  if (groups !== FULL) console.log(`Only tests changed since the last verify: running ${groups.flat().join(", ")}.`);
  for (const group of groups) {
    if (!(await run(group.map((s) => [s])))) return console.log("Checks failed: fix them and run npm run verify again (npm run e2e:failed reruns just the failed e2e tests)."), false;
  }
  stamp("verified", tree);
  stamp("checked", tree);
  console.log(`npm run verify passed for tree ${tree.slice(0, 8)}; a push of it goes straight through.`);
  return true;
}

/** Lint, typecheck and the unit and integration tests the change since master touches. */
async function check(): Promise<boolean> {
  const tree = diskTree();
  if (stamped("checked", tree)) return console.log(`Tree ${tree.slice(0, 8)} already passed npm run check.`), true;
  if (!(await run([["lint"], ["typecheck"], ["test", "--changed", git("merge-base", "HEAD", "origin/master")]]))) return console.log("Checks failed: fix them and run npm run check again."), false;
  stamp("checked", tree);
  console.log(`npm run check passed for tree ${tree.slice(0, 8)}; it can go to a branch. Master needs npm run verify.`);
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

/** The pre-push hook: each pushed commit that changes the game must have passed. */
async function prePush(): Promise<boolean> {
  for (const line of readFileSync(0, "utf8").split("\n")) {
    const [, sha, ref, remoteSha] = line.trim().split(" ");
    if (!sha || ZERO.test(sha)) continue; // a deleted branch
    // A new branch, or a remote commit this clone hasn't fetched, is compared with master.
    const base = remoteSha && !ZERO.test(remoteSha) && has(remoteSha) ? remoteSha : git("merge-base", sha, "origin/master");
    const files = git("diff", "--name-only", base, sha).split("\n").filter(Boolean);
    const tree = git("rev-parse", `${sha}^{tree}`);
    const master = ref === "refs/heads/master";
    const plan = pushPlan({ files, verified: stamped("verified", tree), checked: stamped("checked", tree), onDisk: diskTree() === tree, master });
    if (plan === "refuse") return console.log(`${sha.slice(0, 8)} hasn't passed npm run ${master ? "verify" : "check"}. Check it out, run that, then push again.`), false;
    if (plan === "check" && !(await check())) return false;
    if (plan === "verify" && !(await verify())) return false;
  }
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2];
  const ok = await (mode === "--pre-push" ? prePush() : mode === "--check" ? check() : verify());
  process.exit(ok ? 0 : 1);
}
