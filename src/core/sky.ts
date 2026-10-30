// The sky over his city: the city's clock, the season from the date and
// hemisphere, the sun's height and the day's sunrise and sunset (worked out
// on the device, no network), and what they and the weather (weather.ts) do
// to him: which places pull him, how fast he gets thirsty or tired, how fast
// he walks, and which actions he can do. Pure.
import { isOpen } from "./opening";
import type { Place } from "./stats";
import type { Vehicle } from "./speeds";
import type { Weather } from "./weather";

export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export type Season = (typeof SEASONS)[number];
/** Weather an action may need: wet (rain, snow or storm), snow, hot, cold, sunny (clear, SUNNY_MIN_C to below HOT_C). */
export const WEATHER_NEEDS = ["wet", "snow", "hot", "cold", "sunny"] as const;
export type WeatherNeed = (typeof WEATHER_NEEDS)[number];

/** Nearer the equator than this it is summer all year. */
export const TROPICS_LAT = 23.44;
/** The day counts as at least MIN_DAY_H and at most MAX_DAY_H long, even where the sun doesn't set or rise. */
export const MIN_DAY_H = 2;
export const MAX_DAY_H = 22;
/** The map starts to darken when the sun sinks below DUSK_DEG and is fully dark at NIGHT_DEG. */
export const DUSK_DEG = 0;
export const NIGHT_DEG = -8;
/** At full night the map lies under a shade this opaque. */
export const NIGHT_SHADE = 0.45;
/** At or above HOT_C he gets thirsty HOT_THIRST times as fast; at or below COLD_C he tires COLD_ENERGY_PER_H more an hour. */
export const HOT_C = 28;
export const HOT_THIRST = 1.5;
export const COLD_C = 0;
export const COLD_ENERGY_PER_H = 2;
/** Mood lost an hour in wet weather, and gained in sunny weather from SUNNY_MIN_C to below HOT_C. */
export const WET_MOOD_PER_H = 1;
export const SUNNY_MOOD_PER_H = 1;
export const SUNNY_MIN_C = 15;
/** On foot or by bike in snow he goes this share of his speed. */
export const SNOW_SPEED = 0.8;
/** In wet weather outdoor places pull his goal WET_OUTDOOR times as much and shelters WET_SHELTER times. */
export const WET_OUTDOOR = 0.25;
export const WET_SHELTER = 2;
/** In hot weather places to cool off pull HOT_COOL times as much. */
export const HOT_COOL = 3;

export const OUTDOOR = new Set([
  "park", "garden", "playground", "dog_park", "pitch", "stadium", "golf", "campsite", "harbor", "cemetery", "monument", "memorial",
  "fountain", "picnic_site", "zoo", "theme_park", "water_park", "tennis", "swimming", "drinking_water", "aerialway", "attraction",
]);
export const SHELTER = new Set([
  "museum", "art_gallery", "cafe", "library", "cinema", "theatre", "aquarium", "escape_game", "billiards", "climbing", "ice_rink",
  "chess", "sports_centre", "fitness_centre", "swimming_pool", "bar", "beer", "restaurant",
]);
export const COOLING = new Set(["ice_cream", "fountain", "swimming", "swimming_pool", "water_park", "drinking_water"]);

/** The sky at one moment in one city. `hour` is the sun's hour (sunrise 6, sunset 18) that times of day go by; `clock` is the city's clock. */
export type Sky = {
  /** The city's offset from UTC, in seconds. */
  offsetS: number;
  clock: number;
  hour: number;
  season: Season;
  /** 0 by day to 1 at night, for the map. */
  dark: number;
  /** Today's sunrise and sunset by the city's clock, in hours. */
  rise: number;
  set: number;
  weather: Weather | null;
  holiday: boolean;
};

const RAD = Math.PI / 180;
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** The city's offset from UTC in seconds when no forecast says: one hour per 15° of longitude. */
export const offsetFromLon = (lon: number) => Math.round(lon / 15) * 3600;

/** The city's clock hour (0-24) at unix ms. */
export const clockHour = (ms: number, offsetS: number) => mod(ms / 3600_000 + offsetS / 3600, 24);

/** The season at unix ms in a city at `lat`: meteorological seasons, flipped south of the equator, summer in the tropics. */
export function seasonAt(ms: number, lat: number, offsetS: number): Season {
  if (Math.abs(lat) < TROPICS_LAT) return "summer";
  const month = new Date(ms + offsetS * 1000).getUTCMonth();
  const north: Season[] = ["winter", "winter", "spring", "spring", "spring", "summer", "summer", "summer", "autumn", "autumn", "autumn", "winter"];
  const s = north[month]!;
  return lat >= 0 ? s : SEASONS[(SEASONS.indexOf(s) + 2) % 4]!;
}

/** The sun's right ascension, declination (radians) and mean longitude (degrees), d days from J2000. */
function sunCoords(d: number) {
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const l = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  return { ra: Math.atan2(Math.cos(e) * Math.sin(l), Math.cos(l)), dec: Math.asin(Math.sin(e) * Math.sin(l)), q };
}

const daysJ2000 = (ms: number) => ms / 86400_000 - 10957.5;

