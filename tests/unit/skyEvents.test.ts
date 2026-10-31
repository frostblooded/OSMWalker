// Sky events: the game's own sky nights, rolled per night and city, seen once a night whatever the weather, the same while away.
import { describe, expect, it } from "vitest";
import { Activities } from "../../src/core/activities";
import { catchUp, type AwayCity } from "../../src/core/catchup";
import { FEATS, SETS } from "../../src/core/collection";
import { bboxAround } from "../../src/core/geo";
import { Rng } from "../../src/core/rng";
import { skyAt, type Sky } from "../../src/core/sky";
import * as K from "../../src/core/skyEvents";
import { Stats } from "../../src/core/stats";
import { parseCities, Trips } from "../../src/core/trips";
import { dataFile } from "../support/data";

const DAY = 86_400;
const T0 = Date.parse("2026-08-01T22:00Z") / 1000;
/** A night sky `offsetS` from UTC, under `weather`. */
const night = (offsetS = 0, weather: Sky["weather"] = null): Sky => ({ offsetS, clock: 22, hour: 22, season: "summer", dark: 1, rise: 6, set: 18, weather, holiday: false });
/** The first night (22:00 UTC) from T0 on in `city` whose dice give `id`, any event, or (null) none. */
function nightWith(id: K.EventId | "any" | null, city = "Sofia, Bulgaria"): number {
  for (let t = T0; ; t += DAY) {
    const ev = K.eventOn(K.nightOf(t, 0), city);
    if (id === null ? !ev : id === "any" ? ev : ev?.id === id) return t;
  }
}

describe("the sky's own nights", () => {
  it("roll each night and city once, the rarer the show the rarer the night", () => {
    const counts: Record<string, number> = {};
    const nights = 20_000;
    for (let i = 0; i < nights; i++) {
      const id = K.eventOn(K.nightOf(T0 + i * DAY, 0), "Sofia, Bulgaria")?.id ?? "none";
      counts[id] = (counts[id] ?? 0) + 1;
    }
    for (const e of Object.values(K.EVENTS)) expect(Math.abs((counts[e.id] ?? 0) / nights - e.chance)).toBeLessThan(0.006);
    expect(K.eventOn("2026-08-12", "Sofia, Bulgaria")).toBe(K.eventOn("2026-08-12", "Sofia, Bulgaria"));
  });

  it("files a night under the evening it started", () => {
    expect(K.nightOf(Date.parse("2026-08-13T01:00Z") / 1000, 0)).toBe("2026-08-12");
    expect(K.nightOf(Date.parse("2026-08-12T20:00Z") / 1000, 0)).toBe("2026-08-12");
    expect(K.nightOf(Date.parse("2026-08-13T10:00Z") / 1000, 3 * 3600)).toBe("2026-08-13");
  });
});

describe("Stargazing", () => {
  it("looks up once a night, only once it is dark, whatever the weather, and not on ordinary nights", () => {
    const t = nightWith("full_moon");
    const g = new K.Stargazing();
    expect(g.look(t, { ...night(), dark: 0.2 }, "Sofia, Bulgaria")).toBeNull();
    expect(g.look(t, night(0, { kind: "storm", tempC: 15 }), "Sofia, Bulgaria")?.id).toBe("full_moon");
    expect(g.look(t + 3600, night(), "Sofia, Bulgaria")).toBeNull();
    expect(g.look(nightWith(null), night(), "Sofia, Bulgaria")).toBeNull();
    expect(g.seen).toEqual({ full_moon: 1 });
    expect(g.count()).toBe(1);
  });

  it("round-trips through JSON, and an old save starts with nothing seen", () => {
    const g = new K.Stargazing();
    g.look(nightWith("any"), night(), "Sofia, Bulgaria");
    expect(K.Stargazing.fromJSON(JSON.parse(JSON.stringify(g))).toJSON()).toEqual(g.toJSON());
    const old = JSON.parse(JSON.stringify(new Stats()));
    delete old.stars;
    expect(Stats.fromJSON(old).stars.toJSON()).toEqual({ night: "", seen: {} });
  });
});

describe("Stats looks up", () => {
  it("on an event night, even in the rain: a line, a moodlet, his life story, the Collection and the badge", () => {
    const t = nightWith("meteor_shower");
    const s = new Stats();
    s.now = () => t;
    s.where.city = "Sofia, Bulgaria";
    s.sky = night(0, { kind: "rain", tempC: 12 });
    s.passTime(1, 0);
    const ev = K.EVENTS.meteor_shower;
    expect(s.history.entries.at(-1)?.text).toBe(`☄ ${ev.say}`);
    expect(s.mind.moodlets.find((m) => m.name === "Meteor shower")).toMatchObject({ per_h: ev.mood[0], icon: "☄" });
    expect(s.chronicle.lines.map((l) => l.text)).toContain("Looked up and saw a meteor shower");
    const set = SETS.find((x) => x.id === "sky")!.entries(s);
    expect(set).toHaveLength(Object.keys(K.EVENTS).length);
    expect(set.filter((e) => e.got).map((e) => e.id)).toEqual(["meteor_shower"]);
    expect(FEATS.find((f) => f.id === "stars")!.count(s)).toBe(1);
  });

  it("while away, on the city's own sky night", () => {
    const city = "Bigtown, A-land";
    const home: AwayCity = { name: city, code: "AAA", center: [0, 0], bounds: bboxAround(0, 0, 3000), places: null };
    const deps = { activities: new Activities(JSON.parse(dataFile("actions.json"))), trips: new Trips(parseCities("Bigtown\tAAA\tA-land\t0\t0\t1000\n")), rng: new Rng(7), skyAt: (ms: number, c: AwayCity) => skyAt(ms, c.center[0], c.center[1], 0, null), roll: () => 0.99 };
    const t = nightWith("any", city);
    const stats = new Stats();
    stats.where.city = city;
    catchUp(stats, home, [0, 0], 8 * 3600, (t - 4 * 3600) * 1000, deps);
    expect(stats.stars.seen).toEqual({ [K.eventOn(K.nightOf(t, 0), city)!.id]: 1 });
  });
});
