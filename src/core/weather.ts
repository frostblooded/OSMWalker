// Real weather for his city from Open-Meteo (free, no key): one small
// request gives the city's clock offset and hourly weather from today to the
// end of tomorrow, for the watched game (the catch-up takes no weather). Pure:
// the game fetches and caches it.

export const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
/** A forecast is fetched again once it is this old. */
export const WEATHER_TTL_MS = 3600_000;
/** After a failed fetch, the next try waits this long. */
export const WEATHER_RETRY_MS = 600_000;
/** A forecast hour counts for this long either side of it. */
const HOUR_SPAN_MS = 5400_000;

export type WeatherKind = "clear" | "cloudy" | "fog" | "rain" | "snow" | "storm";
export type Weather = { kind: WeatherKind; tempC: number };
/** Hourly weather for one city: unix seconds, WMO weather codes and °C, plus the city's offset from UTC. */
export type WeatherForecast = { city: string; offsetS: number; fetchedMs: number; t: number[]; code: number[]; temp: number[] };

export function weatherUrl(lat: number, lon: number): string {
  return `${OPEN_METEO_URL}?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&hourly=temperature_2m,weather_code&forecast_days=2&timezone=auto&timeformat=unixtime`;
}

/** A WMO weather code in plain kinds. */
export function kindOf(code: number): WeatherKind {
  if (code >= 95) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if (code === 45 || code === 48) return "fog";
  if (code >= 2) return "cloudy";
  return "clear";
}

/** The forecast in an Open-Meteo answer, or null if it isn't one. */
export function parseWeather(data: unknown, city: string, fetchedMs: number): WeatherForecast | null {
  const d = data as { utc_offset_seconds?: unknown; hourly?: { time?: unknown; temperature_2m?: unknown; weather_code?: unknown } } | null;
  const h = d?.hourly;
  if (typeof d?.utc_offset_seconds !== "number" || !Array.isArray(h?.time) || !Array.isArray(h.temperature_2m) || !Array.isArray(h.weather_code)) return null;
  const f: WeatherForecast = { city, offsetS: d.utc_offset_seconds, fetchedMs, t: [], code: [], temp: [] };
  h.time.forEach((t, i) => {
    const code = (h.weather_code as unknown[])[i];
    const temp = (h.temperature_2m as unknown[])[i];
    if (typeof t !== "number" || typeof code !== "number" || typeof temp !== "number") return;
    f.t.push(t);
    f.code.push(code);
    f.temp.push(temp);
  });
  return f.t.length ? f : null;
}

/** The weather at unix ms `ms`, from the nearest forecast hour; null when the forecast doesn't reach it. */
export function weatherAt(f: WeatherForecast | null, ms: number): Weather | null {
  if (!f) return null;
  let best = -1;
  let bestD = HOUR_SPAN_MS;
  for (let i = 0; i < f.t.length; i++) {
    const d = Math.abs(f.t[i]! * 1000 - ms);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  return best < 0 ? null : { kind: kindOf(f.code[best]!), tempC: f.temp[best]! };
}
