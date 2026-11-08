// Debug log: his last SIZE orders as they came (where from, where to, the
// pay) and how each ended (delivered, or cancelled when he couldn't get there).
import { timeText } from "./history";
import { euro } from "./money";

export const SIZE = 50;
const FORCED: Record<string, string> = { order: "New order button" };

/** An order that came, was delivered or was cancelled. */
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

  /** A save's log; entries from before the orders (cards, picks, random spots) are dropped. */
  static fromJSON(a: unknown): DebugLog {
    const log = new DebugLog();
    if (Array.isArray(a)) log.entries = a.filter((e): e is Entry => !!e && typeof e === "object" && ("order" in e || "delivered" in e || "cancelled" in e));
    return log;
  }
}

/** True for an entry worth a warning: a cancelled order. */
export const isWarning = (e: Entry) => "cancelled" in e;

/** A short title for one entry, such as "🛎 Order: Pizza Roma → Vitosha 12". */
export function title(e: Entry): string {
  if ("order" in e) return `🛎 Order${"forced" in e ? " (button)" : ""}: ${str(e.from)} → ${str(e.to)}`;
  if ("delivered" in e) return `✅ Delivered to ${str(e.to)}: ${euro(num(e.cents))}`;
  return `⚠ Cancelled: couldn't get to ${str(e.at)}`;
}

/** The lines that explain one entry. */
export function lines(e: Entry, biasMin: number): string[] {
  let head = timeText(num(e.t), biasMin);
  if ("forced" in e) head += ` · forced by the ${FORCED[str(e.forced)] ?? str(e.forced)}`;
  const out = [head];
  if ("order" in e) {
    out.push(`Pick-up ${Math.round(num(e.pickup_m))} m away, drop ${Math.round(num(e.drop_m))} m on from it, pays ${euro(num(e.cents))}`);
    out.push(`From ${num(e.food)} food places and ${num(e.doors)} doors loaded${e.street_doors ? " (no house numbers: street doors)" : ""}`);
  }
  return out;
}
