# OSM Walker

A tamagotchi-like game played in mobile browsers: a little character walks real OpenStreetMap streets while the app is open; on reopen he runs 10× as fast until he has made up the time it was closed. Live at https://frostblooded.github.io/OSMWalker/. TypeScript, Preact, MapLibre GL with OpenFreeMap tiles, on GitHub Pages.

## The user's rules

These mirror the Claude project instructions. Keep both in sync.

- **CLAUDE.md** goes straight to `master`, no PR. **Everything else**: open a PR into `master`, run the review step in `CODING_STANDARDS.md` as a **ponytail review** (user, 2026-10-31: a fresh review agent using the ponytail skill, checking the diff against `CODING_STANDARDS.md` too), and merge by hand once `npm run verify` passed on the branch with the newest `master` merged in. No auto-merge.
- **Checks run locally, not on GitHub** (user, 2026-10-31): `npm run check` (~25 s) before a branch push, `npm run verify` (~3.5 min: everything incl. e2e and perf) before a merge. The pre-push hook (`.githooks/pre-push`, set up by `npm ci`) refuses unchecked code. Run them yourself with a long Bash timeout before `git push`, so the push is instant. PRs show no CI checks.
- **Deploy**: `.github/workflows/web.yml` only builds and deploys `master`. After each push to `master`, check that it passed. No need to check the live site by hand.
- **Clarify first**: before acting, grill the user with decision cards (`request_decision`, one per question). Plain-text option lists and HTML widgets can't send answers back.
- **Tests first** (unit, integration, e2e), and keep the checks fast.
- **Performance first**: loading, startup, frames, memory and network on phones. Measure every change and put the numbers in the PR.
- **Help pages and UI**: every mechanic or stat change updates the in-game Help, and every screen follows `docs/ui-guidelines.md` (rules 1 and 3 in `CODING_STANDARDS.md`).
- **Skills**: caveman and ponytail (level `full`) and Matt Pocock's skills, enabled in `.claude/settings.json`.

## Where to look

- `docs/architecture.md`: the layers, and links between files that no import shows (Help numbers, game data, saves, perf budgets).
- `docs/ui-guidelines.md`: read before touching a screen.
- `CODING_STANDARDS.md`: the review step and the rules it checks.
- `package.json` scripts: `check`, `verify`, `lint`, `typecheck`, `test`, `build`, `e2e`, `e2e:failed`, `perf`. Node 24, then `npm ci`. On your own machine, `npx playwright install chromium` once.

## Gotchas

- The agent can't change GitHub repo settings (Pages source, environments, branch rules). Ask the user early, with the exact setting and a link to it.
- reddit.com is blocked from cloud sessions. Ask for the article's own link.
- Cloud sessions have Chromium under `/opt/pw-browsers`; `npm run verify` finds it. For `npm run e2e` alone, point `PW_CHROMIUM` at its `chrome-headless-shell`. There is no GPU, so frame rate can't be measured there.
