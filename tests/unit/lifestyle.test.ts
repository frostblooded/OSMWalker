// His coffee habit, his clothes wearing out, and his beliefs.
import { describe, expect, it } from "vitest";
import { minded, weight } from "../../src/core/activities";
import * as B from "../../src/core/beliefs";
import * as Cl from "../../src/core/clothes";
import * as Co from "../../src/core/coffee";
import { NO_NEED } from "../../src/core/goals";
import * as Items from "../../src/core/items";
import { Rng } from "../../src/core/rng";
import { Stats, type Action } from "../../src/core/stats";
import { dataFile } from "../support/data";

const T0 = 1_800_000_000;
const H = 3600;
const DAY = 86400;
const at = (t = T0) => {
  const s = new Stats();
  s.now = () => t;
  s.meters.mood = 50;
  s.meters.energy = 50;
  return s;
};
const ESPRESSO: Action = { name: "Espresso", min: 3, cost: 3, coffee: true };
const shirt = (wear?: number): Items.Item => ({ name: "Cotton Shirt", slot: "body", stats: { cha: 1 }, rarity: "Common", price: 1000, ...(wear === undefined ? {} : { wear }) });
const feels = (s: Stats) => s.mind.moodlets.map((m) => m.name);
const actions = (): Record<string, Action[]> => JSON.parse(dataFile("actions.json"));
/** Dice that always roll `r`. */
const fixed = (r: number) => () => ({ randf: () => r, pick: <T>(l: readonly T[]) => l[0]! }) as unknown as Rng;

describe("coffee habit", () => {
  it("each cup builds it, each day fades it, and enough cups hook him", () => {
    const c = new Co.Coffee();
    expect(c.drink(T0)).toBe("");
    for (let i = 1; i < Math.ceil(Co.HOOKED / Co.CUP_HABIT) - 1; i++) c.drink(T0);
    expect(c.hooked()).toBe(false);
    expect(c.drink(T0)).toContain("Can't start the day");
    expect(c.hooked()).toBe(true);
    c.day(T0 + DAY);
    expect(c.habit).toBeCloseTo(Co.HOOKED - Co.DAY_FADE);
  });

  it("hooked, he craves a cup after CRAVE_H and gets one headache after ACHE_H", () => {
    const c = Co.Coffee.fromJSON({ habit: 1, last: T0 });
    expect(c.pull("cafe", T0 + (Co.CRAVE_H - 1) * H)).toBe(1);
    expect(c.pull("cafe", T0 + Co.CRAVE_H * H)).toBe(Co.CRAVE_PULL);
    expect(c.pull("bar", T0 + Co.CRAVE_H * H)).toBe(1);
    expect(c.pass(T0 + (Co.ACHE_H - 1) * H)).toBe(false);
    expect(c.pass(T0 + Co.ACHE_H * H)).toBe(true);
    expect(c.pass(T0 + Co.ACHE_H * H + 60)).toBe(false);
  });

  it("after QUIT_AFTER headaches he cuts down on his own: no habit, cafés pull less, cups build none", () => {
    const c = Co.Coffee.fromJSON({ habit: 1, headaches: Co.QUIT_AFTER });
    expect(c.day(T0)).toContain("cut down");
    expect(c.habit).toBe(0);
    expect(c.pull("cafe", T0 + DAY)).toBe(Co.QUIT_PULL);
    c.drink(T0 + DAY);
    expect(c.habit).toBe(0);
    expect(c.pull("cafe", T0 + Co.QUIT_DAYS * DAY)).toBe(1);
  });

  it("a habit that fades by itself says so", () => {
    const c = Co.Coffee.fromJSON({ habit: Co.HOOKED });
    expect(c.day(T0)).toContain("Doesn't need his coffee");
  });

  it("through Stats: a coffee action counts, the headache comes as time passes, and a cup ends it", () => {
    const s = at();
    s.cents = 10_000;
    s.coffee = Co.Coffee.fromJSON({ habit: 1, last: T0 - Co.ACHE_H * H });
    s.passTime(1, 0);
    expect(feels(s)).toContain(Co.HEADACHE[0]);
    expect(minded(NO_NEED, { class: "cafe" }, s).pull).toBeGreaterThan(1);
    s.do(ESPRESSO, "Cafe", new Rng(1), "");
    expect(s.coffee.cups).toBe(1);
    expect(feels(s)).not.toContain(Co.HEADACHE[0]);
  });
});

