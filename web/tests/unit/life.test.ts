import { beforeEach, describe, expect, it } from "vitest";
import { Activities, choose, NEED_AT, NEED_BOOST, needWeight, restMinutes, weight, type ActionTable } from "../../src/core/activities";
import type { Item } from "../../src/core/items";
import * as Items from "../../src/core/items";
import { Rng } from "../../src/core/rng";
import * as Speeds from "../../src/core/speeds";
import { BAG_SIZE, ENERGY_PER_KM, FIRST_VISIT_XP, FULLNESS_PER_H, FX_KEYS, HOSPITAL_FEE, KEEP_COINS, NEED_KEYS, Stats, THIRST_PER_H, WAKE_HEALTH, xpToNext, type Action } from "../../src/core/stats";
import { dataFile } from "../support/data";

const cafe = () => ({ name: "Old Cafe", class: "cafe", subclass: "cafe", rank: 1, lat: 42, lon: 23 });
const sword = (power: number, price = 40): Item => ({ name: "Bronze Sword", slot: "weapon", stats: { str: power }, rarity: "Common", price });
const vehicle = (kind: "bike" | "motorcycle" | "car", speed = 0, price = 100): Item => ({ name: `Plain ${kind}`, slot: "vehicle", vehicle: kind, stats: { speed }, rarity: "Common", price });
const roundTrip = (s: Stats) => Stats.fromJSON(JSON.parse(JSON.stringify(s)));

let stats: Stats;
let rng: Rng;
beforeEach(() => {
  stats = new Stats();
  rng = new Rng(1);
});

