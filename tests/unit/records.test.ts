// His records: bests that only go up, the once-a-day feed line, lifetime totals, and saves without records.
import { describe, expect, it } from "vitest";
import { BRAG_FROM, Records, span } from "../../src/core/records";
import { Stats } from "../../src/core/stats";

const D1 = "2026-10-30";
const D2 = "2026-10-31";

describe("Records", () => {
  it("keeps the longest stretch between stops, which a stop starts over", () => {
    const r = new Records();
    r.walked(800, 0, 100, D1);
    r.walked(700, 0, 200, D1);
    r.stopped(D1);
    r.walked(300, 0, 300, D1);
    expect(r.best.stretchM).toBe(1500);
    expect(r.stretchM).toBe(300);
  });

  it("counts each day apart for the day bests", () => {
    const r = new Records();
    r.walked(4000, 0, 100, D1);
    r.stopped(D1);
    r.stopped(D1);
    r.walked(1000, 0, 200, D2);
    r.stopped(D2);
    expect(r.best.dayM).toBe(4000);
    expect(r.best.dayStops).toBe(2);
    expect(r.today).toEqual({ day: D2, m: 1000, stops: 1 });
  });

  it("times the run without a faint from the first count, and a faint starts it over", () => {
    const r = new Records();
    r.walked(0, 0, 1000, D1);
    r.walked(0, 0, 5000, D1);
    expect(r.best.noFaintS).toBe(4000);
    r.fainted(6000);
    r.walked(0, 0, 7000, D1);
    expect(r.best.noFaintS).toBe(4000);
    expect(r.faints).toBe(1);
  });

  it("says a new record only past its bragging floor, and at most once a day", () => {
    const r = new Records();
    expect(r.walked(BRAG_FROM.stretchM, 0, 1, D1)).toBe("");
    expect(r.walked(500, 0, 2, D1)).toBe("New record: 2.5 km without a stop!");
    expect(r.walked(500, 0, 3, D1)).toBe("");
    expect(r.best.stretchM).toBe(3000);
    expect(r.walked(500, 0, 4, D2)).toMatch(/^New record: /);
  });

  it("counts countries and cities once each", () => {
    const r = new Records();
    r.arrived("Sofia", "BG");
    r.arrived("Plovdiv", "BG");
    r.arrived("Sofia", "BG");
    r.arrived("Nowhere", "");
    expect(r.countries).toEqual(["BG"]);
    expect(r.cities).toEqual(["Sofia", "Plovdiv", "Nowhere"]);
  });

  it("round-trips through JSON and loads nothing as fresh", () => {
    const r = new Records();
    r.walked(1234, 99, 10, D1);
    r.mishap();
    expect(Records.fromJSON(JSON.parse(JSON.stringify(r))).toJSON()).toEqual(r.toJSON());
    expect(Records.fromJSON(undefined).toJSON()).toEqual(new Records().toJSON());
  });

  it("words spans in days and hours", () => {
    expect(span(5 * 3600)).toBe("5 h");
    expect(span(86400)).toBe("1 day");
    expect(span(3 * 86400 + 4 * 3600)).toBe("3 days 4 h");
  });
});

describe("Stats feeds the records", () => {
  it("from walking, stops, mishaps, faints and arrivals", () => {
    const s = new Stats();
    let t = 1792972800;
    s.now = () => t;
    s.passTime(10, 900);
    s.stop({ class: "cafe", subclass: "cafe" });
    s.arrive("Sofia", "BG", "Bulgaria");
    s.do({ name: "Juggle", min: 5, risk: { p: 1 } }, "", { randf: () => 0, randiRange: (a: number) => a } as never);
    t += 3600;
    s.wakeInHospital("");
    const r = s.records;
    expect(r.best.stretchM).toBe(900);
    expect(r.today.stops).toBe(1);
    expect(r.countries).toEqual(["BG"]);
    expect(r.mishaps).toBe(1);
    expect(r.faints).toBe(1);
    expect(r.best.cents).toBeGreaterThan(0);
  });

  it("loads stats saved before records with none yet", () => {
    const d = JSON.parse(JSON.stringify(new Stats()));
    delete d.records;
    expect(Stats.fromJSON(d).records.toJSON()).toEqual(new Stats().records.toJSON());
  });
});
