// Visas: days in a country make his visa better, a visa limits a stay, and its last day leans the trip dice abroad.
import { describe, expect, it } from "vitest";
import { Stats } from "../../src/core/stats";
import { COUNTRY_CHANCE, roll } from "../../src/core/trips";
import { VISA_PUSH, VISA_URGE, VISAS, visaFor, Visas } from "../../src/core/visas";

const DAY = 86400;
const T0 = Date.UTC(2026, 10, 3, 12) / 1000;

describe("visas", () => {
  it("get better with days spent in the country", () => {
    expect(visaFor(0).name).toBe("Tourist");
    expect(visaFor(VISAS[1].from - 1).name).toBe("Tourist");
    expect(visaFor(VISAS[1].from).name).toBe("Long stay");
    expect(visaFor(1e6).name).toBe("Citizen");
  });

  it("count days per country, and a new country starts a new stay", () => {
    const v = new Visas();
    v.day("BG");
    v.day("BG");
    expect([v.days.BG, v.stay]).toEqual([2, 2]);
    v.enter("RO");
    expect(v.stay).toBe(0);
    v.day("RO");
    v.enter("BG");
    v.day("BG");
    expect(v.days).toEqual({ BG: 3, RO: 1 });
    expect(v.stay).toBe(1);
  });

  it("lean abroad on a stay's last day, more past it, and never as a citizen", () => {
    const v = new Visas();
    for (let i = 0; i < VISAS[0].stay - 1; i++) v.day("BG");
    expect(v.urge()).toBe(1);
    v.day("BG");
    expect(v.left()).toBe(0);
    expect(v.urge()).toBe(VISA_URGE);
    v.stay++;
    expect(v.urge()).toBe(VISA_PUSH);
    v.days.BG = VISAS[3].from;
    expect(v.urge()).toBe(1);
  });

  it("the trip dice take a multiplier for trips abroad only", () => {
    const r = COUNTRY_CHANCE * 2;
    expect(roll(r)).toBe("city");
    expect(roll(r, 1, 4)).toBe("country");
    expect(roll(COUNTRY_CHANCE * 4 + 0.05, 1, 4)).toBe("city");
  });

  it("each new day counts in the country he is in, and he says when his visa gets better or his stay is nearly up", () => {
    const s = new Stats();
    s.arrive("Sofia", "BG", "Bulgaria");
    for (let d = 0; d < VISAS[1].from; d++) {
      s.now = () => T0 + d * DAY;
      s.passTime(1, 0);
    }
    const lines = s.history.entries.map((e) => e.text);
    expect(s.visas.days.BG).toBe(VISAS[1].from);
    expect(lines).toContain("Last day on his visa in Bulgaria: he'll be moving on soon");
    expect(lines).toContain("His visa in Bulgaria is now Long stay: stays of up to 10 days, 5% more pay at work there");
  });

  it("a better visa pays more at work there", () => {
    const s = new Stats();
    s.arrive("Sofia", "BG", "Bulgaria");
    const job = { name: "Wash cups", min: 60, earn: 10 };
    const base = s.wageMult(job);
    s.visas.days.BG = VISAS[2].from;
    expect(s.wageMult(job)).toBeCloseTo(base * (1 + VISAS[2].pay));
  });

  it("are kept in the save, and an old save has none", () => {
    const s = new Stats();
    s.visas.day("BG");
    expect(Stats.fromJSON(JSON.parse(JSON.stringify(s))).visas.days).toEqual({ BG: 1 });
    const old = JSON.parse(JSON.stringify(new Stats()));
    delete old.visas;
    expect(Stats.fromJSON(old).visas.days).toEqual({});
  });
});
