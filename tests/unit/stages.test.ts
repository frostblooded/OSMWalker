// Life stages, care tiers, retiring and heirs (src/core/life.ts and Stats).
// Named apart from life.test.ts, which tests activities.
import { describe, expect, it } from "vitest";
import * as L from "../../src/core/life";
import { Life, tierOf } from "../../src/core/life";
import { START_CENTS, Stats } from "../../src/core/stats";
import type { Item } from "../../src/core/items";

const DAY = L.DAY_S;
const T0 = 1_800_000_000;

/** Stats whose clock reads `t()` and who stays fed, so only what a test does changes him. */
function him(t: { now: number }) {
  const s = new Stats();
  s.now = () => t.now;
  s.where = { city: "Sofia, Bulgaria", code: "BG", country: "Bulgaria" };
  s.life.born = t.now;
  return s;
}

/** Lets `days` pass in steps of a day, keeping him fed and watered. */
function live(s: Stats, t: { now: number }, days: number) {
  for (let d = 0; d < days; d++) {
    t.now += DAY;
    s.meters.fullness = s.meters.thirst = 100;
    s.passTime(1, 0);
  }
}

const sword = (power: number): Item => ({ name: `Sword ${power}`, slot: "weapon", stats: { str: power }, rarity: "Rare", price: 100 * power, story: { from: "Sofia", t: T0, countries: ["BG"], km: 3 } });

describe("care tiers", () => {
  it("no faint and little starving is good, many faints or long starving poor", () => {
    expect(tierOf(0, 0)).toBe("good");
    expect(tierOf(0, L.GOOD_STARVE_H * 60)).toBe("good");
    expect(tierOf(1, 0)).toBe("fine");
    expect(tierOf(0, L.GOOD_STARVE_H * 60 + 1)).toBe("fine");
    expect(tierOf(L.POOR_FAINTS, 0)).toBe("poor");
    expect(tierOf(0, L.POOR_STARVE_H * 60)).toBe("poor");
  });
});

describe("Life", () => {
  it("is born at the first minute and moves a stage every STAGE_DAYS", () => {
    const l = new Life();
    expect(l.pass(1, T0, "Sofia", 0, false)).toEqual([]);
    expect(l.born).toBe(T0);
    expect(l.pass(1, T0 + L.STAGE_DAYS * DAY - 1, "Sofia", 0, false)).toEqual([]);
    expect(l.pass(1, T0 + L.STAGE_DAYS * DAY, "Sofia", 0, false)).toEqual([1]);
    expect(l.info().id).toBe("settled");
  });

  it("enters every stage it skipped in one go, and is due to retire at the end of elder", () => {
    const l = new Life();
    l.pass(1, T0, "Sofia", 0, false);
    expect(l.pass(1, T0 + L.LIFE_S - 1, "Sofia", 0, false)).toEqual([1, 2, 3]);
    expect(l.retireDue).toBe(false);
    expect(l.stage).toBe(L.ELDER);
    l.pass(1, T0 + L.LIFE_S, "Sofia", 0, false);
    expect(l.retireDue).toBe(true);
    expect(l.stage).toBe(L.ELDER);
  });

  it("names the stage by the care in the one before", () => {
    const l = new Life();
    l.pass(1, T0, "Sofia", 0, false);
    l.faints = L.POOR_FAINTS;
    l.pass(1, T0 + L.STAGE_DAYS * DAY, "Sofia", 0, false);
    expect(l.title()).toBe("Weary Settled");
    // A new stage starts its care count over.
    expect(l.faints).toBe(0);
    l.pass(1, T0 + 2 * L.STAGE_DAYS * DAY, "Sofia", 0, false);
    expect(l.title()).toBe("Hearty Veteran");
  });

  it("counts days left, his favourite city and kilometres", () => {
    const l = new Life();
    l.pass(60, T0, "Sofia", 1500, false);
    l.pass(90, T0 + DAY, "Plovdiv", 500, true);
    expect(l.favourite("Varna")).toBe("Plovdiv");
    expect(new Life().favourite("Varna")).toBe("Varna");
    expect(l.km).toBe(2);
    expect(l.starveMin).toBe(90);
    expect(l.ageDays(T0 + DAY)).toBe(1);
    expect(l.leftS(T0 + DAY)).toBe((L.STAGE_DAYS - 1) * DAY);
  });

  it("grows the family perk each generation", () => {
    const l = new Life();
    expect(l.perkXp()).toBe(1);
    expect(l.perkCents()).toBe(0);
    const heir = l.heir({ gen: 1 } as L.Ancestor).heir({ gen: 2 } as L.Ancestor);
    expect(heir.gen).toBe(3);
    expect(heir.family.map((a) => a.gen)).toEqual([1, 2]);
    expect(heir.perkXp()).toBeCloseTo(1 + 2 * L.PERK_XP);
    expect(heir.perkCents()).toBe(2 * L.PERK_CENTS);
  });

  it("writes Roman walker names", () => {
    expect([1, 2, 4, 9, 14, 40].map(L.walkerName)).toEqual(["Walker I", "Walker II", "Walker IV", "Walker IX", "Walker XIV", "Walker XL"]);
  });

  it("a save from before life stages was born when he set out", () => {
    expect(Life.fromJSON(undefined, T0).born).toBe(T0);
    const l = new Life();
    l.pass(1, T0, "Sofia", 0, false);
    l.stage = 2;
    const back = Life.fromJSON(JSON.parse(JSON.stringify(l)), 5);
    expect(back.born).toBe(T0);
    expect(back.stage).toBe(2);
    expect(back.cityMin).toEqual({ Sofia: 1 });
  });
});

