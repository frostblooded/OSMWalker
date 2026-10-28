// His history: the last SIZE things that happened, each with when and where,
// and the trail he walked since the oldest of them. Trips break the trail.
import { distanceM, type BBox } from "./geo";

export type LatLon = [number, number];
export type Entry = { text: string; t: number; at: LatLon | null; ti: number };
export type Marker = { at: LatLon; label: string; first: number };

export const SIZE = 100;
/** Trail points closer together than this are skipped. */
export const TRAIL_STEP_M = 15;
/** About 75 km of walking at TRAIL_STEP_M. */
export const MAX_TRAIL = 5000;
/** Entries this close together share one marker. */
const SAME_SPOT_M = 10;

export class History {
  entries: Entry[] = [];
  here: LatLon | null = null;
  /** Points, with null marking a break. */
  private trail: (LatLon | null)[] = [];
  /** Trail points cut off the front so far. */
  private dropped = 0;
  /** Bumped whenever the trail changes, so the map redraws it only then. */
  trailVersion = 0;
  /** Tells one History from another in those checks. */
  readonly id = Math.random();

  /** Notes where he is and extends the trail. */
  moveTo(lat: number, lon: number): void {
    this.here = [lat, lon];
    const last = this.trail.at(-1);
    if (!last || distanceM(last[0], last[1], lat, lon) >= TRAIL_STEP_M) {
      this.trail.push([lat, lon]);
      this.trailVersion++;
    }
    if (this.trail.length > MAX_TRAIL) this.cut(this.trail.length - MAX_TRAIL);
  }

  /** The trail stops here and starts again wherever he next is. */
  breakTrail(): void {
    if (this.trail.length && this.trail.at(-1)) {
      this.trail.push(null);
      this.trailVersion++;
    }
  }

  add(text: string, t: number): void {
    this.entries.push({ text, t, at: this.here ? [...this.here] : null, ti: this.dropped + Math.max(this.trail.length - 1, 0) });
    if (this.entries.length > SIZE) {
      this.entries = this.entries.slice(-SIZE);
      this.cut(this.entries[0]!.ti - this.dropped);
    }
  }

  private cut(n: number): void {
    if (n <= 0) return;
    this.trail = this.trail.slice(n);
    this.dropped += n;
    this.trailVersion++;
  }

  latest(): string {
    return this.entries.at(-1)?.text ?? "";
  }

  /** The number shown for entries[i]: 1 is the newest. */
  number(i: number): number {
    return this.entries.length - i;
  }

  trailPoints(): number {
    return this.trail.filter(Boolean).length;
  }

  /** The trail as runs of points, split where he travelled. */
  segments(): LatLon[][] {
    const out: LatLon[][] = [];
    let run: LatLon[] = [];
    for (const p of this.trail) {
      if (p) run.push(p);
      else {
        if (run.length) out.push(run);
        run = [];
      }
    }
    if (run.length) out.push(run);
    return out;
  }

  /** One marker per spot, oldest first. Entries in a row at the same spot share a marker. */
  markers(): Marker[] {
    const out: Marker[] = [];
    let i = 0;
    while (i < this.entries.length) {
      const at = this.entries[i]!.at;
      let j = i;
      while (j + 1 < this.entries.length && sameSpot(at, this.entries[j + 1]!.at)) j++;
      if (at) {
        const lo = this.number(j);
        const hi = this.number(i);
        out.push({ at, label: lo === hi ? `${lo}` : `${lo}-${hi}`, first: lo });
      }
      i = j + 1;
    }
    return out;
  }

  /** Box around the trail and every entry, null when there is nothing. */
  bounds(): BBox | null {
    const pts = [...this.trail, ...this.entries.map((e) => e.at)].filter((p): p is LatLon => !!p);
    if (!pts.length) return null;
    const b: BBox = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [lat, lon] of pts) {
      b[0] = Math.min(b[0], lat);
      b[1] = Math.min(b[1], lon);
      b[2] = Math.max(b[2], lat);
      b[3] = Math.max(b[3], lon);
    }
    return b;
  }

  toJSON() {
    return { entries: this.entries, trail: this.trail, dropped: this.dropped, here: this.here };
  }

  static fromJSON(d: ReturnType<History["toJSON"]>): History {
    const h = new History();
    h.entries = d.entries ?? [];
    h.trail = d.trail ?? [];
    h.dropped = d.dropped ?? 0;
    h.here = d.here ?? null;
    return h;
  }
}

function sameSpot(a: LatLon | null, b: LatLon | null): boolean {
  if (!a || !b) return !a && !b;
  return distanceM(a[0], a[1], b[0], b[1]) < SAME_SPOT_M;
}

/** "HH:MM" of unix time t (seconds) in a time zone biasMin minutes from UTC. */
export function timeText(t: number, biasMin: number): string {
  const s = (((t + biasMin * 60) % 86400) + 86400) % 86400;
  const pad = (n: number) => `${Math.floor(n)}`.padStart(2, "0");
  return `${pad(s / 3600)}:${pad((s / 60) % 60)}`;
}
