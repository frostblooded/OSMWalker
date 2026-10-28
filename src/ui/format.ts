// Short texts the screens show, in one place so they stay consistent.
import { timeText, type History } from "../core/history";

/** "850 m" or "1.2 km". */
export function dist(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

/** Walking time for `meters` at `mps`, approximate: "<1 min", "~8 min", "~1 h 5 min". */
export function walkTime(meters: number, mps: number): string {
  const mins = Math.round(meters / mps / 60);
  if (mins < 1) return "<1 min";
  return mins < 60 ? `~${mins} min` : `~${Math.floor(mins / 60)} h ${mins % 60} min`;
}

/** Seconds left as m:ss, rounded up so it reads 1:00 at the start and never 0:00 while he still waits. */
export function countdown(seconds: number): string {
  const s = Math.ceil(Math.max(seconds - 0.001, 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "5 km/h" or "16.5 km/h". */
export function speed(mps: number): string {
  const kmh = Math.round(mps * 3.6 * 10) / 10;
  return `${kmh} km/h`;
}

export function streetLine(street: string, stopped: boolean): string {
  if (stopped) return `Stopped on ${street || "an unnamed path"}`;
  return street ? `Walking along ${street}` : "Wandering along an unnamed path";
}

/** One history row: time and text. */
export function historyTime(history: History, i: number, biasMin: number): string {
  const e = history.entries[i]!;
  return e.t > 0 ? timeText(e.t, biasMin) : "";
}

/** The browser's offset from UTC in minutes, as the game's clock texts use it. */
export const biasMin = () => -new Date().getTimezoneOffset();

/** The reset only unlocks once the player has typed the word exactly. */
export const RESET_WORD = "RESET";
export const isResetWord = (text: string) => text.trim() === RESET_WORD;

/** Splits a suggestion into the part the player typed and the rest, for bolding the rest. */
export function typedSplit(name: string, typed: string): [string, string] {
  const t = typed.trim();
  return t && name.toLowerCase().startsWith(t.toLowerCase()) ? [name.slice(0, t.length), name.slice(t.length)] : ["", name];
}
