import { render } from "preact";
import { App } from "./ui/App";
import "./ui/app.css";

render(<App />, document.getElementById("app")!);
document.getElementById("boot")?.remove();
// The perf job times the game from navigation to this mark.
performance.mark("osmwalker:ready");

// Offline play and instant restarts; registered after the game is up so it doesn't compete with first load.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => undefined);
    // What this first visit fetched before the worker ran, so it is there offline too.
    void navigator.serviceWorker.ready.then((reg) => {
      const page = new URL("./", location.href).href;
      reg.active?.postMessage({ cache: [page, ...performance.getEntriesByType("resource").map((e) => e.name)] });
    });
  });
}
