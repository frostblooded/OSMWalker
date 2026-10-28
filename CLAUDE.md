# OSM Walker

## Workflow rules

These mirror the Claude project instructions. Keep both in sync.

- **CLAUDE.md**: keep in sync with the project instructions. Push CLAUDE.md changes directly to `master`, no PR.
- **All other changes**: no auto-merge. Run the tests manually before pushing, open a PR into `master`, and once CI passes merge it into `master` manually.
- **Web build**: after every PR merge, `.github/workflows/web.yml` builds the game, deploys it to GitHub Pages and plays the live site (the "Play the live site" job). This is the main way the game is played, so check the deploy succeeds and the game loads.
- **Testing**: use TDD (write the failing test first). Cover logic with unit tests, scenes and systems working together with integration tests, and player flows in the browser with e2e tests. Keep the CI test run fast: parallel jobs, caching, and whatever else it takes.
- **Help pages**: the game has an in-game Help page (in the menu) with detailed subpages explaining every mechanic and stat. Every change that adds or changes a mechanic or stat must update the Help pages in the same PR.
- **Skills**: caveman and ponytail must be on in every session (default level `full` for both). Matt Pocock's skills are installed too. All three are enabled as plugins in `.claude/settings.json`; caveman and ponytail switch themselves on via their SessionStart hooks.
- **UI**: every screen follows `docs/ui-guidelines.md` (Cozy game look, cards with icons and headings, key/value rows, zebra-striped lists, collapsible detail, fixed colour meanings, 48 CSS px tap targets, native 1:1 scrolling). Never dump plain text. Run its checklist on every UI change.
- **Performance first**: performance is a top priority: loading, startup, frame rate, memory and network on mobile browsers. Consider the performance impact of every change, measure it (before and after, with numbers in the PR), and make whatever changes are needed to keep the game fast.
- **Clarify first**: before doing anything the user asks, grill them with multiple-choice questions until it is clear exactly what they want and how. Whenever the user has to choose, ask with interactive multiple-choice decision cards (`request_decision`, one card per question), never a plain-text list. Do not use custom HTML widgets (`post_widget` / `show_widget`) for questions: their buttons cannot send answers back.

## Project

- **What it is**: OSM Walker, a tamagotchi-like mobile/browser game. A little character walks real OpenStreetMap streets at 200 m per minute, picking a random direction at each intersection and turning around at dead ends. He walks only while the app is open; while it is closed he waits where he is and carries on from there on reopen. The player picks a starting city by search; "New city" resets only after typing RESET. The UI must stay big and touch-friendly for small phone screens.
- **Stack**: TypeScript (strict), Vite, Preact, MapLibre GL with OpenFreeMap (Liberty vector tiles) on GitHub Pages. Streets come from OpenFreeMap tiles decoded in a Web Worker and cached in IndexedDB, with the Overpass API as backup; Photon (Nominatim as backup) for city search-as-you-type. A service worker caches the game for offline play. Money is euros kept in cents. Help text is `public/data/help.txt`, with numbers filled from code in `src/ui/help.ts`. Tests use Vitest (unit + integration) and Playwright (e2e); `tests/perf/perf.mjs` checks the perf budgets.
- **Setup**: Node 24, then `npm ci`.
- **Run**: `npm run dev`, or play the deployed game at https://frostblooded.github.io/OSMWalker/.
- **Test**: `npm run typecheck && npm test` (unit + integration), then `npm run build && npm run e2e && npm run perf`. CI (`.github/workflows/web.yml`) runs everything on every PR and deploys master to Pages.
- **Lint/format**: none yet.
