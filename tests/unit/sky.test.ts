// The sky on its own: the sun, seasons, the city's clock, opening hours,
// Open-Meteo forecasts, and what weather does to him and to his goals.
import { describe, expect, it } from "vitest";
import type { ActionTable } from "../../src/core/activities";
import { dataFile } from "../support/data";
import { ALL_NIGHT, CLOSE_H, DAY_ONLY, isOpen, OPEN_H } from "../../src/core/opening";
import * as Sky from "../../src/core/sky";
import { Stats, type Action } from "../../src/core/stats";
import { skyIcon } from "../../src/game/hud";
import { kindOf, parseWeather, weatherAt, weatherUrl, type Weather } from "../../src/core/weather";

const at = (lat: number, lon: number, offsetH: number, weather: Weather | null = null, ms = Date.UTC(2026, 5, 21, 12)) =>
  Sky.skyAt(ms, lat, lon, offsetH * 3600, weather);
const near = (a: number, b: number, mins = 6) => expect(Math.abs(a - b) * 60).toBeLessThan(mins);
const shop = { class: "shop", subclass: "clothes" };
const park = { class: "park", subclass: "park" };

describe("the sun", () => {
  it("rises and sets at the real times", () => {
    // London on 21 June 2026: 04:43 and 21:21 BST. New York on 20 March: 07:00 and 19:11 EDT.
    const london = Sky.sunTimes(Date.UTC(2026, 5, 21, 12), 51.5074, -0.1278, 3600);
    near(london.rise, 4 + 43 / 60);
    near(london.set, 21 + 21 / 60);
    const nyc = Sky.sunTimes(Date.UTC(2026, 2, 20, 16), 40.7128, -74.006, -4 * 3600);
    near(nyc.rise, 7);
    near(nyc.set, 19 + 11 / 60);
  });

  it("keeps a day of at least MIN_DAY_H and at most MAX_DAY_H near the poles", () => {
    const winter = Sky.sunTimes(Date.UTC(2026, 11, 21, 12), 78.2, 15.6, 3600);
    expect((winter.set - winter.rise + 24) % 24).toBeCloseTo(Sky.MIN_DAY_H);
    const summer = Sky.sunTimes(Date.UTC(2026, 5, 21, 12), 78.2, 15.6, 3600);
    expect((summer.set - summer.rise + 24) % 24).toBeCloseTo(Sky.MAX_DAY_H);
  });

  it("is high at noon and below the horizon at midnight", () => {
    expect(Sky.sunAltitude(Date.UTC(2026, 5, 21, 12), 0, 0)).toBeGreaterThan(60);
    expect(Sky.sunAltitude(Date.UTC(2026, 5, 21, 0), 0, 0)).toBeLessThan(-60);
  });

  it("maps sunrise to 6 and sunset to 18, stretching day and night", () => {
    expect(Sky.sunHour(5, 5, 21)).toBeCloseTo(6);
    expect(Sky.sunHour(13, 5, 21)).toBeCloseTo(12);
    expect(Sky.sunHour(21, 5, 21)).toBeCloseTo(18);
    expect(Sky.sunHour(1, 5, 21)).toBeCloseTo(0);
  });

  it("darkens the map from dusk to night", () => {
    expect(Sky.darkness(10)).toBe(0);
    expect(Sky.darkness((Sky.DUSK_DEG + Sky.NIGHT_DEG) / 2)).toBeCloseTo(0.5);
    expect(Sky.darkness(-20)).toBe(1);
    expect(at(51.5, 0, 0, null, Date.UTC(2026, 5, 21, 12)).dark).toBe(0);
    expect(at(51.5, 0, 0, null, Date.UTC(2026, 5, 21, 0)).dark).toBe(1);
  });
});

describe("the city's clock and season", () => {
  it("uses the city's offset, or one hour per 15 degrees of longitude", () => {
    expect(Sky.clockHour(Date.UTC(2026, 0, 1, 23, 30), 9 * 3600)).toBeCloseTo(8.5);
    expect(Sky.offsetFromLon(139.7)).toBe(9 * 3600);
    expect(Sky.offsetFromLon(-74)).toBe(-5 * 3600);
  });

  it("flips seasons south of the equator and keeps the tropics in summer", () => {
    const jan = Date.UTC(2026, 0, 15);
    expect(Sky.seasonAt(jan, 48, 3600)).toBe("winter");
    expect(Sky.seasonAt(jan, -34, 3600)).toBe("summer");
    expect(Sky.seasonAt(Date.UTC(2026, 3, 15), 48, 0)).toBe("spring");
    expect(Sky.seasonAt(Date.UTC(2026, 9, 15), 48, 0)).toBe("autumn");
    expect(Sky.seasonAt(Date.UTC(2026, 9, 15), -34, 0)).toBe("spring");
    expect(Sky.seasonAt(jan, 1.3, 0)).toBe("summer");
  });

  it("counts the local date for the season", () => {
    // 30 Nov 23:00 UTC is already 1 Dec in Tokyo.
    expect(Sky.seasonAt(Date.UTC(2026, 10, 30, 23), 35.7, 9 * 3600)).toBe("winter");
  });
});

