// Debug log: how each of his last SIZE goals was picked, with every roll,
// the odds and why a random spot was used.
import { timeText } from "./history";
import { CITY_CHANCE, COUNTRY_CHANCE } from "./trips";
import { ALL_CLOSED, ARRIVE_M } from "./walker";

export const SIZE = 50;
const FORCED: Record<string, string> = { goal: "New goal button", city: "New city button", country: "New country button" };

/** Info from Walker's picked event plus the trip roll. */
export type Entry = Record<string, unknown> & { t?: number };

const num = (v: unknown, d = 0) => (typeof v === "number" ? v : d);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const pct = (f: number) => `${(f * 100).toFixed(1)}%`;

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

  static fromJSON(a: unknown): DebugLog {
    const log = new DebugLog();
    if (Array.isArray(a)) log.entries = a.filter((e): e is Entry => !!e && typeof e === "object");
    return log;
  }
}

/** True for a pick worth a warning: a random spot for any reason but closed places. */
export const isWarning = (e: Entry) => "fallback" in e && e.fallback !== ALL_CLOSED;

/** A short title for one pick, such as "🎯 Chosen: Cafe East". */
export function title(e: Entry): string {
  const byButton = "forced" in e ? " (button)" : "";
  if ("trip" in e) return `✈ Trip: ${str(e.trip)}${byButton}`;
  if ("place" in e) return `🎯 Chosen: ${str(e.place)}${byButton}`;
  if (e.fallback === ALL_CLOSED) return `🌙 Random spot: everything near is closed${byButton}`;
  if ("fallback" in e) return `⚠ Random spot: ${num(e.in_box) === 0 ? "no places loaded" : "all places too close"}${byButton}`;
  if (str(e.no_trip) !== "") return `✖ No trip: ${str(e.no_trip)}`;
  return "🎲 Pick";
}

/** The lines that explain one pick. */
export function lines(e: Entry, biasMin: number): string[] {
  let head = timeText(num(e.t), biasMin);
  if ("forced" in e) head += ` · forced by the ${FORCED[str(e.forced)] ?? str(e.forced)}`;
  const out = [head];
  if ("skipped" in e) {
    out.push(`Trip dice not rolled: ${str(e.skipped)}`);
  } else if ("roll" in e) {
    const boost = num(e.boost, 1);
    const abroad = num(e.abroad, 1);
    out.push(
      `Trip dice ${num(e.roll).toFixed(4)} → ${str(e.outcome) || "?"} (country below ${(COUNTRY_CHANCE * abroad * boost).toFixed(2)}, city below ${((COUNTRY_CHANCE * abroad + CITY_CHANCE) * boost).toFixed(2)}, else stay)` +
        (boost > 1 ? "; odds doubled: no places in the city box" : "") +
        (abroad > 1 ? `; trips abroad ${abroad} times likelier: his visa is running out` : ""),
    );
  }
  if ("trip" in e) {
    out.push(`Trip to ${str(e.trip)}: ${num(e.options)} cities to pick from by population, this one had ${pct(num(e.chance))}`);
    if ("by" in e) out.push(`Going by ${str(e.by)}`);
    return out;
  }
  if (str(e.no_trip) !== "") out.push(`No trip: ${str(e.no_trip)}`);
  if (!("in_box" in e)) return out;
  out.push(`${num(e.in_box)} places in the city box, ${num(e.too_close)} within ${ARRIVE_M} m of him skipped`);
  if ("place" in e) {
    const rank = num(e.rank, 1);
    const w = num(e.weight, 1 / Math.max(rank, 1));
    const total = num(e.total_weight);
    out.push(`Place dice ${num(e.r).toFixed(4)} → ${str(e.place)} (${str(e.class)}, rank ${rank}, weight ${w.toFixed(3)} of ${total.toFixed(3)} = ${pct(w / Math.max(total, 0.0001))})`);
    if ("dist_w" in e) {
      out.push(
        `Weight = rank ${num(e.rank_w, 1).toFixed(2)} × distance ${num(e.dist_w).toFixed(2)} (${Math.trunc(num(e.dist_m))} m away) × heading ${num(e.heading_w, 1).toFixed(2)} × need ${num(e.need_w, 1).toFixed(2)}`,
      );
    }
  } else if ("fallback" in e) {
    const spot = Array.isArray(e.spot) ? (e.spot as number[]) : [0, 0];
    out.push(`Random spot ${spot[0]!.toFixed(5)}, ${spot[1]!.toFixed(5)} because ${str(e.fallback)} (${num(e.cells)} street cells loaded)`);
  }
  return out;
}
