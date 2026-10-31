// Sketches that remember (RimWorld's art): each art action leaves a sketch of
// something he did lately, taken from his History. Its quality rolls from
// awful to masterwork, better with his art skill and when he is Inspired.
// He keeps his best KEPT in his sketchbook and sells the rest at once, the
// better the dearer. Pure; Stats owns one (Stats.sketch).
import type { Rng } from "./rng";

export const QUALITY = ["awful", "poor", "decent", "fine", "excellent", "masterwork"] as const;
export type Quality = (typeof QUALITY)[number];
/** Icon and price in cents of each quality, worst first. */
export const GRADE: Record<Quality, [icon: string, cents: number]> = {
  awful: ["🖍", 50],
  poor: ["✏", 150],
  decent: ["🖊", 400],
  fine: ["🖌", 800],
  excellent: ["🖼", 1500],
  masterwork: ["✨", 4000],
};
/** Sketches kept in his sketchbook; a better one pushes the worst out, and he sells it. */
export const KEPT = 8;
/** Each art level lifts the roll this many grades' worth. */
export const PER_LEVEL = 0.3;
/** Being Inspired (see emotion.ts) lifts the roll this many grades. */
export const INSPIRED = 1;
/** He draws one of his last this many History lines. */
export const LOOK_BACK = 20;
/** The start of a sketch's own History line, so a sketch never draws another. */
export const ICON = "🎨";

export type Sketch = { of: string; q: Quality; t: number };

/** The quality of a sketch at art `level`, `inspired` or not, on a roll `r` in [0, 1): three grades wide, lifted by both. */
export function quality(level: number, inspired: boolean, r: number): Quality {
  const i = Math.floor(r * 3 + level * PER_LEVEL + (inspired ? INSPIRED : 0));
  return QUALITY[Math.min(Math.max(i, 0), QUALITY.length - 1)]!;
}

/** What he draws: one of his last LOOK_BACK History lines that isn't a sketch's, or null with nothing to draw. */
export function subject(lines: string[], rng: Rng): string | null {
  const fit = lines.slice(-LOOK_BACK).filter((l) => !l.startsWith(ICON));
  return fit.length ? rng.pick(fit) : null;
}

const rank = (q: Quality) => QUALITY.indexOf(q);

/** His sketchbook: the best he kept, and counts over his life. */
export class Sketchbook {
  kept: Sketch[] = [];
  /** Sketches made in all. */
  made = 0;
  /** Masterworks made in all. */
  masterworks = 0;

  /** Adds a sketch: kept when there is room or it beats the worst kept, which is then sold. Returns the sketch sold (this one or the one it pushed out), or null. */
  add(s: Sketch): Sketch | null {
    this.made++;
    if (s.q === "masterwork") this.masterworks++;
    if (this.kept.length < KEPT) {
      this.kept.push(s);
      return null;
    }
    // The worst kept, the oldest of those first.
    let w = 0;
    for (let i = 1; i < this.kept.length; i++) if (rank(this.kept[i]!.q) < rank(this.kept[w]!.q)) w = i;
    if (rank(s.q) <= rank(this.kept[w]!.q)) return s;
    const [out] = this.kept.splice(w, 1, s);
    return out!;
  }

  /** The kept sketches, best first, then newest. */
  best(): Sketch[] {
    return [...this.kept].sort((a, b) => rank(b.q) - rank(a.q) || b.t - a.t);
  }

  toJSON() {
    return { kept: this.kept, made: this.made, masterworks: this.masterworks };
  }

  static fromJSON(d?: Partial<ReturnType<Sketchbook["toJSON"]>>): Sketchbook {
    const b = new Sketchbook();
    b.kept = [...(d?.kept ?? [])];
    b.made = d?.made ?? 0;
    b.masterworks = d?.masterworks ?? 0;
    return b;
  }
}
