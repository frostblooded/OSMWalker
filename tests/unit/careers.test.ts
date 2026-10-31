// Careers: shifts rank him up, each rank pays more and brings its own shift, and he leans to his best career.
import { describe, expect, it } from "vitest";
import { Activities, weight, type ActionTable } from "../../src/core/activities";
import { CAREER_PULL, careerAt, careerOf, CAREERS, Careers, isCareerShift, isShift, rankFor, RANK_SHIFTS, rankShift, SHIFTS_TO, TOP_RANK } from "../../src/core/careers";
import { Rng } from "../../src/core/rng";
import { Stats, type Action } from "../../src/core/stats";
import { dataFile } from "../support/data";

const DATA: ActionTable = JSON.parse(dataFile("actions.json"));
const acts = () => new Activities(DATA);
const cafe = { name: "Cafe One", class: "cafe", subclass: "cafe", rank: 1, lat: 0, lon: 0 };

describe("ranks", () => {
  it("climb at the listed shifts", () => {
    expect(rankFor(0)).toBe(1);
    for (let r = 2; r <= TOP_RANK; r++) {
      expect(rankFor(SHIFTS_TO[r - 1]! - 1)).toBe(r - 1);
      expect(rankFor(SHIFTS_TO[r - 1]!)).toBe(r);
    }
    expect(rankFor(10_000)).toBe(TOP_RANK);
  });

  it("a shift says when it promotes him, and the best career is the one with most shifts", () => {
    const c = new Careers();
    expect(c.best()).toBe("");
    expect(c.shift("cafe")).toBe(2);
    expect(c.shift("cafe")).toBe(0);
    c.shift("bar");
    expect(c.best()).toBe("cafe");
    expect(c.worked().map((k) => k.id)).toEqual(["cafe", "bar"]);
  });

  it("shows the way to the next rank, and the top rank as full", () => {
    const c = Careers.fromJSON({ shifts: { cafe: 41 } });
    expect(c.standing(careerOf("cafe")!)).toEqual({ rank: 3, title: "Head barista", left: 19, share: (41 - 12) / (60 - 12) });
    c.shifts.cafe = 150;
    expect(c.standing(careerOf("cafe")!)).toEqual({ rank: 5, title: "Café owner", left: 0, share: 1 });
  });

  it("each career has 5 ranks and a shift for each rank above 1", () => {
    for (const c of CAREERS) {
      expect(c.ranks, c.id).toHaveLength(TOP_RANK);
      expect(c.shifts, c.id).toHaveLength(TOP_RANK - 1);
    }
  });
});

describe("places", () => {
  it("of one career share its rank shifts", () => {
    const a = new Activities({ cafe: [{ name: "Wash cups", min: 60, earn: 25 }], bakery: [{ name: "Knead dough", min: 60, earn: 25 }] });
    const shared = RANK_SHIFTS.get("cafe")!;
    expect(a.data.cafe!.slice(1)).toEqual(shared);
    expect(a.data.cafe![1]).toBe(a.data.bakery![1]);
  });

  it("every career's places have a shift in data/actions.json", () => {
    for (const c of CAREERS) for (const k of c.at) expect(DATA[k]?.some(isCareerShift), `${c.id}: ${k}`).toBe(true);
  });

  it("every kind of place with a career shift belongs to a career, but for the fantasy places", () => {
    const loose = Object.entries(DATA).filter(([k, l]) => l.some(isCareerShift) && !careerAt(k)).map(([k]) => k);
    expect(loose).toEqual(["guild_hall", "wizard_tower"]);
  });

  it("skill and language jobs don't count for a career, though they are shifts", () => {
    const park = acts().forPlace({ ...cafe, class: "park", subclass: "park" });
    expect(park.find((a) => a.name === "Busk")!.career).toBeUndefined();
    const hotel = acts().forPlace({ ...cafe, class: "lodging", subclass: "hotel" });
    const translate = hotel.find((a) => a.needs?.lang)!;
    expect(isShift(translate)).toBe(true);
    expect(translate.career).toBeUndefined();
    expect(hotel.find((a) => a.name === "Night receptionist shift")!.career).toBe("hotel");
  });

  it("tags the shifts of a career's places, not bets, and adds its rank shifts", () => {
    const list = acts().forPlace(cafe);
    expect(list.find((a) => a.name === "Wash cups for a shift")!.career).toBe("cafe");
    expect(list.filter((a) => a.needs?.rank).map((a) => a.name)).toEqual(careerOf("cafe")!.shifts);
    const bar = acts().forPlace({ ...cafe, class: "bar", subclass: "bar" });
    expect(bar.find((a) => a.name === "Arm-wrestling bet")!.career).toBeUndefined();
    expect(DATA.cafe!.some((a) => a.career)).toBe(false);
  });

  it("a rank shift is done only at its own rank, and pays more than the last", () => {
    const s = new Stats();
    const c = careerOf("cafe")!;
    const [r2, r3] = [rankShift(c, 2), rankShift(c, 3)];
    expect(s.canDo(r2, 12)).toBe(false);
    s.careers.shifts.cafe = 1;
    expect(s.canDo(r2, 12)).toBe(true);
    expect(s.canDo(r3, 12)).toBe(false);
    s.careers.shifts.cafe = 12;
    expect(s.canDo(r2, 12)).toBe(false);
    expect(s.canDo(r3, 12)).toBe(true);
    expect(r3.earn).toBeGreaterThan(r2.earn as number);
    expect(r2.earn).toBeGreaterThan(c.base);
  });
});

describe("Stats", () => {
  it("counts shifts, says each promotion and writes it in his life story", () => {
    const s = new Stats();
    s.now = () => 1000;
    const said: string[] = [];
    s.onSay = (l) => said.push(l);
    const job = acts().forPlace(cafe).find((a) => a.name === "Wash cups for a shift")!;
    s.do(job, "Cafe One", new Rng(1), "cafe");
    expect(s.careers.shifts.cafe).toBe(1);
    expect(said).toContain("Promoted to Barista in his Café career!");
    expect(s.chronicle.lines.map((l) => l.text)).toContain("First promotion: Barista at Cafe One");
    s.careers.shifts.cafe = SHIFTS_TO[TOP_RANK - 1]! - 1;
    s.do(job, "Cafe One", new Rng(1), "cafe");
    expect(s.chronicle.lines.map((l) => l.text)).toContain("Became Café owner, the top of his Café career");
  });

  it("bets and short jobs don't count", () => {
    const s = new Stats();
    s.do({ name: "Bet", min: 5, earn: 15, career: "bar" }, "", new Rng(1));
    s.do({ name: "Gamble", min: 60, earn: 15, risk: { p: 0 }, career: "bar" }, "", new Rng(1));
    expect(s.careers.shifts).toEqual({});
  });

  it("leans to jobs of his best career", () => {
    const s = new Stats();
    const job: Action = { name: "Wash cups", min: 60, earn: 25, career: "cafe" };
    const plain = weight(job, s);
    s.careers.shifts.cafe = 3;
    expect(weight(job, s)).toBeCloseTo(plain * CAREER_PULL, 9);
    expect(weight({ ...job, career: "bar" }, s)).toBeCloseTo(plain, 9);
  });

  it("keeps his ranks in the save, and an old save starts every career at rank 1", () => {
    const s = new Stats();
    s.careers.shifts.hotel = 20;
    const back = Stats.fromJSON(JSON.parse(JSON.stringify(s)));
    expect(back.careers.rank("hotel")).toBe(3);
    const old = JSON.parse(JSON.stringify(s));
    delete old.careers;
    expect(Stats.fromJSON(old).careers.shifts).toEqual({});
  });
});
