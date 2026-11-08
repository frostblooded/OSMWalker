// Short texts the screens show, in one place so they stay consistent.
import type { Offer } from "../core/cards";
import { distanceM } from "../core/geo";
import { timeText, type History } from "../core/history";
import { placeIcon } from "../core/look";
import { euro } from "../core/money";
import type { Reward } from "../core/places";
import { upgradeOf } from "../core/upgrades";

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

/** What a card gives: "💶 €3.40", "⭐ 30 XP" or both. */
export function rewardText(r: Reward): string {
  return [r.cents ? `💶 ${euro(r.cents)}` : "", r.xp ? `⭐ ${r.xp} XP` : ""].filter(Boolean).join(" · ") || "nothing";
}

/** A card's two lines: where he goes, and what he gets there. */
export function cardText(o: Offer): { name: string; gets: string } {
  const at = `${placeIcon(o.place)} ${o.place.name}`;
  const u = o.upgrade && upgradeOf(o.upgrade);
  if (u) return { name: at, gets: `${u.icon} Buy a ${u.name} · ${euro(u.cents)}` };
  if (o.slot === "parcel" && o.to) return { name: `📦 ${o.place.name} → ${o.to.name}`, gets: rewardText(o.reward) };
  if (o.slot === "metro" && o.to) return { name: `🚇 ${o.place.name}`, gets: `Ride to ${o.to.name}, ${dist(distanceM(o.place.lat, o.place.lon, o.to.lat, o.to.lon))} off` };
  if (o.slot === "train") return { name: `🚆 ${o.place.name}`, gets: "Train to another city" };
  if (o.slot === "guide") return { name: at, gets: `📕 ${rewardText(o.reward)}` };
  return { name: at, gets: rewardText(o.reward) };
}

export function streetLine(street: string): string {
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
