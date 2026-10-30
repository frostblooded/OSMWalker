// What the screens show about him, worked out once from the game: his look
// on the map, the soundscape, the top card (what he is
// doing, where he goes, how long until he moves again, why he waits) and the
// facts Debug lists. Plain data, so the screens only lay it out and the
// numbers are tested without a browser.
import { distanceM, type BBox } from "../core/geo";
import * as Looks from "../core/look";
import { soundscape, type Soundscape } from "../core/soundscape";
import type { LatLon, Mode } from "../core/trips";
import { pathLengthM, tripLimitM } from "../core/walker";
import type { Game } from "./game";

export type Goal =
  /** Resting at a place or spot until he moves again. */
  | { kind: "resting"; name: string; leftS: number }
  /** Walking to a place, a random spot, or a trip's station (`departing`). */
  | { kind: "going"; name: string; departing: boolean; distM: number; walkLeftM: number | null; mps: number };

export type Hud = {
  doing: "walking" | "resting" | "riding";
  /** The city's name without its country. */
  city: string;
  /** How he rides and where to, while he travels. */
  ride: { mode: Mode; to: string } | null;
  street: string;
  goal: Goal | null;
  /** How much of the rest is over, 0 to 1, while he rests in town. */
  restShare: number | null;
  /** Why he stands still when it is not a rest. */
  waiting: "" | "streets" | "failing";
};

export function hud(g: Game): Hud | null {
  const w = g.walker;
  if (!w) return null;
  const riding = w.travel;
  const resting = w.isResting();
  let waiting: Hud["waiting"] = "";
  if (!resting && w.needsData()) waiting = g.loader.isFailing() ? "failing" : "streets";
  return {
    doing: riding ? "riding" : resting ? "resting" : "walking",
    city: g.city.split(",")[0]!,
    ride: riding ? { mode: riding.mode, to: riding.to.name } : null,
    street: w.streetName(),
    goal: goal(g),
    restShare: resting && !riding ? w.restFraction() : null,
    waiting,
  };
}

function goal(g: Game): Goal | null {
  const w = g.walker!;
  const target = g.goalTarget();
  if (!target) return null;
  const name = w.place?.name ?? "";
  if (w.isResting()) return { kind: "resting", name, leftS: w.restLeftS() };
  const here = w.position();
  return { kind: "going", name, departing: w.isDeparting(), distM: distanceM(here[0], here[1], target[0], target[1]), walkLeftM: w.walkLeftM(), mps: w.speedMps };
}

/** What Debug lists about where he is. */
export type Facts = { where: LatLon; box: BBox | null; boxKm: [number, number] | null; placesInBox: number; doing: string };

export function facts(g: Game): Facts | null {
  const w = g.walker;
  if (!w) return null;
  const b = w.bounds;
  return {
    where: w.position(),
    box: b,
    boxKm: b ? [distanceM(b[0], b[1], b[0], b[3]) / 1000, distanceM(b[0], b[1], b[2], b[1]) / 1000] : null,
    placesInBox: b ? w.graph.placesIn(b).length : 0,
    doing: doing(g),
  };
}

/** What he is up to, in plain words, for Debug. */
export function doing(g: Game): string {
  const w = g.walker;
  if (!w) return "not started";
  if (w.travel) {
    const t = w.travel;
    return `travelling to ${t.to.name} by ${t.mode}, ${((t.left_m / Math.max(t.total_m, 0.001)) * pathLengthM(t.path) / 1000).toFixed(0)} km left`;
  }
  if (w.isResting()) return `staying ${w.restLeftS().toFixed(0)} s more at ${w.place?.name ?? "a spot"}`;
  const target = g.goalTarget();
  if (!target) return "no goal yet";
  const here = w.position();
  return `heading for ${w.place?.name ?? "a random spot"} ${distanceM(here[0], here[1], target[0], target[1]).toFixed(0)} m away (walked ${w.tripM.toFixed(0)} m of at most ${tripLimitM(w.tripStartM).toFixed(0)} m)`;
}

/** His face, bubble and pose: the goal's kind while he walks, what he does while he stays, nothing on a trip. */
export function look(g: Game): Looks.Look {
  const w = g.walker!;
  if (w.travel) return { face: Looks.face(g.stats.meters), bubble: "", pose: null };
  return Looks.look(g.stats.meters, w.place, w.isResting() ? g.doing : null);
}

/** What the city sound plays now. */
export function sound(g: Game): Soundscape {
  const w = g.walker!;
  return soundscape(w.place?.class ?? null, w.isResting(), !!w.travel);
}
