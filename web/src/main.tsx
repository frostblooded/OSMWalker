import { render } from "preact";
import { App } from "./ui/App";

render(<App />, document.getElementById("app")!);
document.getElementById("boot")?.remove();
// The perf job times the game from navigation to this mark.
performance.mark("osmwalker:ready");
