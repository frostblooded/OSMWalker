// The streets worker: fetches, decodes and caches street cells off the main
// thread, so a big tile never costs the game a frame.
import { Api } from "../net/api";
import { IdbStore } from "./idb";
import type { Reply, Request } from "./protocol";
import { loadCell } from "./source";

const post = (msg: Reply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);
const api = new Api();
api.onProblem = (problem) => post({ problem });
let store: IdbStore | null = null;
try {
  store = new IdbStore();
} catch {
  post({ problem: "No on-device storage: streets are downloaded every time" });
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const msg = e.data;
  if ("clear" in msg) {
    await store?.clear().catch(() => {});
    return;
  }
  const t0 = performance.now();
  const result = await loadCell(msg.tile, api, store, msg.opts);
  const net = {
    active: api.active,
    tilesResting: api.tilesResting(),
    lastOk: api.lastOk,
    lastError: api.lastError,
    servers: [...api.serverStats],
  };
  // Cached cells are structured clones, so their arrays can be handed over too.
  const transfer = "cell" in result ? [result.cell.ids.buffer, result.cell.coords.buffer] : [];
  post({ id: msg.id, result, net, ms: performance.now() - t0 }, transfer);
};
