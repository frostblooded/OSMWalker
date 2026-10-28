// A tiny IndexedDB key-value store for street cells.
import { MAX_CACHED, type Cached, type Store } from "./source";

const DB = "osmwalker";
const STORE = "cells";

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((ok, fail) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
}

export class IdbStore implements Store {
  private db: Promise<IDBDatabase>;
  private puts = 0;

  constructor(name = DB) {
    const open = indexedDB.open(name, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    this.db = req(open);
  }

  private async tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    return (await this.db).transaction(STORE, mode).objectStore(STORE);
  }

  async get(key: string): Promise<Cached | undefined> {
    return req((await this.tx("readonly")).get(key));
  }

  async put(key: string, value: Cached): Promise<void> {
    await req((await this.tx("readwrite")).put(value, key));
    if (++this.puts % 50 === 0) await this.prune(MAX_CACHED);
  }

  /** Keeps only the `keep` most recently saved cells. */
  async prune(keep: number): Promise<void> {
    const store = await this.tx("readwrite");
    const keys = await req(store.getAllKeys());
    if (keys.length <= keep) return;
    const dated: [number, IDBValidKey][] = [];
    await new Promise<void>((ok, fail) => {
      const cur = store.openCursor();
      cur.onerror = () => fail(cur.error);
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) return ok();
        dated.push([(c.value as Cached).t, c.key]);
        c.continue();
      };
    });
    dated.sort((a, b) => b[0] - a[0]);
    const del = (await this.tx("readwrite"));
    for (const [, k] of dated.slice(keep)) del.delete(k);
  }

  async clear(): Promise<void> {
    await req((await this.tx("readwrite")).clear());
  }
}
