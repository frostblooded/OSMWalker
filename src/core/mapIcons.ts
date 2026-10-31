// Which game icons the map shows: the city's made-up places (core/poiGen.ts)
// and the real bus stations and airports he travels from, nearest to him
// first and capped, so a capital never floods the map. Quests and events add
// their own icons with another `kind`; each kind has its own cap. The
// monuments he built in this city always show, uncapped (see bricks.ts), and
// so does his spot (see spot.ts).
import { MONUMENTS, type Monument } from "./bricks";
import type { Visits } from "./spot";
import { distanceM, type BBox } from "./geo";
import { isAirport, isBusStation } from "./cityCheck";
import type { Place } from "./stats";
import type { LatLon } from "./trips";

/** Map icon names (see map/icons.ts) by the kind a made place (core/poiGen.ts) carries in `subclass` or `class`. */
export const ICON_OF: Record<string, string> = {
  bus_station: "bus", fuel: "gas", restaurant: "food", guest_house: "bed", employment_agency: "work", airport: "plane",
  notice_board: "board", guild_hall: "guild", old_well: "well", lookout: "lookout", shrine: "shrine", storyteller: "story", wizard_tower: "tower",
};

export type IconKind = "place" | "quest" | "event";
/** One icon on the map; `icon` names a picture in map/icons.ts. */
export type MapIcon = {
  id: string;
  at: LatLon;
  icon: string;
  label: string;
  kind?: IconKind;
  /** Game minute an event ends, so it can show a timer or fade. */
  ends_at?: number;
  /** True for the quest step he is on now. */
  pulse?: boolean;
};

/** Most icons of each kind on the map at once. */
export const ICON_CAP: Record<IconKind, number> = { place: 40, quest: 30, event: 10 };

/** The icon of a place, or "" when it gets none. */
export function iconOf(p: Place): string {
  if (p.made) return ICON_OF[p.subclass] ?? ICON_OF[p.class] ?? "";
  if (isBusStation(p)) return "bus";
  // Only airports he can fly from (trips.ts's list, which has codes), not every airfield on the map, so each shows once.
  if (isAirport(p) && "iata" in p) return "plane";
  return "";
}

/** Icons for the places in `places` (and `airports`, inside `box`), nearest to `here` first, at most ICON_CAP.place. */
export function placeIcons(places: Place[], airports: Place[], box: BBox, here: LatLon): MapIcon[] {
  const inBox = (p: Place) => p.lat >= box[0] && p.lat <= box[2] && p.lon >= box[1] && p.lon <= box[3];
  const out: (MapIcon & { d: number })[] = [];
  for (const p of [...places, ...airports.filter(inBox)]) {
    const icon = iconOf(p);
    if (!icon) continue;
    const id = typeof p.id === "string" ? p.id : `${p.class}:${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;
    out.push({ id, at: [p.lat, p.lon], icon, label: p.name, kind: "place", d: distanceM(here[0], here[1], p.lat, p.lon) });
  }
  const seen = new Set<string>();
  return out
    .sort((a, b) => a.d - b.d)
    .filter((i) => !seen.has(i.id) && !!seen.add(i.id))
    .slice(0, ICON_CAP.place)
    .map(({ d: _, ...i }) => i);
}

/** A plaque icon for each monument he built (core/bricks.ts) in `city`. */
export const monumentIcons = (built: Monument[], city: string): MapIcon[] =>
  built.flatMap((m, i) => (m.city === city ? [{ id: `monument:${i}`, at: [m.lat, m.lon] as LatLon, icon: "plaque", label: `His ${MONUMENTS[m.kind]!.name}`, kind: "place" as const }] : []));

/** A house icon on his spot, if he has one in this city. */
export const spotIcons = (spot: Visits | null): MapIcon[] => (spot ? [{ id: "spot", at: [spot.lat, spot.lon], icon: "home", label: `His spot: ${spot.name}`, kind: "place" }] : []);
