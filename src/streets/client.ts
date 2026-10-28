// The game's side of the streets worker: one promise per cell request.
import type { Tile } from "../core/geo";
import type { Net, Reply, Request } from "./protocol";
import type { LoadOpts, Loaded } from "./source";

export type LoadFn = (tile: Tile, opts: LoadOpts) => Promise<Loaded>;

export class StreetClient {
  net: Net | null = null;
  onProblem: (text: string) => void = () => {};
  private worker: Worker;
  private next = 1;
  private waiting = new Map<number, (r: Loaded) => void>();

  constructor() {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e: MessageEvent<Reply>) => {
      const msg = e.data;
      if ("problem" in msg) return this.onProblem(msg.problem);
      this.net = msg.net;
      this.waiting.get(msg.id)?.(msg.result);
      this.waiting.delete(msg.id);
    };
    this.worker.onerror = (e) => this.onProblem(`Streets worker failed: ${e.message}`);
  }

  load: LoadFn = (tile, opts) =>
    new Promise((ok) => {
      const id = this.next++;
      this.waiting.set(id, ok);
      this.worker.postMessage({ id, tile, opts } satisfies Request);
    });

  clearCache(): void {
    this.worker.postMessage({ id: 0, clear: true } satisfies Request);
  }
}
