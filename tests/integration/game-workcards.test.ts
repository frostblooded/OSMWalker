// Chance cards at work as timed moments, with real Sofia streets: a card after a paid shift asks you, your tap plays it, and untouched he picks as he would away.
import { describe, expect, it, vi } from "vitest";
import { MOMENT_S } from "../../src/core/moments";
import type { Game } from "../../src/game/game";
import { CAFE, game, run, START, tick } from "../support/game";

// Every paid shift brings the double-shift card, so the test needn't hunt for the dice.
vi.mock("../../src/core/workCards", async (load) => {
  const W = await load<typeof import("../../src/core/workCards")>();
  return { ...W, drawCard: (wage: number) => (wage > 0 ? { card: W.CARDS.find((c) => c.id === "double")!, wage } : null) };
});

describe("chance cards at work in the game", () => {
  /** A skint game, so he works a shift at the cafe; runs until the card opens. */
  const toCard = async () => {
    const { g } = game({ places: [CAFE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.cents = 0;
    for (let i = 0; i < 600 && !g.moment; i++) g.step(1);
    expect(g.moment?.m.id).toBe("work-double");
    return g;
  };
  const last = (g: Game) => g.stats.history.entries.at(-1)!.text;

  it("asks you after a paid shift, and your tap plays the choice", async () => {
    const g = await toCard();
    expect(g.moment!.m.ask).toBe("At work: The boss asks him to cover a double shift.");
    expect(g.moment!.m.options.map((o) => o.label)).toEqual(["Take it", "Go home"]);
    g.settleMoment("safe");
    await tick();
    expect(last(g)).toBe("⏱ At work: The boss asks him to cover a double shift. Go home: he went home on time (+3 mood)");
  });

  it("lets him decide when the timer runs out", async () => {
    const g = await toCard();
    run(g, MOMENT_S);
    await tick();
    expect(g.moment).toBeNull();
    expect(last(g)).toMatch(/^⏱ At work: The boss asks him to cover a double shift\. Decided by himself: /);
  });
});
