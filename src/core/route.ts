// Route search for the walker: A* from a street corner towards a goal over
// the streets loaded so far. Corners whose surroundings are not loaded yet
// count as reachable in a straight line, so a route may end at the edge of
// the loaded map; the walker plans again there.
import { distanceM } from "./geo";
import type { StreetGraph } from "./graph";
import type { LatLon } from "./trips";

/** Searches stop after this many street corners, to keep frames short. */
export const MAX_SEARCH_NODES = 40_000;

/** `route`: the corners to walk after `from`. `arrives`: it ends within `arriveM` of the goal (or at `goalNode`). */
export type Route = { route: number[]; arrives: boolean };

export function planRoute(g: StreetGraph, from: number, goal: LatLon, goalNode: number | null, arriveM: number, maxNodes = MAX_SEARCH_NODES): Route {
  const h = (id: number) => {
    const p = g.nodes.get(id)!;
    return distanceM(p[0], p[1], goal[0], goal[1]);
  };
  let arrives = false;
  const heap = new Heap();
  heap.push(h(from), from);
  const cost = new Map<number, number>([[from, 0]]);
  const came = new Map<number, number>();
  const done = new Set<number>();
  let best = from;
  let bestH = h(from);
  let end: number | null = null;
  while (heap.size > 0 && done.size < maxNodes) {
    const id = heap.pop();
    if (done.has(id)) continue;
    done.add(id);
    const hid = h(id);
    if (hid < bestH) {
      best = id;
      bestH = hid;
    }
    if (id === goalNode || hid <= arriveM) {
      end = id;
      arrives = true;
      break;
    }
    if (id !== from && !g.isComplete(id)) {
      end = id;
      break;
    }
    const base = cost.get(id)!;
    for (const n of g.neighbors(id)) {
      const c = base + g.edgeLength(id, n);
      if (c < (cost.get(n) ?? Infinity)) {
        cost.set(n, c);
        came.set(n, id);
        heap.push(c + h(n), n);
      }
    }
  }
  if (end === null) {
    // Nothing better is reachable: the closest corner is as far as he can get.
    end = best;
    arrives = heap.size === 0;
  }
  const route: number[] = [];
  while (end !== from) {
    route.push(end);
    end = came.get(end)!;
  }
  return { route: route.reverse(), arrives };
}

/** Min-heap of node ids by priority, on parallel arrays. */
class Heap {
  private keys: number[] = [];
  private ids: number[] = [];

  get size(): number {
    return this.ids.length;
  }

  push(key: number, id: number): void {
    let i = this.ids.length;
    this.keys.push(key);
    this.ids.push(id);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (this.keys[up]! <= key) break;
      this.keys[i] = this.keys[up]!;
      this.ids[i] = this.ids[up]!;
      i = up;
    }
    this.keys[i] = key;
    this.ids[i] = id;
  }

  pop(): number {
    const top = this.ids[0]!;
    const key = this.keys.pop()!;
    const id = this.ids.pop()!;
    const n = this.ids.length;
    if (n === 0) return top;
    let i = 0;
    for (;;) {
      let c = i * 2 + 1;
      if (c >= n) break;
      if (c + 1 < n && this.keys[c + 1]! < this.keys[c]!) c++;
      if (this.keys[c]! >= key) break;
      this.keys[i] = this.keys[c]!;
      this.ids[i] = this.ids[c]!;
      i = c;
    }
    this.keys[i] = key;
    this.ids[i] = id;
    return top;
  }
}