describe("clothes wear", () => {
  it("only cloth head, body and feet pieces wear out", () => {
    const gear: Partial<Record<Items.Slot, Items.Item>> = { body: shirt(), head: { ...shirt(), name: "Iron Helmet", slot: "head" }, bag: { ...shirt(), name: "Cotton Backpack", slot: "bag" } };
    Cl.wear(gear, 10, false);
    expect([gear.body!.wear, gear.head!.wear, gear.bag!.wear]).toEqual([10, undefined, undefined]);
    for (const [kind, bases] of Object.entries(Items.KINDS))
      for (const base of bases as Items.Base[]) {
        const item = Items.build(base, Items.MATERIALS[2]!, []);
        expect(Cl.isCloth(item), `${kind} ${item.name}`).toBe(!!base.cloth && Cl.WEAR_SLOTS.includes(base.slot));
      }
  });

  it("says when a piece wears thin and when it is worn through; rain wears it faster", () => {
    const gear = { body: shirt() };
    expect(Cl.wear(gear, Cl.WEAR_KM * Cl.THIN_AT, false).lines).toEqual(["🧵 His Cotton Shirt is wearing thin"]);
    const through = Cl.wear(gear, (Cl.WEAR_KM * (1 - Cl.THIN_AT)) / Cl.RAIN_WEAR, true);
    expect(through).toEqual({ lines: ["🧵 His Cotton Shirt is worn through"], tattered: true });
    expect(Cl.isTattered(gear.body)).toBe(true);
  });

  it("tattered, it adds nothing and costs Charm and mood; clothes shops pull him; anything new replaces it and it is thrown away", () => {
    const s = at();
    s.gear.body = shirt();
    const cha = s.attr("cha");
    s.gear.body = shirt(Cl.WEAR_KM - 0.001);
    s.passTime(1, 10, true);
    expect(s.attr("cha")).toBeCloseTo(cha - 1 - Cl.TATTERED_CHA);
    expect(feels(s)).toContain(Cl.TATTERED[0]);
    const pull = minded(NO_NEED, { class: "clothing_store" }, s).pull;
    expect(pull).toBe(Cl.TATTERED_PULL);
    const cap: Items.Item = { name: "Cotton Cap", slot: "body", stats: { cha: 0.1 }, rarity: "Common", price: 100 };
    expect(s.isUpgrade(cap)).toBe(true);
    s.equip(cap);
    expect(s.bag.some((i) => i.name === "Cotton Shirt")).toBe(false);
    expect(s.tattered()).toBe(false);
  });

  it("only wears on foot, not on a ride", () => {
    const s = at();
    s.gear.body = shirt();
    s.passTime(1, 1000, false);
    expect(s.gear.body.wear).toBe(1);
    s.gear.vehicle = { name: "Bike", slot: "vehicle", stats: { speed: 10 }, rarity: "Common", price: 100, vehicle: "bike" };
    s.passTime(1, 1000, false);
    expect(s.gear.body.wear).toBe(1);
  });

  it("a tailor mends his clothes as good as new", () => {
    const s = at();
    s.cents = 10_000;
    s.gear.body = shirt(Cl.WEAR_KM);
    s.do({ name: "Mend", min: 30, cost: 8, mend: true }, "Tailor", new Rng(1), "shop");
    expect(s.gear.body.wear).toBeUndefined();
    expect(s.history.entries.at(-1)!.text).toBe("🧵 His clothes are as good as new");
  });
});

