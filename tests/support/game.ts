// The game with real Sofia streets, fake servers and fixed dice, shared by the integration tests.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Tile } from "../../src/core/geo";
import type { Cell } from "../../src/core/graph";
import { fromPbf } from "../../src/core/ofm";
import { Rng } from "../../src/core/rng";
import type { Place } from "../../src/core/stats";
import { Game, type GameDeps } from "../../src/game/game";
import { Api } from "../../src/net/api";
import type { LoadFn } from "../../src/streets/client";

export const WEST: Tile = { x: 9253, y: 6039 };
export const START: [number, number] = [42.687, 23.319];
export const CAFE: Place = { name: "Cafe Near", class: "cafe", subclass: "cafe", rank: 1, lat: 42.6885, lon: 23.3215 };
export const PARK: Place = { name: "City Garden", class: "park", subclass: "park", rank: 1, lat: 42.6862, lon: 23.3172 };

export const pbf = (t: Tile) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../fixtures/ofm/14_${t.x}_${t.y}.pbf`, import.meta.url))));
export const empty = (): Cell => ({ ids: new Float64Array(), coords: new Float64Array(), ways: [], places: [] });

/** Real streets for the two Sofia tiles, nothing elsewhere. */
export function streets(places: Place[] = [CAFE, PARK], fail = false): { load: LoadFn; asked: Tile[] } {
  const asked: Tile[] = [];
  const load: LoadFn = async (tile) => {
    asked.push(tile);
    if (fail) return { error: "HTTP 503 (server overloaded)" };
    if (tile.y === 6039 && (tile.x === 9253 || tile.x === 9254)) {
      const cell = fromPbf(pbf(tile), tile);
      return { cell: { ...cell, places: tile.x === 9253 ? places : [] }, from: "tile", stale: false };
    }
    return { cell: empty(), from: "tile", stale: false };
  };
  return { load, asked };
}

export class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

export function game(opts: Partial<GameDeps> & { places?: Place[]; fail?: boolean } = {}) {
  const api = new Api(async () => new Response("", { status: 503 }));
  const storage = (opts.storage as MemStorage | undefined) ?? new MemStorage();
  const g = new Game({ api, load: streets(opts.places, opts.fail).load, storage, rng: new Rng(3), ...opts });
  g.problems.quiet = true;
  return { g, storage };
}

/** Steps a second at a time. */
export function run(g: Game, seconds: number): void {
  for (let i = 0; i < seconds; i++) g.step(1);
}

export const tick = () => new Promise((r) => setTimeout(r, 0));
