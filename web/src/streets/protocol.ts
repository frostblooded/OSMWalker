// Messages between the game and the streets worker.
import type { Tile } from "../core/geo";
import type { ServerStat } from "../net/api";
import type { LoadOpts, Loaded } from "./source";

export type Request = { id: number; tile: Tile; opts: LoadOpts } | { id: number; clear: true };
export type Net = {
  active: number;
  tilesResting: boolean;
  lastOk: { host: string; bytes: number; ms: number } | null;
  lastError: { host: string; error: string } | null;
  servers: [string, ServerStat][];
};
export type Reply = { id: number; result: Loaded; net: Net; ms: number } | { problem: string };
