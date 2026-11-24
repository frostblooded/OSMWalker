# Tests, checks and the workflow

## Test layers (at `a87edab`)

- **Unit** (`tests/unit/`, Vitest, 24 files): one per module with logic worth
  testing alone: geo, graph, ofm (decoding with the fixture tiles), route,
  walker, orders, upgrades, economy, money, history, saveFile (old saves of
  every past shape), help (no missing or unused placeholders, every screen
  button has a page), api (fake fetch), idb (fake-indexeddb, version
  upgrade), sw (cache strategies), loop (tick rate), snap (sheet drag), format,
  look, debug, statsSheet, mapView, streets (the loader and cell sources), verify (the check script itself).
- **Integration** (`tests/integration/`): `game.test.ts` runs the real game,
  walker and street loader on the two fixture tiles with a fake `load` and a
  seeded RNG (harness `tests/support/game.ts`), e.g. "an order comes after 60
  s of riding, he picks up, delivers and is paid". `scene.test.ts` runs the
  map scene against a fake `MapPort`.
- **E2E** (`tests/e2e/`, Playwright, Pixel 7 profile, against the production
  build with `vite preview`): `mock.ts` fakes every outside service (search
  answers Sofia; a tiny map style; the fixture tiles; empty for the rest) and
  `reopenWith(page, js)` edits the stored save and reloads to set up a state
  (e.g. `d.job = { order: null, wait_left_s: 0 }` for an order now). Files:
  `boot`, `play` (player flows), `screens` (every screen), `layout` (no
  overlapping text or sideways scroll at 360 and 412 px on every screen;
  `npm run screens` saved the shots), `offline` (opens offline after one
  visit), `live` (plays the deployed site, by hand).
- **Perf** (`tests/perf/perf.mjs`): throttled cold loads against the budgets.
- **Economy sim** (`npm run sim`), see
  [orders-and-economy.md](orders-and-economy.md#the-economy-simulation).
- Fixtures: `tests/fixtures/ofm/14_9253_6039.pbf` and `14_9254_6039.pbf`, two
  neighbouring z14 tiles of central Sofia (read them with
  `git show a87edab:tests/fixtures/ofm/14_9253_6039.pbf > tile.pbf`).

## Where checks ran

From 2026-10-31 (user's pick, PR #123) **all checks ran locally**, and GitHub
Actions only built and deployed `master` to Pages (`.github/workflows/web.yml`,
~30 s from merge to live).

- `npm run check` (~15 s): lint (Biome), typecheck (tsc), and the unit and
  integration tests touched by the change since master.
- `npm run verify` (~75 s on a 4-core box): lint, typecheck, unit +
  integration, build in parallel; then e2e (75% of cores) and perf side by
  side.
- `tools/verify.ts` stamped the git tree that passed in `.git/verified/` and
  `.git/checked/`; the pre-push hook (`.githooks/pre-push`, set up by
  `npm ci` through `core.hooksPath`) let that exact tree through, required a
  check for a branch and a verify for master, and let docs-only pushes pass.

## The PR workflow

Kept for the Rust version: see `CODING_STANDARDS.md`.

## Review rules (CODING_STANDARDS.md at `a87edab`)

Help updated with every mechanic change (numbers from code); perf numbers in
the PR; UI follows the guidelines and gets a layout test step; tests first;
a change to what is saved gets a repair step and an old-save test; new code
fits in (naming, header comment on every file, money in cents, randomness
through the seeded RNG); a new module or hidden link updates the architecture
map.
