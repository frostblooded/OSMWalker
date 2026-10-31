# Coding standards

Read at review time, not while building. Mechanical rules live in checks
(Biome, `tsc`, the tests); this file holds the judgement calls no check can
make.

## The review step

Every PR gets a review before it is merged:

1. With the PR open and `npm run verify` passed on its head (pushes to a
   branch only need `npm run check`), start a fresh review agent (Agent tool,
   general-purpose) for a **ponytail review**: it uses the ponytail skill
   (level `full`), or where the skill isn't loaded, reviews in its spirit
   (lean, simple, nothing redundant, clear wording). Give it only
   `git diff origin/master...HEAD`, this file and the PR body. Ask for
   ponytail findings and violations of the rules below, each with file,
   line and the rule or reason, and nothing else.
2. Fix each finding, or say in the PR why it stands.
3. Repeat until a review comes back empty. Then merge `master` into the
   branch if it moved, `npm run verify`, push, and merge it by hand. The
   branch holds the newest `master`, so the merge deploys the very code
   that passed.

## Rules

1. **Help.** A change to a mechanic, stat, price or speed updates
   `public/data/help.txt` in the same PR, and the page reads true for the
   new behaviour. Numbers come from code through `src/ui/help.ts`
   placeholders, never typed by hand.
2. **Perf numbers.** A change to anything that ships to players puts
   before and after numbers from `npm run perf` in the PR body (transfer,
   first paint, ready, main thread busy). A new dependency names
   its gzip size and why a smaller one won't do.
3. **UI.** A changed screen follows `docs/ui-guidelines.md`: cards with an
   icon and heading, key/value rows, `:root` colour tokens with their fixed
   meanings, no wall of text. A new screen or sheet gets a step in
   `tests/e2e/layout.spec.ts`.
4. **Tests first.** A behaviour change comes with a test that fails without
   it: unit for logic, integration for systems together, e2e for a player
   flow.
5. **Saves.** A change to what is saved adds a repair in
   `src/game/saveFile.ts` and a test that loads an old save.
6. **Fits in.** New code matches the code around it: naming, comment
   density, a header comment on every new file saying what it does, money
   in cents, randomness through `src/core/rng.ts`.
7. **Map.** A new module or layer, or a new link between files that no
   import shows, updates `docs/architecture.md`.