describe("opening hours", () => {
  it("closes shops, offices and museums at night, never kiosks, bars or parks", () => {
    expect(isOpen(shop, 12)).toBe(true);
    expect(isOpen(shop, CLOSE_H)).toBe(false);
    expect(isOpen(shop, OPEN_H - 0.5)).toBe(false);
    expect(isOpen({ class: "office", subclass: "company" }, 23)).toBe(false);
    expect(isOpen({ class: "museum", subclass: "museum" }, 2)).toBe(false);
    expect(isOpen({ class: "shop", subclass: "kiosk" }, 2)).toBe(true);
    expect(isOpen({ class: "bar", subclass: "bar" }, 2)).toBe(true);
    expect(isOpen(park, 2)).toBe(true);
  });

  it("keeps day businesses closed all day on a holiday", () => {
    expect(isOpen(shop, 12, true)).toBe(false);
    expect(isOpen({ class: "fast_food", subclass: "fast_food" }, 12, true)).toBe(true);
  });
});

describe("what the sky does", () => {
  const rain: Weather = { kind: "rain", tempC: 12 };
  const hot: Weather = { kind: "clear", tempC: 32 };

  it("gives closed places no pull and favours shelter in the wet and cooling off in heat", () => {
    const noon = Date.UTC(2026, 5, 21, 12);
    expect(Sky.placeWeight(shop, at(0, 0, 0, null, Date.UTC(2026, 5, 21, 23)))).toBe(0);
    expect(Sky.placeWeight(park, at(0, 0, 0, rain, noon))).toBe(Sky.WET_OUTDOOR);
    expect(Sky.placeWeight({ class: "museum", subclass: "museum" }, at(0, 0, 0, rain, noon))).toBe(Sky.WET_SHELTER);
    expect(Sky.placeWeight({ class: "ice_cream", subclass: "ice_cream" }, at(0, 0, 0, hot, noon))).toBe(Sky.HOT_COOL);
    expect(Sky.placeWeight(park, null)).toBe(1);
  });

  it("takes a closed place out of his needs, urgent ones too, and scales the rest", () => {
    const hungry = { pull: 3, urgent: true, bottom: true, why: "fullness" as const };
    expect(Sky.skyNeed(hungry, shop, at(0, 0, 0, null, Date.UTC(2026, 5, 21, 23)))).toEqual({ ...hungry, pull: 0, urgent: false, bottom: false });
    expect(Sky.skyNeed(hungry, park, at(0, 0, 0, rain, Date.UTC(2026, 5, 21, 12)))).toEqual({ ...hungry, pull: 3 * Sky.WET_OUTDOOR });
    expect(Sky.skyNeed(hungry, park, null)).toBe(hungry);
  });

  it("changes his meters and speed", () => {
    expect(Sky.weatherPerH(at(0, 0, 0, hot)).thirstMult).toBe(Sky.HOT_THIRST);
    expect(Sky.weatherPerH(at(0, 0, 0, { kind: "cloudy", tempC: -5 })).energy).toBe(-Sky.COLD_ENERGY_PER_H);
    expect(Sky.weatherPerH(at(0, 0, 0, rain)).mood).toBe(-Sky.WET_MOOD_PER_H);
    expect(Sky.weatherPerH(at(0, 0, 0, { kind: "clear", tempC: 20 })).mood).toBe(Sky.SUNNY_MOOD_PER_H);
    expect(Sky.weatherPerH(null)).toEqual({ thirstMult: 1, energy: 0, mood: 0 });
    const snow = at(0, 0, 0, { kind: "snow", tempC: -2 });
    expect(Sky.speedShare(snow, "")).toBe(Sky.SNOW_SPEED);
    expect(Sky.speedShare(snow, "car")).toBe(1);
  });

  it("tells which weather needs are met", () => {
    expect(Sky.meets("wet", at(0, 0, 0, { kind: "storm", tempC: 20 }))).toBe(true);
    expect(Sky.meets("snow", at(0, 0, 0, rain))).toBe(false);
    expect(Sky.meets("sunny", at(0, 0, 0, { kind: "clear", tempC: 20 }))).toBe(true);
    expect(Sky.meets("sunny", at(0, 0, 0, hot))).toBe(false);
    expect(Sky.meets("sunny", at(0, 0, 0, { kind: "clear", tempC: 20 }, Date.UTC(2026, 5, 21, 0)))).toBe(false);
    expect(Sky.meets("cold", at(0, 0, 0, { kind: "snow", tempC: -1 }))).toBe(true);
    expect(Sky.meets("hot", null)).toBe(false);
  });
});

