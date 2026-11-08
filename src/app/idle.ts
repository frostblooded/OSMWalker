// Small helpers for keeping the page responsive while it starts up.

/** Lets the browser draw and handle taps between bits of work. */
export const yieldNow = () => new Promise<void>((ok) => setTimeout(ok, 0));

/** Waits at most this long for the page to go idle, so a page that is never idle still gets there. */
export const IDLE_MAX_MS = 3000;

/** Runs `f` once the page has nothing else to do, or after IDLE_MAX_MS. */
export function whenIdle(f: () => void): void {
  if ("requestIdleCallback" in window) requestIdleCallback(() => f(), { timeout: IDLE_MAX_MS });
  else setTimeout(f, 200);
}
