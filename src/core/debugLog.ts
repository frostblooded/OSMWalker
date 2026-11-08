// Debug log: his last SIZE card deals, the player's picks (which card, how
// far, what it promised) and why a random spot was used.
import { timeText } from "./history";
import { euro } from "./money";

export const SIZE = 50;
const FORCED: Record<string, string> = { cards: "New cards button" };

/** A deal, a pick (from the game) or a random spot (from the walker's picked event). */
export type Entry = Record<string, unknown> & { t?: number };

const num = (v: unknown, d = 0) => (typeof v === "number" ? v : d);
const str = (v: unknown) => (typeof v === "string" ? v : "");

export class DebugLog {
  entries: Entry[] = [];
  now = () => Math.floor(Date.now() / 1000);

  add(info: Entry): void {
    this.entries.push({ t: this.now(), ...info });
    if (this.entries.length > SIZE) this.entries = this.entries.slice(this.entries.length - SIZE);
  }

  toJSON(): Entry[] {
    return this.entries;
  }

  /** A save's log; entries from before the cards (his own goal picks) are dropped. */
  static fromJSON(a: unknown): DebugLog {
    const log = new DebugLog();
    if (Array.isArray(a)) log.entries = a.filter((e): e is Entry => !!e && typeof e === "object" && ("dealt" in e || "picked" in e || "fallback" in e));
    return log;
  }
}

/** True for an entry worth a warning: a random spot. */
export const isWarning = (e: Entry) => "fallback" in e;

/** A short title for one entry, such as "🎯 Picked 2 of 3: Cafe East". */
export function title(e: Entry): string {
  const byButton = "forced" in e ? " (button)" : "";
  if (Array.isArray(e.dealt)) return `🃏 Dealt ${e.dealt.length} card${e.dealt.length === 1 ? "" : "s"}${byButton}`;
  if ("picked" in e) return `🎯 Picked ${num(e.picked)} of ${num(e.of)}: ${str(e.place)}`;
  return `⚠ Random spot: ${num(e.in_box) === 0 ? "no places loaded" : "none to offer"}`;
}

/** What one card promised: "far · 950 m · €8.20 + 20 XP". */
function card(c: Record<string, unknown>): string {
  const got = [num(c.cents) ? euro(num(c.cents)) : "", num(c.xp) ? `${num(c.xp)} XP` : ""].filter(Boolean).join(" + ");
  return `${str(c.slot)} · ${Math.round(num(c.dist_m))} m · ${got || "nothing"}${c.new ? " · new" : ""}`;
}

/** The lines that explain one entry. */
export function lines(e: Entry, biasMin: number): string[] {
  let head = timeText(num(e.t), biasMin);
  if ("forced" in e) head += ` · forced by the ${FORCED[str(e.forced)] ?? str(e.forced)}`;
  const out = [head];
  if (Array.isArray(e.dealt)) {
    out.push(`From ${num(e.in_box)} places in the city box`);
    e.dealt.forEach((c: Record<string, unknown>, i) => out.push(`${i + 1}. ${str(c.place)} (${str(c.kind)}): ${card(c)}`));
  } else if ("picked" in e) {
    out.push(`${str(e.kind)}: ${card(e)}`);
  } else if ("fallback" in e) {
    const spot = Array.isArray(e.spot) ? (e.spot as number[]) : [0, 0];
    out.push(`${num(e.in_box)} places in the city box`);
    out.push(`Random spot ${spot[0]!.toFixed(5)}, ${spot[1]!.toFixed(5)} because ${str(e.fallback)} (${num(e.cells)} street cells loaded)`);
  }
  return out;
}
