// Places the game makes up on top of the real map. Must-haves fill gaps (a
// city with no bus station, gas station, food, bed or paid work gets one near
// its centre; trips.ts gives a big city with no airport in reach its own).
// Extras give quests somewhere to happen: notice boards, an adventurers' hall,
// old wells and the like at fitting real spots, more of them in bigger cities,
// and a few wizard towers at the grandest landmarks of big ones. Everything is
// seeded from the city's name, so the same city gets the same places.
import { distanceM, moved } from "./geo";
import { Rng, seedOf, slug } from "./rng";
import type { Place } from "./stats";
import type { LatLon } from "./trips";

export type Tier = "town" | "city" | "capital";
/** Places a city must have so he can leave, eat, sleep and earn. */
export type Need = "bus" | "gas" | "food" | "bed" | "earn";
export type GenCity = { name: string; center: LatLon; pop: number };
/** The nearest street point to [lat, lon], so a must-have stands on a street. */
export type Snap = (lat: number, lon: number) => LatLon | null;

/** People up to which a place is a town, then a city; above it a capital-sized one. */
export const TOWN_POP = 50_000;
export const CITY_POP = 1_000_000;
/** Above this many people a city gets a third wizard tower. */
export const MEGA_POP = 5_000_000;
/** Extra places per size of city. */
export const EXTRAS: Record<Tier, number> = { town: 1, city: 5, capital: 15 };
/** Wizard towers per size of city, and in one above MEGA_POP. */
export const TOWERS: Record<Tier, number> = { town: 0, city: 1, capital: 2 };
export const TOWERS_MEGA = 3;
export const TOWER_KIND = "wizard_tower";
/** Wizard towers stand at least this far apart. */
export const TOWER_APART_M = 1000;
/** Must-haves stand this close to the centre at most. */
export const MUST_MAX_M = 1500;
/** Extras stand this close to the real spot they belong to. */
const NEAR_SPOT_M = 40;

export const tierOf = (pop: number): Tier => (pop > CITY_POP ? "capital" : pop > TOWN_POP ? "city" : "town");

type Must = { need: Need; class: string; subclass: string; name: (town: string) => string; m: [number, number] };
const MUST: Must[] = [
  { need: "bus", class: "bus", subclass: "bus_station", name: (t) => `${t} coach station`, m: [100, 600] },
  { need: "gas", class: "fuel", subclass: "fuel", name: (t) => `${t} filling station`, m: [700, MUST_MAX_M] },
  { need: "food", class: "restaurant", subclass: "restaurant", name: (t) => `The ${t} diner`, m: [50, 500] },
  { need: "bed", class: "lodging", subclass: "guest_house", name: (t) => `${t} inn`, m: [100, 700] },
  { need: "earn", class: "office", subclass: "employment_agency", name: (t) => `${t} job centre`, m: [100, 800] },
];

type Kind = { class: string; name: (spot: string, town: string) => string; at: string[] };
/** Extra kinds, in the order a city gets them, and the real kinds ("class" or "class/subclass") they stand by. */
const EXTRA: Kind[] = [
  { class: "notice_board", name: (s) => `Notice board at ${s}`, at: ["grocery/marketplace", "town_hall", "information", "bus", "railway", "cafe"] },
  { class: "guild_hall", name: (_s, t) => `${t} adventurers' hall`, at: ["town_hall", "library", "college", "office/government", "castle"] },
  { class: "old_well", name: (s) => `Old well in ${s}`, at: ["park", "garden", "fountain", "place_of_worship"] },
  { class: "lookout", name: (s) => `Lookout at ${s}`, at: ["attraction/viewpoint", "castle", "monument", "attraction", "park"] },
  { class: "shrine", name: (s) => `Hidden shrine near ${s}`, at: ["place_of_worship", "cemetery", "memorial", "monument", "garden"] },
  { class: "storyteller", name: (s) => `Storyteller's corner at ${s}`, at: ["library", "cafe", "beer", "theatre"] },
];
/** Landmarks a wizard tower may rise at, grandest first. */
const TOWER_AT = ["castle/castle", "attraction/viewpoint", "castle", "attraction", "monument", "museum"];

/** The made-up kinds no real place has (extras and wizard's towers), for the Collection. */
export const ODD_KINDS = [...EXTRA.map((k) => k.class), TOWER_KIND];
/** Every kind of place this file makes (and trips.ts's made airports), for icons and actions. */
export const MADE_KINDS = [...MUST.map((m) => m.subclass), ...EXTRA.map((k) => k.class), TOWER_KIND, "airport"];

const town = (name: string) => name.split(",")[0]!.trim();

const fits = (p: Place, keys: string[]) => {
  const i = keys.findIndex((k) => k === `${p.class}/${p.subclass}` || k === p.class || k === p.subclass);
  return i < 0 ? Infinity : i;
};

/** The made-up places of a city: must-haves for each of `missing`, then extras and wizard towers by its size. */
export function generate(city: GenCity, real: Place[], missing: Need[], snap: Snap): Place[] {
  const t = town(city.name);
  const id = slug(t);
  const rng = new Rng(seedOf(id));
  const out: Place[] = [];
  const spot = (m: [number, number]): LatLon => moved(city.center[0], city.center[1], rng.polar(m));
  for (const m of MUST) {
    const at = spot(m.m);
    if (!missing.includes(m.need)) continue;
    const [lat, lon] = snap(at[0], at[1]) ?? at;
    out.push({ name: m.name(t), class: m.class, subclass: m.subclass, rank: 1, lat, lon, id: `${id}:${m.subclass}:0`, made: true, must: true });
  }
  const tier = tierOf(city.pop);
  const used = new Set<Place>();
  const count = new Map<string, number>();
  for (let i = 0; i < EXTRAS[tier]; i++) {
    const k = i < EXTRA.length ? EXTRA[i]! : rng.pick(EXTRA.filter((x) => x.class !== "guild_hall"));
    const spots = real.filter((p) => !used.has(p) && fits(p, k.at) < Infinity);
    const near = spots.length ? rng.pick(spots) : null;
    if (near) used.add(near);
    const [lat, lon] = near ? moved(near.lat, near.lon, rng.polar([10, NEAR_SPOT_M])) : spot([200, MUST_MAX_M]);
    const n = count.get(k.class) ?? 0;
    count.set(k.class, n + 1);
    out.push({ name: k.name(near?.name ?? t, t), class: k.class, subclass: k.class, rank: 2, lat, lon, id: `${id}:${k.class}:${n}`, made: true, extra: true });
  }
  const towers = city.pop > MEGA_POP ? TOWERS_MEGA : TOWERS[tier];
  const marks = real
    .filter((p) => fits(p, TOWER_AT) < Infinity)
    .map((p) => ({ p, key: fits(p, TOWER_AT) * 100 + p.rank + rng.randf() }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.p);
  const raised: Place[] = [];
  for (const m of marks) {
    if (raised.length >= towers) break;
    if (raised.some((r) => distanceM(r.lat, r.lon, m.lat, m.lon) <= TOWER_APART_M)) continue;
    const [lat, lon] = moved(m.lat, m.lon, rng.polar([10, NEAR_SPOT_M]));
    raised.push({ name: `Wizard's tower at ${m.name}`, class: TOWER_KIND, subclass: TOWER_KIND, rank: 1, lat, lon, id: `${id}:${TOWER_KIND}:${raised.length}`, made: true });
  }
  return [...out, ...raised];
}