describe("Open-Meteo weather", () => {
  const answer = { utc_offset_seconds: 7200, hourly: { time: [1000 * 3600, 1001 * 3600, 1002 * 3600], temperature_2m: [10, 11, null], weather_code: [0, 61, 71] } };

  it("asks for today and tomorrow with the city's time zone", () => {
    expect(weatherUrl(42.69771, 23.32187)).toContain("latitude=42.70&longitude=23.32");
    expect(weatherUrl(0, 0)).toContain("?latitude=0.00&longitude=0.00&hourly=temperature_2m,weather_code&forecast_days=2&timezone=auto&timeformat=unixtime");
  });

  it("reads the answer, skipping hours with gaps", () => {
    const f = parseWeather(answer, "Sofia", 5)!;
    expect(f).toEqual({ city: "Sofia", offsetS: 7200, fetchedMs: 5, t: [1000 * 3600, 1001 * 3600], code: [0, 61], temp: [10, 11] });
    expect(parseWeather({ error: true }, "x", 0)).toBeNull();
  });

  it("gives the nearest hour, or null outside the forecast", () => {
    const f = parseWeather(answer, "Sofia", 0);
    expect(weatherAt(f, 1001 * 3600_000 - 600_000)).toEqual({ kind: "rain", tempC: 11 });
    expect(weatherAt(f, 1010 * 3600_000)).toBeNull();
    expect(weatherAt(null, 0)).toBeNull();
  });

  it("turns WMO codes into kinds", () => {
    expect([0, 1, 2, 3, 45, 51, 63, 66, 80, 71, 85, 95].map(kindOf)).toEqual(["clear", "clear", "cloudy", "cloudy", "fog", "rain", "rain", "rain", "rain", "snow", "snow", "storm"]);
  });
});

describe("him under the sky", () => {
  const noon = Date.UTC(2026, 0, 15, 12);
  const sky = (weather: Weather | null, lat = 48) => Sky.skyAt(noon, lat, 0, 0, weather);

  it("does season and weather actions only when they fit", () => {
    const s = new Stats();
    const mulled: Action = { name: "Mulled wine", min: 1, needs: { season: "winter" } };
    const puddles: Action = { name: "Jump in puddles", min: 1, needs: { weather: "wet" } };
    expect(s.canDo(mulled, 12)).toBe(false);
    s.sky = sky({ kind: "rain", tempC: 3 });
    expect(s.canDo(mulled, 12)).toBe(true);
    expect(s.canDo(puddles, 12)).toBe(true);
    s.sky = sky({ kind: "clear", tempC: 3 }, -34);
    expect(s.canDo(mulled, 12)).toBe(false);
    expect(s.canDo(puddles, 12)).toBe(false);
  });

  it("gets thirsty faster in heat, tires in the cold and slows in snow", () => {
    const calm = new Stats();
    const hot = new Stats();
    hot.sky = sky({ kind: "cloudy", tempC: 35 });
    calm.passTime(60, 0);
    hot.passTime(60, 0);
    expect(80 - hot.meters.thirst).toBeCloseTo((80 - calm.meters.thirst) * Sky.HOT_THIRST);
    const cold = new Stats();
    cold.sky = sky({ kind: "cloudy", tempC: -5 });
    cold.passTime(60, 0);
    expect(cold.meters.energy).toBeCloseTo(100 - Sky.COLD_ENERGY_PER_H);
    const snow = new Stats();
    snow.sky = sky({ kind: "snow", tempC: -1 });
    expect(snow.speedMps()).toBeCloseTo(new Stats().speedMps() * Sky.SNOW_SPEED);
  });
});

describe("the game data", () => {
  it("only needs seasons and weather that exist", () => {
    const tables = [JSON.parse(dataFile("actions.json")) as ActionTable, ...Object.values(JSON.parse(dataFile("flavour.json")) as Record<string, ActionTable>)];
    for (const t of tables)
      for (const [key, list] of Object.entries(t))
        for (const a of list) {
          if (a.needs?.season) expect(Sky.SEASONS, `${key}: ${a.name}`).toContain(a.needs.season);
          if (a.needs?.weather) expect(Sky.WEATHER_NEEDS, `${key}: ${a.name}`).toContain(a.needs.weather);
        }
  });
});

describe("the sky's icon", () => {
  it("shows the weather, a moon on clear nights, and the season while the weather is unknown", () => {
    const day = Date.UTC(2026, 0, 15, 12);
    const night = Date.UTC(2026, 0, 15, 0);
    expect(skyIcon(Sky.skyAt(day, 48, 0, 0, { kind: "rain", tempC: 5 }))).toBe("🌧");
    expect(skyIcon(Sky.skyAt(day, 48, 0, 0, { kind: "clear", tempC: 5 }))).toBe("☀");
    expect(skyIcon(Sky.skyAt(night, 48, 0, 0, { kind: "clear", tempC: 5 }))).toBe("🌙");
    expect(skyIcon(Sky.skyAt(day, 48, 0, 0, null))).toBe("❄");
  });
});

describe("the kinds of place the sky names", () => {
  it("are kinds the game has actions for", () => {
    const keys = Object.keys(JSON.parse(dataFile("actions.json")) as ActionTable);
    const known = (k: string) => keys.includes(k) || keys.includes(k.split("/")[0]!);
    for (const set of [DAY_ONLY, ALL_NIGHT, Sky.OUTDOOR, Sky.SHELTER, Sky.COOLING]) for (const k of set) expect(known(k), k).toBe(true);
  });
});
