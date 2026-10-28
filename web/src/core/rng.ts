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

  /** Standard normal (Box-Muller). */
  randfn(): number {
    const u = 1 - this.randf();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.randf());
  }
}
