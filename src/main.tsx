import { render } from "preact";
import { loadData, whenIdle } from "./app/data";
import { App } from "./ui/App";
import { HELP_URL } from "./ui/HelpSheet";
// Latin-only subsets of the Cozy style's two fonts (about 16 KB each), shown with swap so text never waits on them.
import "@fontsource/fredoka/latin-600.css";
import "@fontsource/nunito/latin-700.css";
import "@fontsource/nunito/latin-800.css";
import "./ui/app.css";

// The built page loads the stylesheet without blocking the boot screen (see vite.config.ts); draw once it is in.
const css = document.querySelector<HTMLLinkElement>('link[rel="stylesheet"][onload]');
if (css && css.media !== "all") await new Promise((ok) => ["load", "error"].forEach((t) => css.addEventListener(t, ok, { once: true })));

render(<App />, document.getElementById("app")!);
document.getElementById("boot")?.remove();
// The perf job times the game from navigation to this mark: the first frame of
// the game is on screen (its first layout, with the emoji font, is part of getting ready).
requestAnimationFrame(() => setTimeout(() => performance.mark("osmwalker:ready")));

// Offline play and instant restarts; registered after the game is up so it doesn't compete with first load.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  // Starting the worker is real work on the page, so it waits until the game data has
  // loaded and the page is idle, rather than landing on top of the loading.
  const register = () => {
    navigator.serviceWorker.register("./sw.js").catch(() => undefined);
    // What this first visit fetched without the worker (before it ran, or before it took
    // control of the page, like the city lists loading at idle), so it is there offline
    // too. Once the worker controls the page every request goes through it and nothing
    // more is sent.
    void navigator.serviceWorker.ready.then((reg) => {
      const missed = (list: PerformanceEntryList) => (list as PerformanceResourceTiming[]).filter((e) => !e.workerStart).map((e) => e.name);
      const send = (urls: string[]) => urls.length && reg.active?.postMessage({ cache: urls });
      send([new URL("./", location.href).href, ...missed(performance.getEntriesByType("resource"))]);
      new PerformanceObserver((list) => send(missed(list.getEntries()))).observe({ type: "resource" });
      // The code that loads only when needed (Help, a reopen's dilemma and its away sheet, the Stats sheet, the Diary, the farewell letter, the Collection, the Care package sheet, the map icons and the made-up places) is fetched now
      // too, so the worker keeps it for offline play after every deploy.
      void import("./ui/help").catch(() => undefined);
      void fetch(HELP_URL).catch(() => undefined);
      void import("./core/dilemmas").catch(() => undefined);
      void import("./ui/CollectionSheet").catch(() => undefined);
      void import("./ui/AwaySheet").catch(() => undefined);
      void import("./ui/StatsSheet").catch(() => undefined);
      void import("./ui/DiarySheet").catch(() => undefined);
      void import("./ui/Family").catch(() => undefined);
      void import("./ui/CareSheet").catch(() => undefined);
      void import("./map/icons").catch(() => undefined);
      void import("./core/poiGen").catch(() => undefined);
      void import("./core/iso2").catch(() => undefined);
    });
  };
  const later = () => whenIdle(register);
  addEventListener("load", () => whenIdle(() => void loadData().then(later, later)));
}