/** How high the sun stands at unix ms over `lat`, `lon`, in degrees (below 0 it has set). */
export function sunAltitude(ms: number, lat: number, lon: number): number {
  const d = daysJ2000(ms);
  const { ra, dec } = sunCoords(d);
  const gmst = mod(18.697374558 + 24.06570982441908 * d, 24);
  const h = (gmst * 15 + lon) * RAD - ra;
  const p = lat * RAD;
  return Math.asin(Math.sin(p) * Math.sin(dec) + Math.cos(p) * Math.cos(dec) * Math.cos(h)) / RAD;
}

/** Sunrise and sunset on the day of unix ms, by the city's clock in hours; the day is MIN_DAY_H to MAX_DAY_H long. */
export function sunTimes(ms: number, lat: number, lon: number, offsetS: number): { rise: number; set: number } {
  const { ra, dec, q } = sunCoords(daysJ2000(ms));
  const eot = mod(q - ra / RAD + 180, 360) - 180;
  const noon = mod(12 - lon / 15 - eot / 15 + offsetS / 3600, 24);
  const p = lat * RAD;
  const cosH = (Math.sin(-0.833 * RAD) - Math.sin(p) * Math.sin(dec)) / (Math.cos(p) * Math.cos(dec));
  const dayH = Math.min(Math.max((2 * Math.acos(Math.min(Math.max(cosH, -1), 1))) / RAD / 15, MIN_DAY_H), MAX_DAY_H);
  return { rise: mod(noon - dayH / 2, 24), set: mod(noon + dayH / 2, 24) };
}

/** The sun's hour for clock hour `clock`: sunrise maps to 6 and sunset to 18, the day and the night each stretched to 12 hours. */
export function sunHour(clock: number, rise: number, set: number): number {
  const day = mod(set - rise, 24);
  const t = mod(clock - rise, 24);
  return t < day ? 6 + (12 * t) / day : mod(18 + (12 * (t - day)) / (24 - day), 24);
}

/** 0 while the sun is above DUSK_DEG, rising to 1 at NIGHT_DEG. */
export const darkness = (altitude: number) => Math.min(Math.max((DUSK_DEG - altitude) / (DUSK_DEG - NIGHT_DEG), 0), 1);

/** The sky at unix ms over `lat`, `lon`, with the city's offset and weather (null when unknown). */
export function skyAt(ms: number, lat: number, lon: number, offsetS: number, weather: Weather | null, holiday = false): Sky {
  const clock = clockHour(ms, offsetS);
  const { rise, set } = sunTimes(ms, lat, lon, offsetS);
  return { offsetS, clock, hour: sunHour(clock, rise, set), season: seasonAt(ms, lat, offsetS), dark: darkness(sunAltitude(ms, lat, lon)), rise, set, weather, holiday };
}

export const isWet = (sky: Sky | null) => !!sky?.weather && ["rain", "snow", "storm"].includes(sky.weather.kind);
export const isHot = (sky: Sky | null) => !!sky?.weather && sky.weather.tempC >= HOT_C;
export const isCold = (sky: Sky | null) => !!sky?.weather && sky.weather.tempC <= COLD_C;
export const isSunny = (sky: Sky | null) => sky?.weather?.kind === "clear" && sky.weather.tempC >= SUNNY_MIN_C && sky.weather.tempC < HOT_C;

/** True when the sky meets an action's weather need. */
export function meets(need: WeatherNeed, sky: Sky | null): boolean {
  const w = sky?.weather;
  if (!w) return false;
  if (need === "wet") return isWet(sky);
  if (need === "snow") return w.kind === "snow";
  if (need === "hot") return isHot(sky);
  if (need === "cold") return isCold(sky);
  return isSunny(sky);
}

const kinds = (p: Pick<Place, "class" | "subclass">) => [`${p.class}/${p.subclass}`, p.class];
const isIn = (set: Set<string>, p: Pick<Place, "class" | "subclass">) => kinds(p).some((k) => set.has(k));

/** How much the sky makes `place` pull his next goal: 0 while it is closed, less outdoors in the wet, more for shelter or cooling off. */
export function placeWeight(place: Pick<Place, "class" | "subclass">, sky: Sky | null): number {
  if (!sky) return 1;
  if (!isOpen(place, sky.clock, sky.holiday)) return 0;
  let w = 1;
  if (isWet(sky)) w *= isIn(OUTDOOR, place) ? WET_OUTDOOR : isIn(SHELTER, place) ? WET_SHELTER : 1;
  if (isHot(sky) && isIn(COOLING, place)) w *= HOT_COOL;
  return w;
}

/** Changes to his meters an hour from the weather, on top of the usual ones. */
export function weatherPerH(sky: Sky | null): { thirstMult: number; energy: number; mood: number } {
  let mood = 0;
  if (isWet(sky)) mood -= WET_MOOD_PER_H;
  else if (isSunny(sky)) mood += SUNNY_MOOD_PER_H;
  return { thirstMult: isHot(sky) ? HOT_THIRST : 1, energy: isCold(sky) ? -COLD_ENERGY_PER_H : 0, mood };
}

/** His speed's share in this weather: SNOW_SPEED on foot or by bike in snow, else 1. */
export function speedShare(sky: Sky | null, vehicle: Vehicle): number {
  return sky?.weather?.kind === "snow" && (vehicle === "" || vehicle === "bike") ? SNOW_SPEED : 1;
}
