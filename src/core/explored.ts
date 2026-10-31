// The world in squares of about CELL_M a side, and the ones he has walked
// through, kept for good across every city (New city clears them). Rows run
// along the latitude; each row's squares are CELL_M wide at its middle, so
// squares keep their size away from the equator. Only walking marks them:
// rides, flights and the time the game was closed don't.
import { EARTH_RADIUS_M, type BBox } from "./geo";
import type { LatLon } from "./trips";

export const CELL_M = 200;
/** Points this far apart are checked along a step, so a long step leaves no gap. */
const STEP_M = CELL_M / 2;
const M_PER_DEG = (Math.PI / 180) * EARTH_RADIUS_M;
const LAT_STEP = CELL_M / M_PER_DEG;
/** Keys pack row and column in one number: row * COLS + column, both shifted to be positive. */
const COLS = 2 ** 24;
const ROW0 = 2 ** 17;
const COL0 = 2 ** 23;

/** Degrees of longitude a square of `row` takes. */
function lonStep(row: number): number {
  const lat = (row + 0.5) * LAT_STEP;
  return LAT_STEP / Math.max(Math.cos((lat * Math.PI) / 180), 0.05);
}

const pack = (row: number, col: number) => (row + ROW0) * COLS + col + COL0;
const rowOf = (k: number) => Math.floor(k / COLS) - ROW0;
const colOf = (k: number) => (k % COLS) - COL0;

/** The key of the square a point is in. */
export function cellOf(lat: number, lon: number): number {
  const row = Math.floor(lat / LAT_STEP);
  return pack(row, Math.floor(lon / lonStep(row)));
}

/** A run of squares side by side in one row: [south, west, north, east]. */
function rowBox(row: number, from: number, to: number): BBox {
  const d = lonStep(row);
  return [row * LAT_STEP, from * d, (row + 1) * LAT_STEP, (to + 1) * d];
}

export class Explored {
  private cells = new Set<number>();
  /** Bumped on each new square, so the map redraws them only then. */
  version = 0;
  /** The last save text and city count, kept until a new square: on phones each takes tens of ms with many thousands of squares. */
  private saved = { version: -1, text: "" };
  private counted = { key: "", walked: 0, total: 0 };

  get size(): number {
    return this.cells.size;
  }

  /** He walked from `a` to `b`: marks the squares on the way. True when one was new. */
  walk(a: LatLon, b: LatLon): boolean {
    const dLat = b[0] - a[0];
    const dLon = b[1] - a[1];
    const m = Math.hypot(dLat * M_PER_DEG, dLon * M_PER_DEG * Math.cos((a[0] * Math.PI) / 180));
    const n = Math.ceil(m / STEP_M);
    const before = this.cells.size;
    for (let i = 0; i <= n; i++) {
      const t = n ? i / n : 1;
      this.cells.add(cellOf(a[0] + dLat * t, a[1] + dLon * t));
    }
    if (this.cells.size === before) return false;
    this.version++;
    return true;
  }

  squareOf(key: number): BBox {
    return rowBox(rowOf(key), colOf(key), colOf(key));
  }

  /** The squares whose middle is in `box`, and how many of those he walked. */
  inBox(box: BBox): { walked: number; total: number } {
    const key = `${this.version}:${box.join()}`;
    if (key === this.counted.key) return { walked: this.counted.walked, total: this.counted.total };
    let total = 0;
    for (let row = Math.ceil(box[0] / LAT_STEP - 0.5); (row + 0.5) * LAT_STEP < box[2]; row++) {
      const d = lonStep(row);
      total += Math.max(0, Math.ceil(box[3] / d - 0.5) - Math.ceil(box[1] / d - 0.5));
    }
    let walked = 0;
    for (const k of this.cells) if (inside(this.squareOf(k), box)) walked++;
    this.counted = { key, walked, total };
    return { walked, total };
  }

  /** The box around the squares he walked in `box`, null when none. */
  bounds(box: BBox): BBox | null {
    let out: BBox | null = null;
    for (const k of this.cells) {
      const q = this.squareOf(k);
      if (!inside(q, box)) continue;
      out = out ? [Math.min(out[0], q[0]), Math.min(out[1], q[1]), Math.max(out[2], q[2]), Math.max(out[3], q[3])] : q;
    }
    return out;
  }

  /** Every square he walked, those side by side in a row joined into one box, for the map. */
  boxes(): BBox[] {
    const out: BBox[] = [];
    let start = -1;
    let last = -1;
    for (const k of this.sorted()) {
      if (k === last + 1 && rowOf(k) === rowOf(last)) {
        last = k;
        continue;
      }
      if (start >= 0) out.push(rowBox(rowOf(start), colOf(start), colOf(last)));
      start = last = k;
    }
    if (start >= 0) out.push(rowBox(rowOf(start), colOf(start), colOf(last)));
    return out;
  }

  private sorted(): number[] {
    return [...this.cells].sort((a, b) => a - b);
  }

  /** Base-36 steps from square to square, row by row: "~n" moves n rows on, a number moves along the row. About 2 or 3 bytes a square. */
  toJSON(): string {
    if (this.saved.version === this.version) return this.saved.text;
    const out: string[] = [];
    let row = 0;
    let col = 0;
    for (const k of this.sorted()) {
      if (rowOf(k) !== row) {
        out.push(`~${(rowOf(k) - row).toString(36)}`);
        row = rowOf(k);
      }
      out.push((colOf(k) - col).toString(36));
      col = colOf(k);
    }
    this.saved = { version: this.version, text: out.join(",") };
    return this.saved.text;
  }

  /** An old save has none; a broken one starts again with none. */
  static fromJSON(d: unknown): Explored {
    const e = new Explored();
    if (typeof d !== "string" || !d) return e;
    let row = 0;
    let col = 0;
    for (const t of d.split(",")) {
      const n = parseInt(t[0] === "~" ? t.slice(1) : t, 36);
      if (!Number.isFinite(n)) return new Explored();
      if (t[0] === "~") row += n;
      else e.cells.add(pack(row, (col += n)));
    }
    return e;
  }
}

/** The square's middle is in `box`. */
function inside(q: BBox, box: BBox): boolean {
  const lat = (q[0] + q[2]) / 2;
  const lon = (q[1] + q[3]) / 2;
  return lat >= box[0] && lat < box[2] && lon >= box[1] && lon < box[3];
}
