// A tiny IndexedDB key-value store for street cells.
import { MAX_CACHED, type Cached, type Store } from "./source";

const DB = "osmwalker";
const STORE = "cells";
const BY_TIME = "t";

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
    // Version 2 adds the index on save time, so pruning never reads the cells.
    const open = indexedDB.open(name, 2);
    open.onupgradeneeded = (e) => {
      const store = e.oldVersion < 1 ? open.result.createObjectStore(STORE) : open.transaction!.objectStore(STORE);
      store.createIndex(BY_TIME, "t");
    };
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
    const oldestFirst = await req(store.index(BY_TIME).getAllKeys());
    for (const k of oldestFirst.slice(0, Math.max(oldestFirst.length - keep, 0))) store.delete(k);
  }

  async clear(): Promise<void> {
    await req((await this.tx("readwrite")).clear());
  }
}
