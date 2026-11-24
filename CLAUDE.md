# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

OSM Walker: a game about a little character on real OpenStreetMap streets,
being rebuilt from scratch in Rust as a local app. The repo is currently a
plain `cargo new` binary with no dependencies; the game is built up from here
by hand.

## Commands

```sh
cargo run                        # play
cargo test                       # all tests
cargo test greets_the_world      # one test, by name (substring match)
cargo test --test <file>         # one integration test file in tests/
git config core.hooksPath .githooks   # once per clone: checks before every push
```

The checks, run by `.githooks/pre-push` and required before a push:

```sh
cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

The hook checks the files on disk, so it refuses a push with uncommitted
changes or when the pushed commit is not `HEAD`.

## Layout

- `src/lib.rs` holds the game's code; `src/main.rs` only starts it
  (`osm_walker::...`). Keep logic in the library so integration tests in
  `tests/` can use it. Unit tests sit next to the code in `#[cfg(test)]`.
- `CODING_STANDARDS.md`: the review step every PR goes through (a ponytail
  review following `.claude/skills/ponytail-review/SKILL.md`, repeated until a
  round comes back empty) and the rules it checks. PRs follow
  `.github/pull_request_template.md`.
- `docs/design-research.md`: the game design research report. Its design
  rules are listed in `docs/legacy/game-design.md`.
- `docs/legacy/`: how the earlier TypeScript web version worked (streets,
  routing, orders and economy, saves, map, UI, network, performance, tests),
  with screenshots of every screen. Start at `docs/legacy/README.md`. Read the
  matching page before building anything the old version had, and say in the
  PR what is kept, changed or left out (rule 4 in `CODING_STANDARDS.md`).

## The old code

It is in git history, not in the tree:

- `a87edab`: the last TypeScript version. Every path in `docs/legacy/` is a
  path at this commit: `git show a87edab:src/core/walker.ts`.
- `2d468a4`: the big version before most features were cut.
