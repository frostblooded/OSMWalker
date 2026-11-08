// What the screens show about him, worked out once from the game: his look
// on the map, the top card (his order: where he rides, how far, the pay; or
// that he is waiting for one, or for streets to load) and the facts Debug lists. Plain
// data, so the screens only lay it out and the numbers are tested without a
// browser.
import { distanceM, type BBox, type LatLon } from "../core/geo";
import * as Looks from "../core/look";
import { addressOf, type Order } from "../core/orders";
import { tripLimitM } from "../core/walker";
import type { Game } from "./game";

/** Riding to the restaurant or the customer's door. */
export type Goal = { name: string; distM: number; walkLeftM: number | null; mps: number };

export type Hud = {
  /** The city's name without its country. */
  city: string;
  street: string;
  goal: Goal | null;
  /** The order he is on, or null while he waits for one. */
  order: Order | null;
  /** Why he stands still: streets loading, or the map server out of reach. */
  waiting: "" | "streets" | "failing";
};

export function hud(g: Game): Hud | null {
  const w = g.walker;
  if (!w) return null;
  let waiting: Hud["waiting"] = "";
  if (w.needsData()) waiting = g.loader.isFailing() ? "failing" : "streets";
  return { city: g.city.split(",")[0]!, street: w.streetName(), goal: goal(g), order: g.job.order, waiting };
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
  const o = g.job.order;
  if (!target || !o) return `wandering; next order in about ${Math.ceil(g.job.waitLeftS)} s`;
  const here = w.position();
  return `${o.picked ? `delivering to ${addressOf(o.to)}` : `picking up at ${o.from.name}`} `+ `${distanceM(here[0], here[1], target[0], target[1]).toFixed(0)} m away (rode ${w.tripM.toFixed(0)} m of at most ${tripLimitM(w.tripStartM).toFixed(0)} m)`;
}

/** The bubble with where he heads (the food place, or 🏠 for the door), and the pop when he is paid. */
export function look(g: Game): Looks.Look {
  return Looks.look(g.walker!.place, g.pose());
}
