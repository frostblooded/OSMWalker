# OSM Walker

## Workflow rules

These mirror the Claude project instructions. Keep both in sync.

- **CLAUDE.md**: keep in sync with the project instructions. Push CLAUDE.md changes directly to `master`, no PR.
- **All other changes**: no auto-merge. Run the tests manually before pushing, open a PR into `master`, and once CI passes merge it into `master` manually.
- **Web build**: after every PR merge, a GitHub Action exports the Godot web build and deploys it to GitHub Pages. This is the main way the game is played, so check the deploy succeeds and the game loads.
- **Testing**: use TDD (write the failing test first). Cover logic with unit tests, scenes and systems working together with integration tests, and player flows in the browser with e2e tests. Keep the CI test run fast: parallel jobs, caching, and whatever else it takes.
- **Help pages**: the game has an in-game Help page (in the menu) with detailed subpages explaining every mechanic and stat. Every change that adds or changes a mechanic or stat must update the Help pages in the same PR.
- **Skills**: caveman and ponytail must be on in every session (default level `full` for both). Matt Pocock's skills are installed too. All three are enabled as plugins in `.claude/settings.json`; caveman and ponytail switch themselves on via their SessionStart hooks.
- **Clarify first**: before doing anything the user asks, grill them with multiple-choice questions until it is clear exactly what they want and how. Whenever the user has to choose, ask with interactive multiple-choice decision cards (`request_decision`, one card per question), never a plain-text list. Do not use custom HTML widgets (`post_widget` / `show_widget`) for questions: their buttons cannot send answers back.

## Project

- **What it is**: OSM Walker, a tamagotchi-like mobile/browser game. A little character walks real OpenStreetMap streets at 200 m per minute, picking a random direction at each intersection and turning around at dead ends. He walks only while the app is open; while it is closed he waits where he is and carries on from there on reopen. The player picks a starting city by search; "New city" resets only after typing RESET. The UI must stay big and touch-friendly for small phone screens.
- **Stack**: Godot 4.7.2, GDScript only, gl_compatibility renderer, single-threaded web export (GitHub Pages). OSM raster tiles, Overpass API for streets, Nominatim for city search. Tests use GUT 9.7.1 (vendored in `addons/gut`) and Playwright for browser e2e.
- **Setup**: install Godot 4.7.2 and run `godot --headless --import` once.
- **Run**: open the project in Godot and press Play, or play the deployed web build at https://frostblooded.github.io/OSMWalker/.
- **Test**: `godot --headless -s addons/gut/gut_cmdln.gd -gexit` (unit + integration). E2E: export the "Web" preset to `build/web`, then run `tests/e2e/run.sh`. CI (`.github/workflows/godot.yml`) runs everything on every PR and deploys master to Pages.
- **Lint/format**: none yet.