describe("Stats through his life", () => {
  it("ages with time, says the new stage and nudges its attribute by his care", () => {
    const t = { now: T0 };
    const s = him(t);
    live(s, t, L.STAGE_DAYS);
    expect(s.life.title()).toBe("Hearty Settled");
    expect(s.attrs.cha).toBe(2);
    expect(s.history.entries.some((e) => e.text.includes("Hearty Settled"))).toBe(true);
    expect(s.chronicle.lines.some((l) => l.text.includes("Hearty Settled"))).toBe(true);
  });

  it("a poor stage takes a point off, but never below zero", () => {
    const t = { now: T0 };
    const s = him(t);
    s.passTime(1, 0);
    s.attrs.cha = 0.5;
    s.meters.health = 0;
    s.wakeInHospital("");
    s.meters.health = 0;
    s.wakeInHospital("");
    live(s, t, L.STAGE_DAYS);
    expect(s.life.tier()).toBe("poor");
    expect(s.attrs.cha).toBe(0);
  });

  it("counts minutes starving", () => {
    const t = { now: T0 };
    const s = him(t);
    s.meters.fullness = 0;
    s.passTime(30, 0);
    expect(s.life.starveMin).toBe(30);
  });

  it("an elder is slower and learns faster; a settled one earns more", () => {
    const t = { now: T0 };
    const s = him(t);
    const speed = s.speedMps();
    const job = { name: "Work", min: 60, earn: 1000 };
    const wage = s.wageMult(job);
    s.life.stage = 1;
    expect(s.wageMult(job)).toBeCloseTo(wage * L.STAGES[1].wage);
    s.life.stage = L.ELDER;
    expect(s.speedMps()).toBeCloseTo(speed * L.STAGES[3].speed);
    expect(s.xpMult()).toBeCloseTo(L.STAGES[3].xp);
  });

  it("a stage skipped in one go gets its own care and title; the ones after it start with clean care", () => {
    const t = { now: T0 };
    const s = him(t);
    s.passTime(1, 0);
    s.life.faints = L.POOR_FAINTS;
    t.now += 3 * L.STAGE_DAYS * DAY;
    s.meters.fullness = s.meters.thirst = 100;
    s.passTime(1, 0);
    const said = s.history.entries.map((e) => e.text).filter((x) => x.startsWith("🏡") || x.startsWith("🧭") || x.startsWith("🧓"));
    expect(said).toEqual(["🏡 Now a Weary Settled (Charm −1)", "🧭 Now a Hearty Veteran (Strength +1)", "🧓 Now a Hearty Elder (Wits +1)"]);
    expect(s.chronicle.lines.map((l) => l.text)).toContain("Became a Weary Settled");
  });

  it("an Elder with fine care is an Elder", () => {
    expect(L.withArticle("Elder")).toBe("an Elder");
    expect(L.withArticle("Hearty Elder")).toBe("a Hearty Elder");
  });

  it("says once that he is ready to retire", () => {
    const t = { now: T0 };
    const s = him(t);
    live(s, t, 4 * L.STAGE_DAYS + 2);
    expect(s.life.retireDue).toBe(true);
    expect(s.history.entries.filter((e) => e.text.startsWith("🌅")).length).toBe(1);
  });
});