describe("stats", () => {
  it("starts healthy with some coins", () => {
    expect(stats.meters.health).toBe(100);
    expect(stats.coins).toBe(50);
    expect(stats.level).toBe(1);
  });

  it("time makes him hungry and thirsty", () => {
    const { fullness, thirst } = stats.meters;
    stats.passTime(60, 0);
    expect(stats.meters.fullness).toBeCloseTo(fullness - FULLNESS_PER_H);
    expect(stats.meters.thirst).toBeCloseTo(thirst - THIRST_PER_H);
  });

  it("walking tires him", () => {
    stats.passTime(0, 1000);
    expect(stats.meters.energy).toBeCloseTo(100 - ENERGY_PER_KM);
  });

  it("starving costs health", () => {
    stats.meters.fullness = 0;
    stats.passTime(60, 0);
    expect(stats.meters.health).toBeLessThan(100);
  });

  it("meters stay between 0 and 100", () => {
    stats.applyFx({ energy: 500, mood: -500 });
    expect(stats.meters.energy).toBe(100);
    expect(stats.meters.mood).toBe(0);
  });

  it("xp levels him up and raises his best attribute", () => {
    stats.attrs.cha = 3;
    stats.addXp(xpToNext(1) + 10);
    expect(stats.level).toBe(2);
    expect(stats.xp).toBe(10);
    expect(stats.attrs.cha).toBe(4);
    expect(stats.history.latest()).toContain("level 2");
  });

  it("actions he can't afford or lacks skill for are out", () => {
    stats.coins = 5;
    expect(stats.canDo({ name: "a", min: 1, cost: 5 }, 12)).toBe(true);
    expect(stats.canDo({ name: "b", min: 1, cost: 6 }, 12)).toBe(false);
    expect(stats.canDo({ name: "c", min: 1, needs: { cha: 3 } }, 12)).toBe(false);
    expect(stats.canDo({ name: "d", min: 1, needs: { level: 2 } }, 12)).toBe(false);
  });

  it("actions can need a time of day", () => {
    const dinner: Action = { name: "Dinner", min: 1, needs: { time: "evening" } };
    expect(stats.canDo(dinner, 12)).toBe(false);
    expect(stats.canDo(dinner, 19)).toBe(true);
    const party: Action = { name: "Party", min: 1, needs: { time: "night" } };
    expect(stats.canDo(party, 2)).toBe(true);
    expect(stats.canDo(party, 23)).toBe(true);
    expect(stats.canDo(party, 15)).toBe(false);
  });

  it("actions can need a low meter", () => {
    const nap: Action = { name: "Nap", min: 1, needs: { below: { energy: 40 } } };
    expect(stats.canDo(nap, 12)).toBe(false);
    stats.meters.energy = 30;
    expect(stats.canDo(nap, 12)).toBe(true);
  });

  it("doing an action pays and applies its effects", () => {
    stats.meters.energy = 50;
    const line = stats.do({ name: "Espresso at the bar", min: 3, cost: 3, fx: { energy: 20, xp: 5 } }, "Old Cafe", rng);
    expect(stats.coins).toBe(47);
    expect(stats.meters.energy).toBe(70);
    expect(stats.xp).toBe(5);
    expect(line).toBe("Espresso at the bar at Old Cafe (-3c)");
    expect(stats.history.latest()).toBe(line);
  });

  it("jobs earn coins in a range", () => {
    for (let s = 0; s < 20; s++) {
      const before = stats.coins;
      stats.do({ name: "Busk", min: 15, earn: [5, 30] }, "Park", new Rng(s));
      expect(stats.coins - before).toBeGreaterThanOrEqual(5);
      expect(stats.coins - before).toBeLessThanOrEqual(30);
    }
  });

  it("buffs wear off and can heal over time", () => {
    stats.meters.health = 50;
    stats.do({ name: "Vitamins", min: 1, buff: { name: "Healthy", min: 120, per_h: { health: 10 } } }, "", rng);
    expect(stats.buffNames()).toEqual(["Healthy"]);
    stats.passTime(60, 0);
    expect(stats.meters.health).toBeCloseTo(60);
    stats.passTime(61, 0);
    expect(stats.buffNames()).toEqual([]);
  });

  it("the same buff again refreshes it", () => {
    const a: Action = { name: "Coffee", min: 1, buff: { name: "Caffeinated", min: 60 } };
    stats.do(a, "", rng);
    stats.passTime(30, 0);
    stats.do(a, "", rng);
    expect(stats.buffNames()).toEqual(["Caffeinated"]);
    expect(stats.buffs[0]!.left).toBeCloseTo(60);
  });

  it("xp buffs multiply xp", () => {
    stats.do({ name: "Sunset", min: 1, buff: { name: "Inspired", min: 60, xp_mult: 2 } }, "", rng);
    stats.do({ name: "Look", min: 1, fx: { xp: 10 } }, "", rng);
    expect(stats.xp).toBe(20);
  });

  it("risky actions can go wrong", () => {
    const line = stats.do({ name: "Dine and dash", min: 1, fx: { fullness: 10 }, risk: { p: 1, text: "caught", fx: { mood: -20 }, cost: 20 } }, "Bistro", rng);
    expect(stats.coins).toBe(30);
    expect(line).toContain("caught");
  });

  it("first visit to a place gives bonus xp once", () => {
    expect(stats.visit(cafe())).toBe(FIRST_VISIT_XP);
    expect(stats.visit(cafe())).toBe(0);
    expect(stats.visit({ ...cafe(), name: "Cathedral", lat: 42.1 })).toBe(FIRST_VISIT_XP);
  });

  it("faints at zero health and wakes in hospital", () => {
    expect(stats.fainted()).toBe(false);
    stats.meters.health = 0;
    expect(stats.fainted()).toBe(true);
    const line = stats.wakeInHospital("City Hospital");
    expect(stats.meters.health).toBe(WAKE_HEALTH);
    expect(stats.coins).toBe(50 - HOSPITAL_FEE);
    expect(line).toContain("City Hospital");
  });

  it("the hospital fee never goes below zero", () => {
    stats.coins = 5;
    stats.meters.health = 0;
    stats.wakeInHospital("");
    expect(stats.coins).toBe(0);
  });

  it("survives save and load", () => {
    stats.coins = 77;
    stats.savingFor = 80;
    stats.addXp(30);
    stats.do({ name: "Coffee", min: 1, buff: { name: "Caffeinated", min: 60 } }, "Cafe", rng);
    stats.visit(cafe());
    const back = roundTrip(stats);
    expect(back.coins).toBe(77);
    expect(back.savingFor).toBe(80);
    expect(back.xp).toBe(stats.xp);
    expect(back.buffNames()).toEqual(["Caffeinated"]);
    expect(back.history.entries).toEqual(stats.history.entries);
    expect(back.visit(cafe())).toBe(0);
  });

  it("what he says goes in the history where he is", () => {
    stats.history.moveTo(42, 23);
    stats.say("Waved");
    expect(stats.history.entries.at(-1)).toMatchObject({ text: "Waved", at: [42, 23] });
    expect(stats.history.entries.at(-1)!.t).toBeGreaterThan(0);
  });
});

