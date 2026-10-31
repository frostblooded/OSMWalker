// Sky events: real full moons, shower peaks and lunar eclipses, seen once a night unless clouds hide them, the same while away.
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

const sec = (iso: string) => Date.parse(iso) / 1000;
/** A night sky `offsetS` from UTC with sunset at 18 and sunrise at 6, and `weather`. */
const night = (offsetS = 0, weather: Sky["weather"] = null): Sky => ({ offsetS, clock: 22, hour: 22, season: "autumn", dark: 1, rise: 6, set: 18, weather, holiday: false });

describe("the sky calendar", () => {
  it("knows the real full moon of 26 Oct 2026, 04:12 UTC, as the night of the 25th", () => {
    expect(K.fromFull(sec("2026-10-26T04:12Z"))).toBeLessThan(0.3);
    expect(K.eventOn("2026-10-25", 0, 18, 6)?.id).toBe("full_moon");
    expect(K.eventOn("2026-10-27", 0, 18, 6)).toBeNull();
  });

  it("puts a shower on its peak night and an eclipse only where it falls in the night", () => {
    expect(K.eventOn("2026-08-12", 0, 21, 5)?.id).toBe("perseids");
    expect(K.eventOn("2026-12-13", 0, 16, 8)?.id).toBe("geminids");
    // The eclipse of 3 March 2026 peaks at 11:33 UTC: day in London, before dawn in Chicago.
    expect(K.eventOn("2026-03-02", -6 * 3600, 18, 6)?.id).toBe("lunar_eclipse");
    expect(K.eventOn("2026-03-02", 0, 18, 6)?.id).not.toBe("lunar_eclipse");
  });

  it("files a night under the evening it started", () => {
    expect(K.nightOf(sec("2026-08-13T01:00Z"), 0)).toBe("2026-08-12");
    expect(K.nightOf(sec("2026-08-12T20:00Z"), 0)).toBe("2026-08-12");
    expect(K.nightOf(sec("2026-08-12T23:00Z"), 3 * 3600)).toBe("2026-08-12");
    expect(K.nightOf(sec("2026-08-13T10:00Z"), 3 * 3600)).toBe("2026-08-13");
  });
});

describe("Stargazing", () => {
  const PERSEIDS = sec("2026-08-12T22:00Z");

  it("looks up once a night, only once it is dark, and not on ordinary nights", () => {
    const g = new K.Stargazing();
    expect(g.look(PERSEIDS, { ...night(), dark: 0.2 })).toBeNull();
    expect(g.look(PERSEIDS, night())).toMatchObject({ ev: { id: "perseids" }, hidden: false });
    expect(g.look(PERSEIDS + 3600, night())).toBeNull();
    expect(g.look(sec("2026-08-14T22:00Z"), night())).toBeNull();
    expect(g.seen).toEqual({ perseids: 1 });
    expect(g.count()).toBe(1);
  });

  it("waits for an eclipse to come round in the night before he sees it", () => {
    const g = new K.Stargazing();
    // 3 March 2026, 11:33 UTC, is 05:33 in Chicago (UTC-6): not at dusk on the 2nd, but then.
    const chicago = night(-6 * 3600);
    expect(g.look(sec("2026-03-03T00:30Z"), chicago)).toBeNull();
    expect(g.look(sec("2026-03-03T11:40Z"), chicago)).toMatchObject({ ev: { id: "lunar_eclipse" } });
  });

  it("misses it under real clouds, but sees it when the weather is unknown", () => {
    const g = new K.Stargazing();
    expect(g.look(PERSEIDS, night(0, { kind: "cloudy", tempC: 15 }))).toMatchObject({ hidden: true });
    expect(g.count()).toBe(0);
    expect(g.clouded).toBe(1);
    expect(g.look(sec("2026-10-25T22:00Z"), night(0, null))).toMatchObject({ ev: { id: "full_moon" }, hidden: false });
  });

  it("round-trips through JSON, and an old save starts with nothing seen", () => {
    const g = new K.Stargazing();
    g.look(PERSEIDS, night());
    expect(K.Stargazing.fromJSON(JSON.parse(JSON.stringify(g))).toJSON()).toEqual(g.toJSON());
    const old = JSON.parse(JSON.stringify(new Stats()));
    delete old.stars;
    expect(Stats.fromJSON(old).stars.toJSON()).toEqual({ night: "", seen: {}, clouded: 0 });
  });
});

describe("Stats looks up", () => {
  const at = (t: number, sky: Sky) => {
    const s = new Stats();
    s.now = () => t;
    s.sky = sky;
    return s;
  };

  it("on a clear event night: a line, a moodlet, his life story, the Collection and the badge", () => {
    const s = at(sec("2026-08-12T22:00Z"), night());
    s.passTime(1, 0);
    expect(s.history.entries.at(-1)?.text).toBe(`☄ ${K.EVENTS.perseids.say}`);
    expect(s.mind.moodlets.find((m) => m.name === "Perseids")).toMatchObject({ per_h: K.EVENTS.perseids.mood[0], icon: "☄" });
    expect(s.chronicle.lines.map((l) => l.text)).toContain("Looked up and saw the Perseids");
    const set = SETS.find((x) => x.id === "sky")!.entries(s);
    expect(set).toHaveLength(Object.keys(K.EVENTS).length);
    expect(set.filter((e) => e.got).map((e) => e.id)).toEqual(["perseids"]);
    expect(FEATS.find((f) => f.id === "stars")!.count(s)).toBe(1);
  });

  it("under clouds: only a grumble", () => {
    const s = at(sec("2026-08-12T22:00Z"), night(0, { kind: "rain", tempC: 15 }));
    s.passTime(1, 0);
    expect(s.history.entries.at(-1)?.text).toBe("☄ Clouds hid the Perseids tonight. He looked up anyway");
    expect(s.mind.moodlets.some((m) => m.name === "Perseids")).toBe(false);
  });

  it("while away, the real sky over the city", () => {
    const home: AwayCity = { name: "Bigtown, A-land", code: "AAA", center: [42.7, 23.3], bounds: bboxAround(42.7, 23.3, 3000), places: null };
    const deps = { activities: new Activities(JSON.parse(dataFile("actions.json"))), trips: new Trips(parseCities("Bigtown\tAAA\tA-land\t42.7\t23.3\t1000\n")), rng: new Rng(7), skyAt: (ms: number, c: AwayCity) => skyAt(ms, c.center[0], c.center[1], 3 * 3600, null), roll: () => 0.99 };
    const stats = new Stats();
    catchUp(stats, home, [42.7, 23.3], 20 * 3600, Date.UTC(2026, 7, 12, 12), deps);
    expect(stats.stars.seen).toEqual({ perseids: 1 });
  });
});
