// The game with real Sofia streets, fake servers and fixed dice, shared by the tests/integration/game*.test.ts files.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import type { Tile } from "../../src/core/geo";
import type { Cell } from "../../src/core/graph";
import { fromPbf } from "../../src/core/ofm";
import { Rng } from "../../src/core/rng";
import type { Place } from "../../src/core/stats";
import { parseAirports, parseCities, type City } from "../../src/core/trips";
import { Game, type GameDeps } from "../../src/game/game";
import { Api } from "../../src/net/api";
import type { LoadFn } from "../../src/streets/client";
import { dataFile } from "./data";
// Loaded up front, so the game's own import() of it is instant and never runs past DILEMMA_WAIT_MS on a slow machine.
import "../../src/core/dilemmas";

export const WEST: Tile = { x: 9253, y: 6039 };
export const START: [number, number] = [42.687, 23.319];
export const CAFE: Place = { name: "Cafe Near", class: "cafe", subclass: "cafe", rank: 1, lat: 42.6885, lon: 23.3215 };
export const BUS: Place = { name: "Central Bus", class: "bus", subclass: "bus_station", rank: 1, lat: 42.6862, lon: 23.3172 };
export const CITIES = "Sofia\tBGR\tBulgaria\t42.6975\t23.3241\t1200000\nPlovdiv\tBGR\tBulgaria\t42.15\t24.75\t340000\nParis\tFRA\tFrance\t48.85\t2.35\t2100000\nVidin\tBGR\tBulgaria\t43.99\t22.88\t1\n";

export const pbf = (t: Tile) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../fixtures/ofm/14_${t.x}_${t.y}.pbf`, import.meta.url))));
export const empty = (): Cell => ({ ids: new Float64Array(), coords: new Float64Array(), ways: [], places: [] });

/** Real streets for the two Sofia tiles, nothing elsewhere. */
export function streets(places: Place[] = [CAFE, BUS], fail = false): { load: LoadFn; asked: Tile[] } {
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

export function game(opts: Partial<GameDeps> & { places?: Place[]; fail?: boolean; roll?: number } = {}) {
  const api = new Api(async () => new Response("", { status: 503 }));
  const data = {
    actions: JSON.parse(dataFile("actions.json")),
    flavour: {},
    cities: parseCities(CITIES),
    airports: parseAirports("Sofia Airport\tSOF\tBG\t42.6967\t23.4114\nParis Airport\tCDG\tFR\t49.0097\t2.5479\n"),
    creatures: JSON.parse(dataFile("creatures.json")),
    spells: JSON.parse(dataFile("spells.json")),
    words: JSON.parse(dataFile("words.json")),
  };
  const storage = (opts.storage as MemStorage | undefined) ?? new MemStorage();
  const g = new Game({ api, load: streets(opts.places, opts.fail).load, data, storage, rng: new Rng(3), cardRng: new Rng(4), rollSource: () => opts.roll ?? 0.99, hour: () => 12, ...opts });
  g.problems.quiet = true;
  return { g, storage };
}

/** Steps a second at a time. */
export function run(g: Game, seconds: number): void {
  for (let i = 0; i < seconds; i++) g.step(1);
}

export const tick = () => new Promise((r) => setTimeout(r, 0));

export const HOUR = 3600_000;
/** A game saved `agoMs` before a reopen, and the reopened game. */
export async function reopen(agoMs: number, o: Partial<GameDeps> & { places?: Place[]; roll?: number } = {}, before: (g: Game) => void = () => {}, loaded: (g: Game) => void = () => {}) {
  let now = Date.UTC(2026, 9, 29, 8);
  const { g, storage } = game({ ...o, clock: () => now });
  await g.startCity("Sofia, Bulgaria", ...START, null);
  before(g);
  g.save();
  now += agoMs;
  const again = new Game({ ...(g as unknown as { deps: GameDeps }).deps, storage });
  again.problems.quiet = true;
  again.load();
  loaded(again);
  await again.wake();
  return { g, again, setNow: (t: number) => (now = t), now: () => now };
}


/** A reopen that brings a dilemma (the Debug switch), then made into `id`, offering `city`. */
export async function reopenDilemma(id: string, city: City | null = null) {
  const r = await reopen(5 * HOUR, {}, (g) => g.setAlwaysDilemma(true));
  expect(r.again.dilemma).not.toBeNull();
  r.again.dilemma = { ...r.again.dilemma!, id, city };
  return r;
}
