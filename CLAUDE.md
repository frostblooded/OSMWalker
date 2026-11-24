# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

OSM Walker: a game about a little character on real OpenStreetMap streets,
being rebuilt from scratch in Rust as a local app. The code is still a bare
`cargo new` binary (`src/main.rs`, no dependencies); the game is built up
from here by hand.

## Commands

```sh
cargo run              # play
cargo test             # all tests
cargo test <name>      # tests whose name contains <name>
```

The checks, before every push:

```sh
cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

## Docs

Everything besides the code lives in `docs/`:

- `docs/coding-standards.md`: the review step every PR goes through (a
  ponytail review following `docs/ponytail-review/SKILL.md`, repeated until a
  round comes back empty) and the rules it checks. PR bodies follow
  `docs/pull_request_template.md`.
- `docs/design-research.md`: the game design research report. The design
  rules drawn from it are listed in `docs/legacy/game-design.md`.
- `docs/legacy/`: how the earlier TypeScript web version worked (streets,
  routing, orders and economy, saves, map, UI, network, performance, tests),
  with screenshots of every screen. Start at `docs/legacy/README.md`. Read the
  matching page before building anything the old version had, and say in the
  PR what is kept, changed or left out.

## The old code

It is in git history, not in the tree:

- `a87edab`: the last TypeScript version. Every path in `docs/legacy/` is a
  path at this commit: `git show a87edab:src/core/walker.ts`.
- `2d468a4`: the big version before most features were cut.
