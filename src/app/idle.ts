// Small helpers for keeping the page responsive while it starts up.

/** Lets the browser draw and handle taps between bits of work. */
export const yieldNow = () => new Promise<void>((ok) => setTimeout(ok, 0));

/** Runs `f` once the page has nothing else to do. */
export const whenIdle = (f: () => void) => (window.requestIdleCallback ?? ((g: () => void) => setTimeout(g, 200)))(f);