describe("gear", () => {
  it("adds to his attributes", () => {
    stats.equip(sword(2));
    expect(stats.attr("str")).toBe(stats.attrs.str + 2);
    expect(stats.canDo({ name: "Arm wrestle", min: 1, needs: { str: 3 } }, 12)).toBe(true);
  });

  it("buys an item that beats his gear and bags the old one", () => {
    stats.coins = 200;
    stats.equip(sword(1));
    const line = stats.buy(sword(3, 50), "Arms & Co");
    expect(stats.coins).toBe(150);
    expect(stats.gear.weapon!.stats.str).toBe(3);
    expect(stats.bag).toHaveLength(1);
    expect(line).toContain("Bought");
    expect(line).toContain("Arms & Co");
  });

  it("won't buy worse gear or go skint for it", () => {
    stats.equip(sword(3));
    stats.coins = 200;
    expect(stats.buy(sword(1, 10), "Shop")).toContain("didn't buy");
    expect(stats.coins).toBe(200);
    stats.unequip("weapon");
    stats.coins = 30;
    expect(stats.buy(sword(1, 20), "Shop")).toContain("didn't buy");
    expect(stats.coins).toBe(30);
  });

  it("a full bag sells the cheapest item", () => {
    stats.coins = 10000;
    stats.gear.weapon = sword(0.4, 50);
    for (let i = 0; i < BAG_SIZE; i++) stats.bag.push(sword(0.5, 10 + i));
    stats.buy(sword(5, 100), "Shop");
    expect(stats.bag).toHaveLength(BAG_SIZE);
    expect(stats.bag.some((it) => it.price === 10)).toBe(false);
  });

  it("sells loot for part of its price", () => {
    stats.bag.push(sword(1, 100));
    const before = stats.coins;
    const line = stats.sellLoot("Pawn shop");
    expect(stats.bag).toHaveLength(0);
    expect(stats.coins - before).toBeGreaterThanOrEqual(40);
    expect(stats.coins - before).toBeLessThanOrEqual(60);
    expect(line).toContain("Sold");
  });

  it("shop actions offer an item", () => {
    stats.coins = 500;
    const line = stats.do({ name: "Browse the weapons", min: 15, item: "weapons" }, "Arms & Co", rng);
    expect(Object.keys(stats.gear).length).toBeGreaterThan(0);
    expect(line).toContain("Arms & Co");
  });

  it("gear and bag survive save and load", () => {
    stats.equip(sword(2));
    stats.bag.push(sword(1));
    const back = roundTrip(stats);
    expect(back.gear.weapon!.name).toBe("Bronze Sword");
    expect(back.attr("str")).toBe(stats.attr("str"));
    expect(back.bag).toHaveLength(1);
  });

  it("no shopping when skint, no selling an empty bag", () => {
    stats.coins = KEEP_COINS;
    expect(stats.canDo({ name: "Browse", min: 15, item: "weapons" }, 12)).toBe(false);
    stats.coins = 100;
    expect(stats.canDo({ name: "Browse", min: 15, item: "weapons" }, 12)).toBe(true);
    expect(stats.canDo({ name: "Sell", min: 10, sell: true }, 12)).toBe(false);
    stats.bag.push(sword(1));
    expect(stats.canDo({ name: "Sell", min: 10, sell: true }, 12)).toBe(true);
  });

  it("a car beats any bike", () => {
    const bike = Items.build(Items.KINDS.bicycles[0]!, Items.MATERIALS.at(-1)!, [Items.PREFIXES[0]!, Items.SUFFIXES[0]!]);
    const car = Items.build(Items.KINDS.cars[0]!, Items.MATERIALS[0]!, []);
    stats.equip(bike);
    expect(stats.isUpgrade(car)).toBe(true);
    stats.equip(car);
    expect(stats.isUpgrade(bike)).toBe(false);
  });
});

