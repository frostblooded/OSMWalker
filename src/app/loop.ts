// Runs the game while the page is visible. Ticks come a few times a second;
// between them his figure glides (a CSS transition), so steps can be a few
// pixels without looking jumpy, and an idle main thread saves battery.
import type { Game } from "../game/game";
import type { MapView } from "../map/mapView";

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
  private lastPx: { x: number; y: number } | null = null;
  private pxPerSec = 0;
  /** Called after every tick, for the screens. */
  onTick: () => void = () => {};

  constructor(
    private readonly game: Game,
    private readonly view: () => MapView | null,
  ) {
    document.addEventListener("visibilitychange", () => (document.hidden ? this.pause() : this.start()));
    addEventListener("pagehide", () => this.game.save());
  }

  start(): void {
    if (this.timer !== null || document.hidden) return;
    this.last = performance.now();
    this.schedule(0);
  }

  /** He waits where he is while the page is hidden. */
  pause(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.game.save();
  }

  private schedule(ms: number): void {
    this.timer = setTimeout(() => this.tick(), ms);
  }

  private tick(): void {
    const now = performance.now();
    const dt = (now - this.last) / 1000;
    this.last = now;
    this.game.step(dt);
    const next = 1000 / tickHz(this.pxPerSec);
    this.draw(dt, next);
    this.onTick();
    this.schedule(next);
  }

  /** `glideMs`: time until the next tick, which his figure takes to glide to where it is now. */
  private draw(dt: number, glideMs: number): void {
    const v = this.view();
    const w = this.game.walker;
    if (!v || !w) return;
    const at = w.position();
    v.autoFollow = this.game.cameraFollows;
    v.setHim(at, !w.needsData() && !w.isResting(), glideMs);
    v.setGoal(this.game.goalTarget());
    v.setTrip(w.travel ? w.travel.path : null);
    const h = this.game.stats.history;
    v.setTrail(`${h.id}:${h.trailVersion}`, () => h.segments());
    // The route line starts at him, so it is redrawn once a second while he walks, not every tick.
    const routeOn = this.game.showRoute && !w.travel && !!w.goal;
    v.setRoute(routeOn ? `${w.goal}:${w.toNode}:${w.route.length}:${Math.floor(performance.now() / 1000)}` : "", () => w.routeLine());
    v.setArea(this.game.showCityArea && !w.travel ? w.bounds : null, this.game.cityOutline);
    // How fast he moves on screen, smoothed, sets the next tick's delay.
    const p = v.map.project([at[1], at[0]]);
    if (this.lastPx && dt > 0) {
      const speed = Math.hypot(p.x - this.lastPx.x, p.y - this.lastPx.y) / dt;
      this.pxPerSec = 0.7 * this.pxPerSec + 0.3 * speed;
    }
    this.lastPx = { x: p.x, y: p.y };
  }
}
