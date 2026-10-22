# OSM Walker

## Workflow rules

These mirror the Claude project instructions. Keep both in sync.

- **CLAUDE.md**: keep in sync with the project instructions. Push CLAUDE.md changes directly to `master`, no PR.
- **All other changes**: open a PR into `master` with auto-merge enabled, so it merges once CI and tests pass.
- **Skills**: caveman and ponytail must be on in every session (default level `full` for both). Matt Pocock's skills are installed too. All three are enabled as plugins in `.claude/settings.json`; caveman and ponytail switch themselves on via their SessionStart hooks.
- **Clarify first**: before doing anything the user asks, grill them with multiple-choice questions until it is clear exactly what they want and how.

## Project

<!-- TODO: fill in once the app exists -->

- **What it is**: TBD
- **Stack**: TBD
- **Setup**: TBD
- **Run**: TBD
- **Test**: TBD
- **Lint/format**: TBD
