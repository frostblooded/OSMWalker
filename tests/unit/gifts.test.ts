import { describe, expect, it } from "vitest";
import { Care, CLOVER_AWAY_S, CLOVERS_PER_DAY, dayOf, effect, GIFTS } from "../../src/core/gifts";
import { Stats } from "../../src/core/stats";

const gift = (id: string) => GIFTS.find((g) => g.id === id)!;

describe("clovers", () => {
  it("come from reopening after an hour away", () => {
    const c = new Care();
    expect(c.checkIn(CLOVER_AWAY_S - 1, "2026-10-30")).toBe(false);
    expect(c.checkIn(CLOVER_AWAY_S, "2026-10-30")).toBe(true);
    expect(c.clovers).toBe(1);
  });

  it("stop at a few a day and start again the next day, with nothing lost in between", () => {
    const c = new Care();
    for (let i = 0; i < CLOVERS_PER_DAY + 2; i++) c.checkIn(CLOVER_AWAY_S, "2026-10-30");
    expect(c.clovers).toBe(CLOVERS_PER_DAY);
    expect(c.earnedOn("2026-10-30")).toBe(CLOVERS_PER_DAY);
    expect(c.earnedOn("2026-11-02")).toBe(0);
    expect(c.checkIn(CLOVER_AWAY_S, "2026-11-02")).toBe(true);
    expect(c.clovers).toBe(CLOVERS_PER_DAY + 1);
  });

  it("count local days", () => {
    expect(dayOf(new Date(2026, 9, 30, 23, 59).getTime())).toBe("2026-10-30");
    expect(dayOf(new Date(2026, 9, 31, 0, 1).getTime())).toBe("2026-10-31");
  });
});

describe("care packages", () => {
  it("cost clovers, one at a time", () => {
    const c = Object.assign(new Care(), { clovers: 3 });
    expect(c.whyNot(gift("guide"))).toBe("");
    expect(c.send("guide")).toBe(true);
    expect(c.clovers).toBe(1);
    expect(c.pending()?.name).toBe("City guide");
    expect(c.whyNot(gift("snack"))).toBe("One is already on its way");
    expect(c.send("snack")).toBe(false);
    expect(c.clovers).toBe(1);
  });

  it("need enough clovers", () => {
    const c = Object.assign(new Care(), { clovers: 1 });
    expect(c.whyNot(gift("guide"))).toBe("Needs 2 clovers");
    expect(c.send("guide")).toBe(false);
    expect(c.send("nope")).toBe(false);
  });

  it("are opened at his next stop: a snack feeds him", () => {
    const s = new Stats();
    s.meters.fullness = 10;
    s.care.clovers = 1;
    s.care.send("snack");
    const line = s.care.open(s);
    expect(s.meters.fullness).toBe(40);
    expect(line).toBe("Opened your care package: 🥪 Snack! Thank you! (+30 fullness, +15 thirst)");
    expect(s.history.latest()).toContain("care package");
    expect(s.care.open(s)).toBe("");
  });

  it("can be a boost for a few hours", () => {
    const s = new Stats();
    s.care.clovers = 2;
    s.care.send("guide");
    s.care.open(s);
    expect(s.attr("wit")).toBe(3);
    s.passTime(241, 0);
    expect(s.attr("wit")).toBe(1);
  });

  it("say what they do", () => {
    expect(effect(gift("coffee"))).toBe("+25 energy");
    expect(effect(gift("umbrella"))).toBe("+3 mood an hour for 4 h");
    expect(effect(gift("clover"))).toBe("+2 Luck for 4 h");
  });

  it("are kept in the save, and old saves start with none", () => {
    const s = new Stats();
    s.care.checkIn(CLOVER_AWAY_S, "2026-10-30");
    s.care.clovers = 2;
    s.care.send("snack");
    const back = Stats.fromJSON(JSON.parse(JSON.stringify(s)));
    expect(back.care.toJSON()).toEqual({ clovers: 1, day: "2026-10-30", today: 1, parcel: "snack" });
    const { care: _, ...old } = s.toJSON();
    expect(Stats.fromJSON(old as ReturnType<Stats["toJSON"]>).care.toJSON()).toEqual({ clovers: 0, day: "", today: 0, parcel: "" });
  });
});
