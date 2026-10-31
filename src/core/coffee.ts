// His coffee habit (The Sims' and RimWorld's caffeine): each cup makes the
// habit stronger and each day fades it a little. Hooked, he craves a cup
// after CRAVE_H hours (cafés pull him harder), and after ACHE_H hours with
// none he gets a headache. After QUIT_AFTER headaches he decides to cut
// down on his own: the habit is gone, and for QUIT_DAYS cafés pull him less
// and cups build no habit.
// It always stays gentle: nothing worse than a headache. Pure; Stats owns one.

export const CUP_HABIT = 0.2;
export const DAY_FADE = 0.15;
export const HOOKED = 0.6;
export const CRAVE_H = 6;
export const ACHE_H = 12;
export const CRAVE_PULL = 1.5;
export const QUIT_AFTER = 3;
export const QUIT_DAYS = 5;
export const QUIT_PULL = 0.5;
export const COFFEE_KINDS = ["cafe"];
/** The headache moodlet: name, icon, mood an hour, hours. */
export const HEADACHE: readonly [string, string, number, number] = ["Coffee headache", "🤕", -2, 3];

const H = 3600;

export class Coffee {
  /** How strong the habit is, 0 to 1. */
  habit = 0;
  /** Unix s of his last cup, and whether the headache since then has come. */
  last = 0;
  ached = false;
  /** Headaches since he was last hooked, cups in all, and when cutting down ends (unix s). */
  headaches = 0;
  cups = 0;
  quitUntil = 0;

  hooked(): boolean {
    return this.habit >= HOOKED;
  }

  /** A cup at `t`; returns a feed line when it hooks him. */
  drink(t: number): string {
    const was = this.hooked();
    this.cups++;
    if (t >= this.quitUntil) this.habit = Math.min(1, this.habit + CUP_HABIT);
    this.last = t;
    this.ached = false;
    return !was && this.hooked() ? "☕ Can't start the day without a coffee any more" : "";
  }

  /** Time passes to `t`: true when the headache comes now. */
  pass(t: number): boolean {
    if (!this.hooked() || this.ached || t - this.last < ACHE_H * H) return false;
    this.ached = true;
    this.headaches++;
    return true;
  }

  /** A new day at `t`: the habit fades; returns a feed line when he decides to cut down or the habit fades away. */
  day(t: number): string {
    const was = this.hooked();
    if (was && this.headaches >= QUIT_AFTER) {
      this.habit = 0;
      this.headaches = 0;
      this.quitUntil = t + QUIT_DAYS * 24 * H;
      return "☕ Decides to cut down on coffee";
    }
    this.habit = Math.max(0, this.habit - DAY_FADE);
    if (was && !this.hooked()) {
      this.headaches = 0;
      return "☕ Doesn't need his coffee any more";
    }
    return "";
  }

  /** How hard a place of map class `kind` pulls him at `t`: cafés more while he craves, less while he cuts down. */
  pull(kind: string, t: number): number {
    if (!COFFEE_KINDS.includes(kind)) return 1;
    if (t < this.quitUntil) return QUIT_PULL;
    return this.hooked() && t - this.last >= CRAVE_H * H ? CRAVE_PULL : 1;
  }

  toJSON() {
    return { habit: this.habit, last: this.last, ached: this.ached, headaches: this.headaches, cups: this.cups, quit_until: this.quitUntil };
  }

  /** A save from before the habit: no cups yet. */
  static fromJSON(d?: Partial<ReturnType<Coffee["toJSON"]>>): Coffee {
    const c = new Coffee();
    c.habit = d?.habit ?? 0;
    c.last = d?.last ?? 0;
    c.ached = d?.ached ?? false;
    c.headaches = d?.headaches ?? 0;
    c.cups = d?.cups ?? 0;
    c.quitUntil = d?.quit_until ?? 0;
    return c;
  }
}
