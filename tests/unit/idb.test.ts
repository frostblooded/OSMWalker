// The street cell cache (src/streets/idb.ts): pruning by save time, the version 1 upgrade, and an upgrade another tab blocks.
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { IdbStore } from "../../src/streets/idb";
import type { Cached } from "../../src/streets/source";

const cell = (t: number): Cached => ({ t, cell: { nodes: [], ways: [] } as unknown as Cached["cell"] });
let n = 0;

describe("street cell cache", () => {
  it("keeps the most recently saved cells", async () => {
    const s = new IdbStore(`prune-${n++}`);
    for (const t of [5, 1, 4, 2, 3]) await s.put(`c${t}`, cell(t));
    await s.prune(3);
    expect(await s.get("c1")).toBeUndefined();
    expect(await s.get("c2")).toBeUndefined();
    for (const t of [3, 4, 5]) expect((await s.get(`c${t}`))?.t).toBe(t);
  });

  it("prunes from an index on the save time, without reading the cells", async () => {
    const s = new IdbStore(`index-${n++}`);
    for (let t = 0; t < 4; t++) await s.put(`c${t}`, cell(t));
    const read = IDBObjectStore.prototype.openCursor;
    const getAll = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.openCursor = IDBObjectStore.prototype.getAll = () => {
      throw new Error("read every cell");
    };
    try {
      await s.prune(2);
    } finally {
      IDBObjectStore.prototype.openCursor = read;
      IDBObjectStore.prototype.getAll = getAll;
    }
    expect(await s.get("c1")).toBeUndefined();
    expect((await s.get("c3"))?.t).toBe(3);
  });

  it("indexes cells saved before the index existed", async () => {
    const name = `upgrade-${n++}`;
    await new Promise<void>((ok) => {
      const open = indexedDB.open(name, 1);
      open.onupgradeneeded = () => open.result.createObjectStore("cells");
      open.onsuccess = () => {
        const tx = open.result.transaction("cells", "readwrite");
        tx.objectStore("cells").put(cell(1), "old");
        tx.oncomplete = () => (open.result.close(), ok());
      };
    });
    const s = new IdbStore(name);
    await s.put("new", cell(2));
    await s.prune(1);
    expect(await s.get("old")).toBeUndefined();
    expect((await s.get("new"))?.t).toBe(2);
  });

  it("gives up on the cache, rather than hanging, while an old tab holds the version 1 database", async () => {
    const name = `blocked-${n++}`;
    const old = await new Promise<IDBDatabase>((ok) => {
      const open = indexedDB.open(name, 1);
      open.onupgradeneeded = () => open.result.createObjectStore("cells");
      open.onsuccess = () => ok(open.result);
    });
    await expect(new IdbStore(name).get("x")).rejects.toThrow(/another tab/i);
    old.close();
  });

  it("closes its database when a newer version wants it", async () => {
    const name = `newer-${n++}`;
    const s = new IdbStore(name);
    await s.put("a", cell(1));
    await new Promise<void>((ok, fail) => {
      const open = indexedDB.open(name, 3);
      open.onblocked = () => fail(new Error("blocked"));
      open.onsuccess = () => (open.result.close(), ok());
    });
  });
});