describe("speed", () => {
  it("speeds are realistic city averages", () => {
    expect(Speeds.WALK * 3.6).toBeCloseTo(5);
    expect(Speeds.BIKE * 3.6).toBeCloseTo(15);
    expect(Speeds.MOTORCYCLE * 3.6).toBeCloseTo(30);
    expect(Speeds.CAR * 3.6).toBeCloseTo(35);
  });

  it("he walks at 5 km/h to start", () => {
    expect(stats.speedMps()).toBeCloseTo(Speeds.WALK);
    expect(stats.vehicle()).toBe("");
  });

  it("each level adds one percent", () => {
    stats.level = 11;
    expect(stats.speedMps()).toBeCloseTo(Speeds.WALK * 1.1);
  });

  it("his vehicle sets the base speed", () => {
    for (const kind of ["bike", "motorcycle", "car"] as const) {
      stats.equip(vehicle(kind));
      expect(stats.vehicle()).toBe(kind);
      expect(stats.speedMps()).toBeCloseTo(Speeds.FOR_VEHICLE[kind]);
    }
  });

  it("speed gear adds percent on top", () => {
    stats.equip(vehicle("bike", 10));
    stats.equip({ name: "Swift Trainers", slot: "feet", stats: { speed: 5 }, rarity: "Uncommon", price: 20 });
    stats.level = 6;
    expect(stats.speedMps()).toBeCloseTo(Speeds.BIKE * 1.2);
  });

  it("low energy slows him to half at zero", () => {
    stats.meters.energy = 30;
    expect(stats.speedMps()).toBeCloseTo(Speeds.WALK);
    stats.meters.energy = 15;
    expect(stats.speedMps()).toBeCloseTo(Speeds.WALK * 0.75);
    stats.meters.energy = 0;
    expect(stats.speedMps()).toBeCloseTo(Speeds.WALK * 0.5);
  });

  it("riding tires him less than walking", () => {
    const walker = new Stats();
    walker.passTime(0, 1000);
    stats.equip(vehicle("car"));
    stats.passTime(0, 1000);
    expect(stats.meters.energy).toBeGreaterThan(walker.meters.energy);
  });

  it("his vehicle survives save and load", () => {
    stats.equip(vehicle("motorcycle", 5));
    const back = roundTrip(stats);
    expect(back.vehicle()).toBe("motorcycle");
    expect(back.speedMps()).toBeCloseTo(stats.speedMps());
  });
});

describe("need-driven goals", () => {
  const eat: Action = { name: "Eat", min: 1, cost: 5, fx: { fullness: 40 } };
  const work: Action = { name: "Wash dishes", min: 1, earn: 10 };
  it("weigh 1 when nothing he needs is there", () => {
    expect(needWeight([eat], stats)).toBe(1);
    expect(needWeight([], stats)).toBe(1);
  });
  it("weigh more the lower the meter the place refills", () => {
    stats.meters.fullness = NEED_AT / 2;
    expect(needWeight([eat], stats)).toBeCloseTo(1 + NEED_BOOST / 2, 6);
    stats.meters.fullness = 0;
    expect(needWeight([eat], stats)).toBeCloseTo(1 + NEED_BOOST, 6);
    expect(needWeight([work], stats)).toBe(1);
  });
  it("send him to paid work when he is broke or saving up", () => {
    stats.coins = 0;
    expect(needWeight([work], stats)).toBeCloseTo(1 + NEED_BOOST, 6);
    stats.coins = 500;
    stats.savingFor = 1000;
    expect(needWeight([work], stats)).toBeCloseTo(1 + NEED_BOOST, 6);
  });
  it("peek at a place's actions without counting it as unknown", () => {
    const acts = new Activities({ _generic: [{ name: "Look", min: 1 }] });
    expect(acts.peek({ class: "odd", subclass: "x" })).toHaveLength(1);
    expect(acts.unknown).toEqual({});
  });
});

