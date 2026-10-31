// Little moments in the running game: one fills each quiet spell, shows as his speech bubble and waits while a timed moment is open.
import { describe, expect, it } from "vitest";
import { BEAT_MAX_S, SAY_S } from "../../src/core/beats";
import { look } from "../../src/game/hud";
import { game, START } from "../support/game";

describe("little moments", () => {
  it("fill a quiet spell with a History line and words in his bubble, then let it go", async () => {
    const { g } = game({ beats: true, places: [] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    const lines = () => g.stats.history.entries.map((e) => e.text);
    let said = "";
    let quiet = 0;
    let longest = 0;
    for (let i = 0; i < 6 * BEAT_MAX_S && !said; i++) {
      const before = lines().length;
      g.step(1);
      said = g.saidNow();
      quiet = lines().length === before ? quiet + 1 : 0;
      longest = Math.max(longest, quiet);
    }
    expect(said).not.toBe("");
    expect(g.stats.beats.seen.size).toBeGreaterThan(0);
    // History is never quiet for longer than the longest spell.
    expect(longest).toBeLessThanOrEqual(BEAT_MAX_S + 1);
    expect(look(g).say).toBe(said);
    for (let i = 0; i < SAY_S; i++) g.step(1);
    expect(g.saidNow()).toBe("");
    expect(look(g).say).toBeUndefined();
  });

  it("never come while a timed moment is open", async () => {
    const { g } = game({ beats: true, moments: true, places: [] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.debugMoment();
    expect(g.moment).not.toBeNull();
    const seen = g.stats.beats.seen.size;
    g.stats.beats.leftS = 0;
    g.step(0.5);
    expect(g.moment).not.toBeNull();
    expect(g.stats.beats.seen.size).toBe(seen);
  });

  it("keep his bubble up for SAY_S real seconds during a boost", async () => {
    const { g } = game({ beats: true, places: [] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.boostS = 600;
    g.debugBeat();
    g.step(0.5);
    expect(g.saidNow()).not.toBe("");
    for (let i = 0; i < 2 * SAY_S - 2; i++) g.step(0.5);
    expect(g.saidNow()).not.toBe("");
    g.step(1);
    expect(g.saidNow()).toBe("");
  });
});
