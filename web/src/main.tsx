import { render } from "preact";
import { App } from "./ui/App";
import "./ui/app.css";

render(<App />, document.getElementById("app")!);
document.getElementById("boot")?.remove();
// The perf job times the game from navigation to this mark.
performance.mark("osmwalker:ready");
