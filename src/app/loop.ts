// Runs the game while the page is visible. Ticks come a few times a second;
// between them his figure glides (a CSS transition), so steps can be a few
// pixels without looking jumpy, and an idle main thread saves battery. When
// the page shows again, Game.wake turns the time it was hidden into a boost
// (see core/boost.ts).
import type { Game } from "../game/game";
import type { MapScene } from "../map/scene";

/** Most screen pixels he may move between two ticks. */
export const MAX_STEP_PX = 4;
export const MIN_HZ = 2;
export const MAX_HZ = 10;

/** Ticks per second that keep each step under MAX_STEP_PX at `pxPerSec`. */
export function tickHz(pxPerSec: number): number {
  return Math.min(Math.max(pxPerSec / MAX_STEP_PX, MIN_HZ), MAX_HZ);
}

export class Loop {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private last = 0;
  /** Called after every tick, for the screens. */
  onTick: () => void = () => {};
  private readonly onVisibility = () => (document.hidden ? this.pause() : this.start());
  private readonly onHide = () => this.game.leave();

  constructor(
    private readonly game: Game,
    private readonly scene: MapScene,
  ) {
    document.addEventListener("visibilitychange", this.onVisibility);
    addEventListener("pagehide", this.onHide);
  }

  start(): void {
    if (this.timer !== null || document.hidden) return;
    void this.game.wake();
    this.last = performance.now();
    this.schedule(0);
  }

  /** He waits where he is while the page is hidden. */
  pause(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.game.leave();
  }

  /** For good (the game screen closed): pauses and stops listening, so the page showing again can't restart it. */
  stop(): void {
    this.pause();
    document.removeEventListener("visibilitychange", this.onVisibility);
    removeEventListener("pagehide", this.onHide);
  }

  private schedule(ms: number): void {
    this.timer = setTimeout(() => this.tick(), ms);
  }

  private tick(): void {
    const now = performance.now();
    const dt = (now - this.last) / 1000;
    this.last = now;
    this.game.step(dt);
    // How fast he moves on screen sets the next tick's delay.
    const next = 1000 / tickHz(this.scene.pxPerSec);
    this.scene.draw(dt, next);
    this.onTick();
    this.schedule(next);
  }
}