describe("beliefs", () => {
  it("one takes root at its kind of place now and then, at most MAX_BELIEFS", () => {
    const b = new B.Beliefs();
    expect(b.did("place_of_worship", {}, "St Anne's", T0, fixed(B.BELIEF_CHANCE)).line).toBe("");
    expect(b.did("place_of_worship", {}, "St Anne's", T0, fixed(0)).line).toBe("🙏 At St Anne's he has found faith");
    b.did("park", {}, "Borisova", T0, fixed(0));
    expect(b.did("library", {}, "Library", T0, fixed(0)).line).toBe("");
    expect(Object.keys(b.held)).toEqual(["faith", "fresh_air"]);
    expect(b.ever).toEqual(["faith", "fresh_air"]);
  });

  it("pull to their places and weigh up what they favour", () => {
    const b = B.Beliefs.fromJSON({ held: { faith: T0, hard_work: T0 } });
    expect(b.pull("place_of_worship")).toBe(B.BELIEF_PULL);
    expect(b.pull("bar")).toBe(1);
    expect(b.lean({ earn: 10 })).toBe(B.BELIEF_LEAN);
    expect(b.lean({ cost: 5 })).toBe(1);
  });

  it("living by one keeps it; one not lived by for FADE_DAYS fades, and may come back", () => {
    const b = B.Beliefs.fromJSON({ held: { faith: T0, thrift: T0 }, ever: ["faith", "thrift"] });
    expect(b.did("cafe", {}, "Cafe", T0 + DAY, fixed(1)).lived.map((x) => x.id)).toEqual(["thrift"]); // a free action
    expect(b.day(T0 + B.FADE_DAYS * DAY)).toEqual(["🙏 His belief in faith has faded"]);
    expect(Object.keys(b.held)).toEqual(["thrift"]);
    b.did("place_of_worship", {}, "St Anne's", T0 + B.FADE_DAYS * DAY, fixed(0));
    expect(b.has("faith")).toBe(true);
    expect(b.ever).toEqual(["faith", "thrift"]);
  });

  it("through Stats: living by one cheers him, and it weighs actions", () => {
    const s = at();
    s.beliefs = B.Beliefs.fromJSON({ held: { hard_work: T0 } });
    const job: Action = { name: "Shift", min: 60, earn: 10 };
    const w = weight(job, s);
    s.beliefs.held = {};
    expect(weight(job, s)).toBeCloseTo(w / B.BELIEF_LEAN);
    s.beliefs.held = { hard_work: T0 };
    s.do(job, "Office", new Rng(1), "office");
    expect(feels(s)).toContain("An honest day's work");
  });
});

describe("data and saves", () => {
  it("coffee and mending are on real actions, and beliefs name place classes that exist", () => {
    const all = Object.values(actions()).flat();
    expect(all.filter((a) => a.coffee).length).toBeGreaterThanOrEqual(4);
    expect(all.some((a) => a.mend)).toBe(true);
    const classes = new Set(Object.keys(actions()).map((k) => k.split("/")[0]));
    for (const k of [...B.BELIEFS.flatMap((b) => [...b.seeds, ...b.kinds]), ...Cl.CLOTHES_KINDS, ...Co.COFFEE_KINDS]) expect(classes, k).toContain(k);
  });

  it("keep the habit, beliefs and wear; an old save has none", () => {
    const s = at();
    s.coffee.drink(T0);
    s.beliefs.held = { faith: T0 };
    s.gear.body = shirt(12);
    const back = Stats.fromJSON(JSON.parse(JSON.stringify(s)));
    expect(back.coffee.toJSON()).toEqual(s.coffee.toJSON());
    expect(back.beliefs.held).toEqual({ faith: T0 });
    expect(back.gear.body!.wear).toBe(12);
    const old = JSON.parse(JSON.stringify(s));
    delete old.coffee;
    delete old.beliefs;
    const o = Stats.fromJSON(old);
    expect([o.coffee.cups, Object.keys(o.beliefs.held).length]).toEqual([0, 0]);
  });
});
