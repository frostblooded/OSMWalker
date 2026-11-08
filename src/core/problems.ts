// Problems from anywhere in the game, for the Debug panel: the last
// MAX_WARNINGS warnings and MAX_ERRORS errors, each also printed to the
// console.
// Each has a short title and detail lines. A problem repeated right away
// counts up instead of filling the log.
import { timeText } from "./history";

export const MAX_WARNINGS = 20;
export const MAX_ERRORS = 10;
export type Level = "error" | "warning";
export type Problem = { text: string; details: string[]; t: number; count: number };

export class Problems {
  warnings: Problem[] = [];
  errors: Problem[] = [];
  /** Added since the Debug panel was last opened. */
  unseen = 0;
  /** Tests skip the console. */
  quiet = false;
  now = () => Math.floor(Date.now() / 1000);

  warn(title: string, details: string[] = []): void {
    if (!this.quiet) console.warn(console_(title, details));
    this.warnings = this.add(this.warnings, title, details, MAX_WARNINGS);
  }

  error(title: string, details: string[] = []): void {
    if (!this.quiet) console.error(`ERROR (game): ${console_(title, details)}`);
    this.errors = this.add(this.errors, title, details, MAX_ERRORS);
  }

  private add(list: Problem[], title: string, details: string[], cap: number): Problem[] {
    const last = list[list.length - 1];
    if (last && last.text === title) {
      last.count++;
      last.t = this.now();
      last.details = details;
    } else {
      list.push({ text: title, details, t: this.now(), count: 1 });
    }
    this.unseen++;
    return list.slice(Math.max(list.length - cap, 0));
  }

  markSeen(): void {
    this.unseen = 0;
  }

  clear(): void {
    this.warnings = [];
    this.errors = [];
    this.unseen = 0;
  }

  /** Every problem, most serious level first and newest first within it. */
  entries(): (Problem & { level: Level })[] {
    const out: (Problem & { level: Level })[] = [];
    for (const [level, list] of [["error", this.errors], ["warning", this.warnings]] as const) {
      for (let i = list.length - 1; i >= 0; i--) out.push({ ...list[i]!, level });
    }
    return out;
  }

  /** "14:05 · ERROR · text (×3)", most serious first. */
  lines(biasMin: number): string[] {
    const label: Record<Level, string> = { error: "ERROR", warning: "Warning" };
    return this.entries().map((e) => `${timeText(e.t, biasMin)} · ${label[e.level]} · ${e.text}${e.count > 1 ? ` (×${e.count})` : ""}`);
  }

  toJSON() {
    return { warnings: this.warnings, errors: this.errors, unseen: this.unseen };
  }

  static fromJSON(d: unknown): Problems {
    const p = new Problems();
    if (!d || typeof d !== "object") return p;
    const o = d as Record<string, unknown>;
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((e): e is Problem => !!e && typeof e === "object") : []);
    p.warnings = list(o.warnings);
    p.errors = list(o.errors);
    p.unseen = Number(o.unseen) || 0;
    return p;
  }
}

function console_(title: string, details: string[]): string {
  return details.length === 0 ? title : `${title} | ${details.join(" | ")}`;
}
