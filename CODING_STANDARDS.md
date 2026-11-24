# Coding standards

Read at review time, not while building. Mechanical rules live in checks
(`cargo fmt`, `cargo clippy -D warnings`, the tests); this file holds the
judgement calls no check can make.

## The checks

One command runs them all, and the pre-push hook (`.githooks/pre-push`, turn
it on once per clone with `git config core.hooksPath .githooks`) runs it too:

```sh
cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

## The review step

Every PR gets a review before it is merged:

1. Once the PR is open, start a fresh review agent in the background (Agent
   tool, general-purpose) and run the checks while it works. The agent does a
   **ponytail review**: it follows `.claude/skills/ponytail-review/SKILL.md`
   (level `full`). Give it only `git diff origin/master...HEAD`, this file and
   the PR body. Ask for ponytail findings and violations of the rules below,
   each with file, line and the rule or reason, and nothing else.
2. Fix each finding, or say in the PR why it stands.
3. Repeat until a review comes back empty. Then merge `master` into the
   branch if it moved, run the checks, push, and merge it by hand.

## Rules

1. **Tests first.** A behaviour change comes with a test that fails without
   it: unit tests next to the code (`#[cfg(test)]`) for logic, integration
   tests in `tests/` for systems working together (they use the crate
   through `src/lib.rs`).
2. **Perf numbers.** A change to anything that runs while the game plays puts
   before and after numbers in the PR (startup time, frame time, memory,
   network, as fits the change). A new dependency says what it adds to build
   time and binary size and why a smaller one won't do.
3. **Fits in.** New code matches the code around it: naming, comment
   density, a short comment at the top of every new file saying what it does.
4. **Look back before building.** Before building something the TypeScript
   version had, read its page in `docs/legacy/` and say in the PR what is
   kept, changed or left out.
