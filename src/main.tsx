import { render } from "preact";
import { App } from "./ui/App";
// Latin-only subsets of the Cozy style's two fonts (about 16 KB each), shown with swap so text never waits on them.
import "@fontsource/fredoka/latin-600.css";
import "@fontsource/nunito/latin-700.css";
import "@fontsource/nunito/latin-800.css";
import "./ui/app.css";

render(<App />, document.getElementById("app")!);
document.getElementById("boot")?.remove();
// The perf job times the game from navigation to this mark.
performance.mark("osmwalker:ready");

// Offline play and instant restarts; registered after the game is up so it doesn't compete with first load.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  addEventListener("load", () => {
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
    });
  });
}
