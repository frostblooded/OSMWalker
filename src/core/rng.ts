// Seedable random numbers (mulberry32), so game logic is testable.

export class Rng {
  private s: number;

  constructor(seed = Math.floor(Math.random() * 2 ** 32)) {
    this.s = seed >>> 0;
  }

  /** Uniform in [0, 1). */
  randf(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform in [lo, hi). */
  randfRange(lo: number, hi: number): number {
    return lo + (hi - lo) * this.randf();
  }

  /** Integer in [lo, hi], both included. */
  randiRange(lo: number, hi: number): number {
    return lo + Math.floor(this.randf() * (hi - lo + 1));
  }

  /** A random element. */
  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.randf() * list.length)]!;
  }

  /** [east, north] meters in a random direction, `m[0]` to `m[1]` away. */
  polar(m: [number, number]): [number, number] {
    const a = this.randf() * 2 * Math.PI;
    const r = this.randfRange(m[0], m[1]);
    return [Math.cos(a) * r, Math.sin(a) * r];
  }

  /** Standard normal (Box-Muller). */
  randfn(): number {
    const u = 1 - this.randf();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.randf());
  }
}

/** A seed from text (FNV-1a), so the same name always rolls the same. */
export function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Lower-case letters, digits and "_" only, for ids. */
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "x";
