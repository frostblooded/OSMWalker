# OSM Walker

A tamagotchi-like game played in mobile browsers: a little character walks real OpenStreetMap streets while the app is open and goes from place to place for money and XP; time stops while the app is closed. Live at https://frostblooded.github.io/OSMWalker/. TypeScript, Preact, MapLibre GL with OpenFreeMap tiles, on GitHub Pages.

## The user's rules

These mirror the Claude project instructions. Keep both in sync.

- **CLAUDE.md** goes straight to `master`, no PR. **Everything else**: open a PR into `master`, run the review step in `CODING_STANDARDS.md` as a **ponytail review** (user, 2026-10-31: a fresh review agent following `.claude/skills/ponytail-review/SKILL.md`, checking the diff against `CODING_STANDARDS.md` too, repeated until a round comes back empty; user, 2026-11-08: start it in the background when the PR opens, while `npm run verify` runs), and merge by hand once `npm run verify` passed on the branch with the newest `master` merged in. No auto-merge.
- **Checks run locally, not on GitHub** (user, 2026-10-31): `npm run check` (~15 s) before a branch push, `npm run verify` (~75 s: everything incl. e2e and perf side by side) before a merge. The pre-push hook (`.githooks/pre-push`, set up by `npm ci`) refuses unchecked code. Run them yourself with a long Bash timeout before `git push`, so the push is instant. PRs show no CI checks.
- **Deploy**: `.github/workflows/web.yml` only builds and deploys `master`. After each push to `master`, check that it passed. No need to check the live site by hand.
- **Clarify first**: before acting, grill the user with decision cards (`request_decision`, one per question). Plain-text option lists and HTML widgets can't send answers back.
- **Tests first** (unit, integration, e2e), and keep the checks fast.
- **Performance first**: loading, startup, frames, memory and network on phones. Measure every change and put the numbers in the PR.
- **Help pages and UI**: every mechanic or stat change updates the in-game Help, and every screen follows `docs/ui-guidelines.md` (rules 1 and 3 in `CODING_STANDARDS.md`).
- **Skills**: caveman and ponytail (level `full`) and Matt Pocock's skills, enabled in `.claude/settings.json`.

## Game design rules

From the design research report `docs/design-research.md` (user, 2026-11-08). **Read it often**, and always before any game design decision, new feature, upgrade, economy or care change, and when grilling the user. Cite it in plans.

1. The core loop must be fun alone. Cut anything that doesn't feed it, and write down what's left out.
2. Every choice is a situational trade-off; no option always wins. Mix obvious wins, traps and real trade-offs, with no recent repeats.
3. Few options: 3 (a 4th can be an unlock).
4. Show info clearly: icon + one number + time. Preview effects, and always react visibly to a pick.
5. Upgrades come in two kinds: small stacking bumps bought again and again (like +10%, multiplied), and one-offs that change what you can do or which places appear (keys and locks, the lock near the key, told in world words). Buying 10 of one generally opens the next. Prices grow, but don't let costs or distances scale the gains away (user, 2026-11-08: it is an incremental game).
6. Few currencies; extra ones only later, as depth.
7. Care is visible, forgiving and never guilt-tripping: no death, no lost progress in play, and the player's pick clearly beats the automatic one. A redesign of the economy may reset money and upgrades in old saves; say so in the PR (user, 2026-11-08).
8. Returning feels like a gift (a summary, a diary), not a punishment.
9. Prefer real, notable OSM places as free content over hand-made arcs.
10. Log picks and measure; simulate the economy; check UI clarity before retuning numbers.
11. About one upgrade every 5 minutes of play, early and later (user, 2026-11-08). `npm run sim` checks it (`tests/unit/economy.test.ts`); when a change breaks it, advise the user on new numbers.

## Where to look

- `docs/architecture.md`: the layers, and links between files that no import shows (Help numbers, game data, saves, perf budgets).
- `docs/ui-guidelines.md`: read before touching a screen.
- `docs/design-research.md`: the game design research report (see Game design rules).
- `CODING_STANDARDS.md`: the review step and the rules it checks.
- `package.json` scripts: `check`, `verify`, `lint`, `typecheck`, `test`, `build`, `e2e`, `e2e:failed`, `perf`. Node 24, then `npm ci`. On your own machine, `npx playwright install chromium` once.

## Gotchas

- The agent can't change GitHub repo settings (Pages source, environments, branch rules). Ask the user early, with the exact setting and a link to it.
- reddit.com is blocked from cloud sessions. Ask for the article's own link.
- Cloud sessions have Chromium under `/opt/pw-browsers`; e2e and perf find it (`tools/chromium.ts`). Layout screenshots only come from `npm run screens` (after a build). There is no GPU, so frame rate can't be measured there.