describe("activities", () => {
  const bundled = () => new Activities(JSON.parse(dataFile("actions.json")), JSON.parse(dataFile("flavour.json")));

  it("the list comes from subclass, then class, then generic", () => {
    const acts = new Activities({ "shop/bakery": [{ name: "Loaf", min: 1 }], shop: [{ name: "Browse", min: 1 }], _generic: [{ name: "Look", min: 1 }], _spot: [{ name: "Sit", min: 1 }] });
    expect(acts.forPlace({ class: "shop", subclass: "bakery" })[0]!.name).toBe("Loaf");
    expect(acts.forPlace({ class: "shop", subclass: "toys" })[0]!.name).toBe("Browse");
    expect(acts.forPlace({ class: "dragon_lair", subclass: "x" })[0]!.name).toBe("Look");
    expect(acts.forPlace(null)[0]!.name).toBe("Sit");
  });

  it("counts unknown tags", () => {
    const acts = new Activities({ _generic: [{ name: "Look", min: 1 }] });
    acts.forPlace({ name: "Lair", class: "dragon_lair", subclass: "cave" });
    acts.forPlace({ name: "Lair 2", class: "dragon_lair", subclass: "cave" });
    expect(acts.unknown["dragon_lair/cave"]).toEqual({ count: 2, example: "Lair" });
  });

  it("a country's own actions join the usual ones", () => {
    const acts = new Activities({ cafe: [{ name: "Coffee", min: 1 }] }, { BGR: { cafe: [{ name: "Boza", min: 1 }] } });
    expect(acts.forPlace({ class: "cafe", subclass: "cafe" }, "BGR").map((a) => a.name)).toEqual(["Coffee", "Boza"]);
    expect(acts.forPlace({ class: "cafe", subclass: "cafe" }, "BGR")[1]!.flavour).toBe(true);
  });

  it("needs steer the choice", () => {
    const eat: Action = { name: "Eat", min: 10, fx: { fullness: 40 } };
    const look: Action = { name: "Look", min: 10, fx: { mood: 5 } };
    stats.meters.fullness = 10;
    expect(weight(eat, stats)).toBeGreaterThan(weight(look, stats));
    stats.coins = 0;
    expect(weight({ name: "Wash dishes", min: 60, earn: 20 }, stats)).toBeGreaterThan(weight(look, stats));
  });

  it("saving for a trip favours paid work and cuts spending", () => {
    stats.coins = 100;
    const job: Action = { name: "Wash dishes", min: 60, earn: 20 };
    const dinner: Action = { name: "Dinner", min: 10, cost: 30 };
    const jobW = weight(job, stats);
    const dinnerW = weight(dinner, stats);
    stats.savingFor = 150;
    expect(weight(job, stats)).toBeGreaterThan(jobW + 3);
    expect(weight(dinner, stats)).toBeLessThan(dinnerW);
    stats.coins = 150;
    expect(weight(job, stats)).toBeCloseTo(jobW);
  });

  it("choose skips what he can't do", () => {
    stats.coins = 0;
    const pricey: Action = { name: "Dinner", min: 10, cost: 30 };
    const free: Action = { name: "Bench", min: 10 };
    expect(choose([pricey, free], stats, 12, 0)!.name).toBe("Bench");
    expect(choose([pricey], stats, 12, 0.5)).toBeNull();
  });

  it("every action takes a minute", () => {
    expect(restMinutes({ name: "a", min: 3 })).toBe(1);
    expect(restMinutes({ name: "a", min: 480 })).toBe(1);
  });

  it("bundled actions are all valid", () => {
    const acts = bundled();
    expect(Object.keys(acts.data).length).toBeGreaterThan(10);
    for (const [key, list] of Object.entries(acts.data)) {
      for (const a of list) {
        expect(a.name && a.min, `${key}: ${JSON.stringify(a)}`).toBeTruthy();
        for (const k of Object.keys(a.fx ?? {})) expect(FX_KEYS, `${key}: ${a.name}`).toContain(k);
        for (const k of Object.keys(a.needs ?? {})) expect(NEED_KEYS, `${key}: ${a.name}`).toContain(k);
        if (a.item) expect(Object.keys(Items.KINDS), `${key}: ${a.item}`).toContain(a.item);
      }
    }
    expect(acts.data._generic && acts.data._spot).toBeTruthy();
  });

  it("vehicle shops have browse actions", () => {
    const data = bundled().data;
    for (const [key, kind] of [["bicycle", "bicycles"], ["shop/motorcycle", "motorcycles"], ["car/car", "cars"]] as const)
      expect((data[key] ?? []).some((a) => a.item === kind), key).toBe(true);
  });

  it("common real tags have their own actions", () => {
    const acts = bundled();
    for (const tag of ["hairdresser/hairdresser", "bakery/bakery", "butcher/butcher", "school/school", "school/kindergarten", "atm/atm", "office/company", "office/employment_agency", "bicycle_rental/bicycle_rental", "bicycle/bicycle", "parking/parking", "fuel/fuel", "car/car_repair", "veterinary/veterinary", "yoga/yoga", "escape_game/escape_game", "ferry_terminal/ferry_terminal", "shop/florist", "shop/massage", "shop/tattoo", "shop/optician", "shop/pet", "shop/confectionery"]) {
      const [cls, sub] = tag.split("/");
      acts.unknown = {};
      acts.forPlace({ name: "X", class: cls!, subclass: sub! });
      expect(acts.unknown, tag).toEqual({});
    }
  });

  it("flavour tables use known keys and effects", () => {
    const f = JSON.parse(dataFile("flavour.json")) as Record<string, ActionTable>;
    for (const [code, table] of Object.entries(f))
      for (const list of Object.values(table)) for (const a of list) for (const k of Object.keys(a.fx ?? {})) expect(FX_KEYS, `${code}: ${a.name}`).toContain(k);
  });
});
