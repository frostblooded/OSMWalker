// Keeps the street graph filled around the walker: the nearest cells go
// first, a few loads run at once, failed cells wait before a retry, and cells
// served from an old cache entry are fetched again when nothing else waits.
import type { Tile } from "../core/geo";
import { cellKey, type StreetGraph } from "../core/graph";
import type { LoadFn } from "./client";
import type { From } from "./source";

export const MAX_PARALLEL = 3;
export const RETRY_MS = 15_000;

export type LoaderStats = { loaded: number; from_cache: number; downloaded: number; loading: number; queued: number; failed: number };

export class StreetLoader {
  private inFlight = new Set<number>();
  private failed = new Map<number, number>(); // cell -> ms of last failure
  private stale: Tile[] = [];
  private refreshing = 0;
  private failing = false;
  private queued = 0;
  private fromCache = 0;
  private downloaded = 0;
  private failedLoads = 0;
  private server = 0;
  /** Told about cells that could not be loaded. */
  onProblem: (text: string) => void = () => {};
  /** Told when a cell joins the graph, with where it came from and how long it took. */
  onCell: (tile: Tile, from: From) => void = () => {};

  constructor(
    public graph: StreetGraph,
    private readonly load: LoadFn,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** Starts over on a fresh graph (after a trip): pending loads for the old one are dropped. */
  setGraph(graph: StreetGraph): void {
    this.graph = graph;
    this.inFlight.clear();
    this.stale = [];
    this.resetFailures();
  }

  /** Makes sure `wanted` (most urgent first) gets loaded. Call every tick. */
  request(wanted: Tile[]): void {
    const now = this.now();
    const missing = wanted.filter((c) => {
      const k = cellKey(c);
      if (this.graph.cells.has(k) || this.inFlight.has(k)) return false;
      const at = this.failed.get(k);
      return at === undefined || now - at >= RETRY_MS;
    });
    this.queued = missing.length;
    // His own cell may always use the slot the others leave free for it.
    const his = wanted[0] ? cellKey(wanted[0]) : -1;
    for (const c of missing) {
      const busy = this.inFlight.size + this.refreshing;
      const others = busy - (this.inFlight.has(his) ? 1 : 0);
      if (cellKey(c) === his ? busy >= MAX_PARALLEL : others >= MAX_PARALLEL - 1) continue;
      this.fetch(c);
    }
    if (missing.length === 0 && this.inFlight.size + this.refreshing < MAX_PARALLEL - 1 && this.stale.length > 0) this.refresh(this.stale.shift()!);
  }

  private fetch(c: Tile): void {
    const k = cellKey(c);
    const g = this.graph;
    this.inFlight.add(k);
    this.queued = Math.max(this.queued - 1, 0);
    void this.load(c, { server: this.server++ % 3 }).then((r) => {
      if (g !== this.graph || !this.inFlight.has(k)) return; // landed elsewhere meanwhile
      this.inFlight.delete(k);
      if ("error" in r) {
        this.failing = true;
        this.failedLoads++;
        this.failed.set(k, this.now());
        this.onProblem(`Couldn't download streets for cell ${c.x}, ${c.y}: ${r.error}`);
        return;
      }
      this.failing = false;
      this.failed.delete(k);
      g.addCell(c, r.cell);
      if (r.from === "cache") this.fromCache++;
      else this.downloaded++;
      if (r.stale) this.stale.push(c);
      this.onCell(c, r.from);
    });
  }

  /** Fetches an old cached cell again; only its places change in the graph. */
  private refresh(c: Tile): void {
    const g = this.graph;
    this.refreshing++;
    void this.load(c, { refresh: true, server: this.server++ % 3 }).then((r) => {
      this.refreshing--;
      if (g === this.graph && "cell" in r && g.cells.has(cellKey(c))) g.places.set(cellKey(c), r.cell.places);
    });
  }

  /** Loads still running. */
  inFlightCount(): number {
    return this.inFlight.size + this.refreshing;
  }

  /** True when the last street load failed. */
  isFailing(): boolean {
    return this.failing;
  }

  hasFailed(c: Tile): boolean {
    return this.failed.has(cellKey(c));
  }

  resetFailures(): void {
    this.failed.clear();
    this.failing = false;
  }

  /** Numbers for the loading details. */
  stats(): LoaderStats {
    return {
      loaded: this.graph.cells.size,
      from_cache: this.fromCache,
      downloaded: this.downloaded,
      loading: this.inFlight.size,
      queued: this.queued,
      failed: this.failedLoads,
    };
  }

  /** What a cell is waiting for, in plain words. */
  cellState(c: Tile): string {
    const k = cellKey(c);
    if (this.graph.cells.has(k)) return "loaded";
    if (this.inFlight.has(k)) return "loading";
    const at = this.failed.get(k);
    if (at !== undefined) {
      const left = RETRY_MS - (this.now() - at);
      return left > 0 ? `download failed, retry in ${Math.ceil(left / 1000)} s` : "queued for retry";
    }
    return "queued";
  }
}
