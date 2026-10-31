// Timed moments with real Sofia streets and fixed dice: asking at a place, holding him still, his own pick, the timer setting, the catch-up's match and Debug.
import { describe, expect, it } from "vitest";
import { MOMENT_S, MOMENT_TIMERS } from "../../src/core/moments";
import { momentDice } from "../../src/core/placeMoments";
import { Stats } from "../../src/core/stats";
import { DEBUG_MOMENTS, type Game } from "../../src/game/game";
import { CAFE, game, HOUR, reopen, run, START, tick } from "../support/game";

describe("timed moments", () => {
  const withMoments = () => game({ places: [CAFE], moments: true });
  /** Runs until the cafe's moment opens. */
  const toMoment = (g: Game) => {
    for (let i = 0; i < 400 && !g.moment; i++) g.step(1);
    expect(g.moment?.m.id).toBe("cafe");
  };

  it("asks at the place he starts an activity at, holds him still, and your tap picks its outcome", async () => {
    const { g } = withMoments();
    await g.startCity("Sofia, Bulgaria", ...START, null);
    toMoment(g);
    expect(g.moment!.m.ask).toBe("The barista at Cafe Near is swamped. Pour your own latte art?");
    expect(g.moment!.total).toBe(MOMENT_S);
    const at = g.walker!.position();
    g.step(1);
    expect(g.walker!.position()).toEqual(at);
    g.settleMoment("nope");
    expect(g.moment).not.toBeNull();
    g.settleMoment("heart");
    await tick();
    expect(g.moment).toBeNull();
    expect(g.stats.history.entries.at(-1)!.text).toBe("☕ Poured perfect latte art at Cafe Near; the barista clapped");
  });

  it("takes his own pick when the timer runs out, or the page is left", async () => {
    const { g } = withMoments();
    await g.startCity("Sofia, Bulgaria", ...START, null);
    toMoment(g);
    run(g, MOMENT_S);
    await tick();
    expect(g.moment).toBeNull();
    expect(g.stats.history.entries.some((e) => e.text.startsWith("☕ Decided by himself:"))).toBe(true);

    const again = withMoments().g;
    await again.startCity("Sofia, Bulgaria", ...START, null);
    toMoment(again);
    again.leave();
    await tick();
    expect(again.moment).toBeNull();
    expect(again.stats.history.entries.some((e) => e.text.startsWith("☕ Decided by himself:"))).toBe(true);
  });

  it("goes as in the catch-up when untouched: same line, money and free item", async () => {
    const { g } = withMoments();
    await g.startCity("Sofia, Bulgaria", ...START, null);
    // Every result of the cafe's moment gives a free item, so its dice matter.
    const cafe = g.stats.placeMoments.cafe!;
    const outcomes = Object.fromEntries(Object.entries(cafe.outcomes).map(([k, o]) => [k, { ...o, item: "improvised" as const }]));
    g.stats.placeMoments = { ...g.stats.placeMoments, cafe: { ...cafe, outcomes } };
    toMoment(g);
    const away = Stats.fromJSON(JSON.parse(JSON.stringify(g.stats.toJSON())));
    away.placeMoments = g.stats.placeMoments;
    const t = g.stats.now();
    away.byHimself(away.placeMoments.cafe!, "Cafe Near", momentDice(t, "Cafe Near"));
    // Watched, it settles when the timer runs out.
    g.stats.now = () => t + MOMENT_S;
    run(g, MOMENT_S);
    await tick();
    const items = (s: Stats) => [...Object.values(s.gear), ...s.bag].map((i) => i?.name);
    expect(g.stats.history.entries.at(-1)!.text).toBe(away.history.entries.at(-1)!.text);
    expect([g.stats.cents, items(g.stats)]).toEqual([away.cents, items(away)]);
  });

  it("never opens with the timer Off, and steps through the timers in Settings, kept on the device", async () => {
    const { g, storage } = withMoments();
    expect(MOMENT_TIMERS.at(-1)).toBe(0);
    while (g.momentS !== 0) g.nextMomentTimer();
    await g.startCity("Sofia, Bulgaria", ...START, null);
    for (let i = 0; i < 400; i++) {
      g.step(1);
      expect(g.moment).toBeNull();
    }
    await tick();
    expect(g.stats.history.entries.some((e) => e.text.startsWith("☕ Decided by himself:"))).toBe(true);
    expect(game({ storage }).g.momentS).toBe(0);
    g.nextMomentTimer();
    expect(g.momentS).toBe(MOMENT_TIMERS[0]);
  });

  it("gives you a mini-game's score so far when time runs out mid-game", async () => {
    const { g } = withMoments();
    await g.startCity("Sofia, Bulgaria", ...START, null);
    const m = { id: "x", icon: "", ask: "", game: "taps" as const, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], default: "b" };
    const p = g.ask(m);
    g.play("a");
    run(g, MOMENT_S);
    expect(await p).toEqual({ id: "a", you: true });
  });

  it("the Debug button opens a plain choice, then each mini-game in turn", async () => {
    const { g } = withMoments();
    await g.startCity("Sofia, Bulgaria", ...START, null);
    const kinds: string[] = [];
    for (let i = 0; i < DEBUG_MOMENTS.length + 1; i++) {
      g.debugMoment();
      kinds.push(g.moment!.m.game ?? "");
      expect(g.moment!.m.ask).not.toContain("{PLACE}");
      g.settleMoment(null);
    }
    expect(kinds).toEqual([...DEBUG_MOMENTS, ""]);
  });

  it("takes his own pick at once while the away card is open, so nothing covers it", async () => {
    const { again } = await reopen(2 * HOUR, { moments: true } as Parameters<typeof game>[0]);
    expect(again.away).not.toBeNull();
    const m = { id: "x", icon: "", ask: "", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], default: "b" };
    expect(await again.ask(m)).toEqual({ id: "b", you: false });
    expect(again.moment).toBeNull();
    again.dismissAway();
    void again.ask(m);
    expect(again.moment).not.toBeNull();
  });

  it("lets another moment that comes while one is open take his own pick at once", async () => {
    const { g } = withMoments();
    await g.startCity("Sofia, Bulgaria", ...START, null);
    const m = { id: "x", icon: "", ask: "", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], default: "b" };
    const first = g.ask(m);
    expect(await g.ask(m)).toEqual({ id: "b", you: false });
    g.settleMoment("a");
    expect(await first).toEqual({ id: "a", you: true });
  });
});
