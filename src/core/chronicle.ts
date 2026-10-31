// His life chronicle (Godville's hero chronicle): one sentence per milestone,
// each only once, oldest first: where he set out from, his first trip and
// first time abroad, his first wage, levels, countries, fainting, his first
// letter to you, the monuments he built. History is his day; this is his life.

/** Levels and country counts that make the chronicle. */
export const LEVEL_MARKS = [5, 10, 20, 30, 50, 75, 100];
export const COUNTRY_MARKS = [5, 10, 25, 50];

export type Moment = { t: number; text: string };

export class Chronicle {
  lines: Moment[] = [];
  /** Keys of the milestones already written. */
  done: string[] = [];

  /** Writes `text` at unix seconds `t` the first time milestone `key` happens; false if it already did. */
  note(key: string, text: string, t: number): boolean {
    if (this.done.includes(key)) return false;
    this.done.push(key);
    this.lines.push({ t, text });
    return true;
  }

  toJSON() {
    return { ...this };
  }

  /** Old saves have no chronicle. */
  static fromJSON(d?: Partial<Chronicle>): Chronicle {
    return Object.assign(new Chronicle(), d ?? {});
  }
}
