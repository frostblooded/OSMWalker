// Screens whose code loads after startup, or as soon as one is needed, so it
// stays off the startup path. The browser keeps a failed import failed, so a
// failure (offline, or a deploy replaced the files) is logged once and the
// screen asks for a reload.
import { useRef, useState } from "preact/hooks";

/** The module `load` brings, once `start` has been called and it has arrived; `failed` once it couldn't. `start` loads it only once. */
export function useLazy<T>(load: () => Promise<T>, what: string, warn: (text: string) => void): { mod: T | null; failed: boolean; start: () => void } {
  const [mod, setMod] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const started = useRef(false);
  const start = () => {
    if (started.current) return;
    started.current = true;
    load().then(
      (m) => setMod(() => m),
      (e: Error) => {
        warn(`Couldn't load ${what}: ${e.message}`);
        setFailed(true);
      },
    );
  };
  return { mod, failed, start };
}

/** Stands in for a screen while its code loads, or says that it couldn't. */
export const Loading = ({ failed }: { failed: boolean }) =>
  failed ? <div class="notice error">✖ Couldn't load this screen. Check your connection and reload the page.</div> : <p class="dim small">Loading…</p>;