describe("retiring", () => {
  function elder() {
    const t = { now: T0 };
    const s = him(t);
    s.passTime(60, 0);
    s.where = { city: "Plovdiv, Bulgaria", code: "BG", country: "Bulgaria" };
    s.passTime(600, 4000);
    s.level = 12;
    s.cents = 99999;
    s.equip(sword(3));
    s.equip({ name: "Old Bike", slot: "vehicle", stats: { speed: 50 }, rarity: "Common", price: 15000, vehicle: "bike" });
    s.bag.push(sword(9));
    s.keepsakes.freePacks = 3;
    s.care.clovers = 7;
    s.story.style = "chaotic";
    s.milestone("trip", "First trip away: to Plovdiv");
    t.now += L.LIFE_S;
    return { s, t };
  }

  it("leaves an heir in his favourite city with the heirloom, the family perk and the binder", () => {
    const { s, t } = elder();
    const { heir, ancestor } = s.retire("age");
    expect(ancestor).toMatchObject({ gen: 1, by: "age", level: 12, home: "Plovdiv, Bulgaria", heirloom: "Sword 3", retired: t.now });
    expect(ancestor.km).toBeCloseTo(4);
    expect(ancestor.letter).toContain("Sword 3");
    expect(ancestor.letter).toContain("Plovdiv");
    expect(ancestor.chronicle.at(-1)!.text).toContain("Retired in Plovdiv");
    // His own life story stays as it was, in case the heir can't start yet.
    expect(s.chronicle.lines.some((l) => l.text.startsWith("Retired"))).toBe(false);
    expect(heir.life.gen).toBe(2);
    expect(heir.life.family).toEqual([ancestor]);
    expect(heir.level).toBe(1);
    expect(heir.cents).toBe(START_CENTS + L.PERK_CENTS);
    // The heirloom is his best worn item that isn't a vehicle, story and all.
    expect(heir.gear.weapon?.name).toBe("Sword 3");
    expect(heir.gear.weapon?.story?.km).toBe(3);
    expect(heir.gear.vehicle).toBeUndefined();
    expect(heir.bag).toEqual([]);
    // The family's binder and your clovers and storyteller stay.
    expect(heir.keepsakes).toBe(s.keepsakes);
    expect(heir.keepsakes.freePacks).toBe(3);
    expect(heir.care.clovers).toBe(7);
    expect(heir.story.style).toBe("chaotic");
    expect(heir.chronicle.lines[0]!.text).toContain("Walker I");
    expect(heir.now()).toBe(t.now);
  });

  it("with no gear he leaves no heirloom", () => {
    const t = { now: T0 };
    const s = him(t);
    s.passTime(1, 0);
    const { heir, ancestor } = s.retire("you");
    expect(ancestor.heirloom).toBe("");
    expect(ancestor.by).toBe("you");
    expect(ancestor.letter).not.toContain("Take my");
    expect(Object.keys(heir.gear)).toEqual([]);
  });

  it("the family survives a save", () => {
    const { s } = elder();
    const { heir } = s.retire("age");
    const back = Stats.fromJSON(JSON.parse(JSON.stringify(heir.toJSON())));
    expect(back.life.gen).toBe(2);
    expect(back.life.family[0]!.home).toBe("Plovdiv, Bulgaria");
  });
});

describe("the family binder", () => {
  it("an heir's cards say which walker found them", async () => {
    const { SETS } = await import("../../src/core/collection");
    const t = { now: T0 };
    const s = him(t);
    s.keepsakes.cards.set("a", { name: "Old Church", kind: "place_of_worship", city: "Sofia", rarity: "Common", finish: "", t: T0 });
    const landmarks = SETS.find((x) => x.id === "landmarks")!;
    expect(landmarks.entries(s)[0]!.info).not.toContain("Walker");
    const { heir } = s.retire("age");
    heir.keepsakes.cards.set("b", { name: "New Tower", kind: "tower", city: "Sofia", rarity: "Rare", finish: "", t: T0 + 1, gen: 2 });
    const infos = landmarks.entries(heir).map((e) => e.info);
    expect(infos[0]).toContain("Walker II");
    expect(infos[1]).toContain("Walker I");
  });
});
