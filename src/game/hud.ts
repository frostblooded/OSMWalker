// What the screens show about him, worked out once from the game: his look
// on the map, the top card (where he goes, how far it is, why he waits:
// streets loading or the player's pick) and the facts Debug lists. Plain
// data, so the screens only lay it out and the numbers are tested without a
// browser.
import { distanceM, type BBox, type LatLon } from "../core/geo";
import * as Looks from "../core/look";
import { tripLimitM } from "../core/walker";
import type { Game } from "./game";

/** Walking to a place or a random spot. */
export type Goal = { name: string; distM: number; walkLeftM: number | null; mps: number };

export type Hud = {
  /** The city's name without its country. */
  city: string;
  street: string;
  goal: Goal | null;
  /** Why he stands still: streets loading, the map server out of reach, or the player's pick. */
  waiting: "" | "streets" | "failing" | "pick";
};

export function hud(g: Game): Hud | null {
  const w = g.walker;
  if (!w) return null;
  let waiting: Hud["waiting"] = "";
  if (w.needsData()) waiting = g.loader.isFailing() ? "failing" : "streets";
  else if (!w.goal && g.choice.offer.length) waiting = "pick";
  return { city: g.city.split(",")[0]!, street: w.streetName(), goal: goal(g), waiting };
}

function goal(g: Game): Goal | null {
  const w = g.walker!;
  const target = g.goalTarget();
  if (!target) return null;
  const here = w.position();
  return { name: w.place?.name ?? "", distM: distanceM(here[0], here[1], target[0], target[1]), walkLeftM: w.walkLeftM(), mps: w.speedMps };
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
  const target = g.goalTarget();
  if (!target) return "no goal yet";
  const here = w.position();
  return `heading for ${w.place?.name ?? "a random spot"} ${distanceM(here[0], here[1], target[0], target[1]).toFixed(0)} m away (walked ${w.tripM.toFixed(0)} m of at most ${tripLimitM(w.tripStartM).toFixed(0)} m)`;
}

/** The bubble with the kind of place he heads for, and the pop after a reward. */
export function look(g: Game): Looks.Look {
  return Looks.look(g.walker!.place, g.pose());
}
