# OSM Walker

A tamagotchi-like game played in mobile browsers: a little character walks real OpenStreetMap streets while the app is open; the time it was closed (up to 24 h) passes for him in one go on reopen, without walking the map. Live at https://frostblooded.github.io/OSMWalker/. TypeScript, Preact, MapLibre GL with OpenFreeMap tiles, on GitHub Pages.

## The user's rules

These mirror the Claude project instructions. Keep both in sync.

- **CLAUDE.md** goes straight to `master`, no PR. **Everything else**: run the checks locally, open a PR into `master`, run the review step in `CODING_STANDARDS.md`, and merge by hand once CI is green. No auto-merge.
- **Deploy**: after each push to `master`, check that the `.github/workflows/web.yml` deploy passed. No need to check the live site by hand.
- **Clarify first**: before acting, grill the user with decision cards (`request_decision`, one per question). Plain-text option lists and HTML widgets can't send answers back.
- **Tests first** (unit, integration, e2e), and keep CI fast.
- **Performance first**: loading, startup, frames, memory and network on phones. Measure every change and put the numbers in the PR.
- **Help pages and UI**: every mechanic or stat change updates the in-game Help, and every screen follows `docs/ui-guidelines.md` (rules 1 and 3 in `CODING_STANDARDS.md`).
- **Skills**: caveman and ponytail (level `full`) and Matt Pocock's skills, enabled in `.claude/settings.json`.

## Where to look

- `docs/architecture.md`: the layers, and links between files that no import shows (Help numbers, game data, saves, perf budgets).
- `docs/ui-guidelines.md`: read before touching a screen.
- `CODING_STANDARDS.md`: the review step and the rules it checks.
- `package.json` scripts: `lint`, `typecheck`, `test`, `build`, `e2e`, `perf`. Node 24, then `npm ci`.

## Gotchas

- The agent can't change GitHub repo settings (Pages source, environments, branch rules). Ask the user early, with the exact setting and a link to it.
- reddit.com is blocked from cloud sessions. Ask for the article's own link.
- Cloud sessions have Chromium under `/opt/pw-browsers`. Point `PW_CHROMIUM` at its `chrome` binary to run `npm run e2e`. There is no GPU, so frame rate can't be measured there.
