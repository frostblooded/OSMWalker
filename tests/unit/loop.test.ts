// @vitest-environment happy-dom
// The loop that ticks the game while the page shows.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Loop } from "../../src/app/loop";
import type { Game } from "../../src/game/game";
import type { MapScene } from "../../src/map/scene";

const fakes = () => {
  const game = { step: vi.fn(), wake: vi.fn(async () => {}), leave: vi.fn() };
  const scene = { pxPerSec: 0, draw: vi.fn() };
  return { game, scene, loop: new Loop(game as unknown as Game, scene as unknown as MapScene) };
};
const showAgain = () => document.dispatchEvent(new Event("visibilitychange"));

describe("Loop", () => {
  afterEach(() => vi.useRealTimers());

  it("stays stopped after stop(), even when the page shows again", () => {
    vi.useFakeTimers();
    const { game, loop } = fakes();
    loop.start();
    vi.advanceTimersByTime(1000);
    expect(game.step).toHaveBeenCalled();
    loop.stop();
    game.step.mockClear();
    showAgain();
    vi.advanceTimersByTime(1000);
    expect(game.step).not.toHaveBeenCalled();
    dispatchEvent(new Event("pagehide"));
    expect(game.leave).toHaveBeenCalledTimes(1); // the stop's own save, not the page leaving
  });
});
