import { beforeEach, describe, expect, it } from "vitest";
import * as A from "../../src/core/activities";
import { URGENT_SLIP } from "../../src/core/goals";
import { Activities, choose, GOAL_SHOP_PULL, GOAL_SHOP_WEIGHT, NEED_AT, NEED_BOOST, needOf, restMinutes, URGENT_AT, weight, type ActionTable } from "../../src/core/activities";
import type { Item } from "../../src/core/items";
import * as Items from "../../src/core/items";
import * as Jokes from "../../src/core/jokes";
import { Rng } from "../../src/core/rng";
import * as Speeds from "../../src/core/speeds";
import { BAG_SIZE, ENERGY_PER_KM, FIRST_VISIT_XP, FULLNESS_PER_H, FX_KEYS, HOSPITAL_FEE, KEEP_CENTS, NEED_KEYS, Stats, THIRST_PER_H, WAKE_HEALTH, xpToNext, type Action } from "../../src/core/stats";
import * as S from "../../src/core/stats";
import { dayOf } from "../../src/core/gifts";
import { euro } from "../../src/core/money";
import { dataFile } from "../support/data";

const cafe = () => ({ name: "Old Cafe", class: "cafe", subclass: "cafe", rank: 1, lat: 42, lon: 23 });
const sword = (power: number, price = 40): Item => ({ name: "Bronze Sword", slot: "weapon", stats: { str: power }, rarity: "Common", price });
const vehicle = (kind: Exclude<Speeds.Vehicle, "">, speed = 0, price = 100): Item => ({ name: `Plain ${kind}`, slot: "vehicle", vehicle: kind, stats: { speed }, rarity: "Common", price });
const roundTrip = (s: Stats) => Stats.fromJSON(JSON.parse(JSON.stringify(s)));

let stats: Stats;
let rng: Rng;
beforeEach(() => {
  stats = new Stats();
  rng = new Rng(1);
});

describe("stats", () => {
  it("starts healthy with €200", () => {
    expect(stats.meters.health).toBe(100);
    expect(stats.cents).toBe(S.START_CENTS);
    expect(S.START_CENTS).toBe(20000);
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
    stats.cents = 500;
    expect(stats.canDo({ name: "a", min: 1, cost: 5 }, 12)).toBe(true);
    expect(stats.canDo({ name: "b", min: 1, cost: 5.01 }, 12)).toBe(false);
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
    stats.meters.mood = 50; // x1 XP
    stats.meters.energy = 50;
    const line = stats.do({ name: "Espresso at the bar", min: 3, cost: 1.8, fx: { energy: 20, xp: 5 } }, "Old Cafe", rng);
    expect(stats.cents).toBe(S.START_CENTS - 180);
    expect(stats.meters.energy).toBe(70);
    expect(stats.xp).toBe(5);
    expect(line).toBe("Espresso at the bar at Old Cafe (-€1.80)");
    expect(stats.history.latest()).toBe(line);
  });

  it("jobs earn euros in a range, to the cent", () => {
    let card = false;
    stats.onSay = (l) => (card ||= l.includes(" At work: "));
    for (let s = 0; s < 20; s++) {
      const before = stats.cents;
      card = false;
      stats.do({ name: "Busk", min: 15, earn: [5, 30] }, "Park", new Rng(s));
      // A chance card at work (workCards.ts) may change the pay; those don't count here.
      if (card) continue;
      expect(stats.cents - before).toBeGreaterThanOrEqual(500);
      expect(stats.cents - before).toBeLessThanOrEqual(3000);
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
    stats.meters.mood = 50; // x1 XP
    stats.do({ name: "Sunset", min: 1, buff: { name: "Inspired", min: 60, xp_mult: 2 } }, "", rng);
    stats.do({ name: "Look", min: 1, fx: { xp: 10 } }, "", rng);
    expect(stats.xp).toBe(20);
  });

  it("pay grows 10% a career rank and 2% per point of the attribute a job needs, not with his level", () => {
    const job: Action = { name: "Tend the bar", min: 60, earn: 100, needs: { cha: 3 }, career: "bar" };
    stats.attrs.cha = 3;
    expect(stats.wageMult(job)).toBeCloseTo((1 + 0.02 * 3), 9);
    stats.level = 11;
    expect(stats.wageMult(job)).toBeCloseTo((1 + 0.02 * 3), 9);
    stats.careers.shifts.bar = 12; // rank 3
    expect(stats.wageMult(job)).toBeCloseTo((1 + 0.1 * 2 + 0.02 * 3), 9);
    stats.gear.trinket = { name: "Ring", slot: "trinket", stats: { cha: 2 }, rarity: "Common", price: 1 };
    expect(stats.wageMult(job)).toBeCloseTo((1 + 0.1 * 2 + 0.02 * 5), 9);
    // A job of another career, or of none, doesn't get his bar rank.
    expect(stats.wageMult({ name: "Shelve books", min: 60, earn: 15, career: "office" })).toBeCloseTo(1, 9);
    expect(stats.wageMult({ name: "Shelve books", min: 60, earn: 15 })).toBeCloseTo(1, 9);
    const before = stats.cents;
    // His money as the job's line is said, before any chance card at work (workCards.ts).
    let paid: number | null = null;
    stats.onSay = () => (paid ??= stats.cents);
    const line = stats.do(job, "Bar", rng);
    expect(paid! - before).toBe(Math.round(10000 * stats.wageMult(job)));
    expect(line).toContain(euro(Math.round(10000 * stats.wageMult(job))));
  });

  it("only pay grows, not prices", () => {
    stats.level = 20;
    stats.do({ name: "Dinner", min: 10, cost: 30 }, "", rng);
    expect(stats.cents).toBe(S.START_CENTS - 3000);
  });

  it("risky actions can go wrong", () => {
    const line = stats.do({ name: "Dine and dash", min: 1, fx: { fullness: 10 }, risk: { p: 1, text: "caught", fx: { mood: -20 }, cost: 20 } }, "Bistro", rng);
    expect(stats.cents).toBe(S.START_CENTS - 2000);
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
    expect(stats.cents).toBe(S.START_CENTS - HOSPITAL_FEE);
    expect(HOSPITAL_FEE).toBe(6000);
    expect(line).toContain("City Hospital");
    expect(line).toContain("(-€60)");
  });

  it("the hospital takes at most half his money", () => {
    stats.cents = 5001;
    stats.meters.health = 0;
    const line = stats.wakeInHospital("");
    expect(stats.cents).toBe(2501);
    expect(line).toContain("(-€25)");
    stats.cents = 1;
    stats.wakeInHospital("");
    expect(stats.cents).toBe(1);
  });

  it("survives save and load", () => {
    stats.cents = 77;
    stats.savingFor = 80;
    stats.addXp(30);
    stats.do({ name: "Coffee", min: 1, buff: { name: "Caffeinated", min: 60 } }, "Cafe", rng);
    stats.visit(cafe());
    const back = roundTrip(stats);
    expect(back.cents).toBe(77);
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
    stats.cents = 20000;
    stats.equip(sword(1));
    const line = stats.buy(sword(3, 5000), "Arms & Co");
    expect(stats.cents).toBe(15000);
    expect(line).toContain("(-€50)");
    expect(stats.gear.weapon!.stats.str).toBe(3);
    expect(stats.bag).toHaveLength(1);
    expect(line).toContain("Bought");
    expect(line).toContain("Arms & Co");
  });

  it("won't buy worse gear or go skint for it", () => {
    stats.equip(sword(3));
    stats.cents = 20000;
    expect(stats.buy(sword(1, 1000), "Shop")).toContain("didn't buy");
    expect(stats.cents).toBe(20000);
    stats.unequip("weapon");
    stats.cents = 3000;
    expect(stats.buy(sword(1, 2000), "Shop")).toContain("didn't buy");
    expect(stats.cents).toBe(3000);
  });

  it("a full bag sells the cheapest item", () => {
    stats.cents = 1_000_000;
    stats.gear.weapon = sword(0.4, 50);
    for (let i = 0; i < BAG_SIZE; i++) stats.bag.push(sword(0.5, 10 + i));
    stats.buy(sword(5, 100), "Shop");
    expect(stats.bag).toHaveLength(BAG_SIZE);
    expect(stats.bag.some((it) => it.price === 10)).toBe(false);
  });

  it("sells loot for part of its price", () => {
    stats.bag.push(sword(1, 10000));
    const before = stats.cents;
    const line = stats.sellLoot("Pawn shop");
    expect(stats.bag).toHaveLength(0);
    expect(stats.cents - before).toBeGreaterThanOrEqual(4000);
    expect(stats.cents - before).toBeLessThanOrEqual(6000);
    expect(line).toContain("Sold");
  });

  it("a full bag at a resale shop is a selling run, a line per sale", () => {
    for (let i = 0; i < BAG_SIZE; i++) stats.bag.push(sword(0.5, 1000 + i));
    const lines: string[] = [];
    stats.onSay = (l) => lines.push(l);
    stats.do({ name: "Sell his loot", min: 10, sell: true, resale: true }, "Pawn Stars", rng);
    expect(stats.bag).toHaveLength(S.SELL_RUN_LEFT);
    expect(lines.filter((l) => l.startsWith("Sold his"))).toHaveLength(BAG_SIZE - S.SELL_RUN_LEFT);
    // The cheapest went first.
    expect(Math.min(...stats.bag.map((it) => it.price))).toBe(1000 + BAG_SIZE - S.SELL_RUN_LEFT);
  });

  it("a shop that isn't a resale shop, or a bag that isn't full, sells one thing", () => {
    for (let i = 0; i < BAG_SIZE; i++) stats.bag.push(sword(0.5, 1000 + i));
    stats.do({ name: "Sell his loot", min: 10, sell: true }, "Arms & Co", rng);
    expect(stats.bag).toHaveLength(BAG_SIZE - 1);
    stats.do({ name: "Sell his loot", min: 10, sell: true, resale: true }, "Pawn Stars", rng);
    expect(stats.bag).toHaveLength(BAG_SIZE - 2);
  });

  it("resale shops pull him like a need while his bag is full", () => {
    const resale = { name: "Sell his loot", min: 10, sell: true, resale: true };
    expect(needOf([resale], stats, 12).pull).toBe(1);
    for (let i = 0; i < BAG_SIZE; i++) stats.bag.push(sword(0.5));
    expect(needOf([resale], stats, 12)).toMatchObject({ pull: 1 + NEED_BOOST, why: "bag" });
    expect(needOf([{ name: "Sell", min: 10, sell: true }], stats, 12).pull).toBe(1);
  });

  it("jokes are keyed by place classes the actions know", () => {
    const jokes = JSON.parse(dataFile("jokes.json")) as Record<string, string[]>;
    const classes = new Set(Object.keys(JSON.parse(dataFile("actions.json"))).map((k) => k.split("/")[0]));
    for (const [k, lines] of Object.entries(jokes)) {
      expect(k === "_generic" || classes.has(k), k).toBe(true);
      expect(lines.length).toBeGreaterThan(0);
    }
  });

  it("now and then a line gets a deadpan joke for that kind of place", () => {
    stats.jokes = JSON.parse(dataFile("jokes.json"));
    const lines = Array.from({ length: 400 }, (_, i) => stats.do({ name: "Looked around", min: 5 }, "Big Museum", new Rng(i), "museum"));
    const joked = lines.filter((l) => l !== "Looked around at Big Museum");
    expect(joked.length / lines.length).toBeGreaterThan(0.08);
    expect(joked.length / lines.length).toBeLessThan(0.18);
    for (const l of joked) expect(Jokes.jokesFor(stats.jokes, "museum").some((j) => l.endsWith(` ${j}`))).toBe(true);
    expect(Jokes.jokesFor(stats.jokes, "nowhere")).toBe(stats.jokes._generic);
    expect(Jokes.jokesFor({}, "museum")).toEqual([]);
    // With no jokes loaded the dice aren't touched.
    const plain = new Stats();
    const r = new Rng(9);
    plain.do({ name: "Looked around", min: 5 }, "Big Museum", r, "museum");
    expect(r.randf()).toBe(new Rng(9).randf());
  });

  it("shop actions offer an item", () => {
    stats.cents = 100_000;
    const line = stats.do({ name: "Browse the weapons", min: 15, item: "weapons" }, "Arms & Co", rng);
    expect(Object.keys(stats.gear).length).toBeGreaterThan(0);
    expect(line).toContain("Arms & Co");
  });

  it("a vehicle dealer shows several and he buys the best he can afford", () => {
    stats.level = 30;
    stats.cents = Items.cheapest("cars").price + KEEP_CENTS;
    let bought = 0;
    for (let seed = 0; seed < 50; seed++) {
      const s = new Stats();
      s.level = 30;
      s.cents = stats.cents;
      s.do({ name: "Browse the cars", min: 15, item: "cars" }, "Lot", new Rng(seed));
      if (s.vehicle() === "car") bought++;
      expect(s.cents).toBeGreaterThanOrEqual(KEEP_CENTS);
    }
    // Few single rolls at level 30 are a car he can afford; DEALER_OFFERS rolls make one far likelier.
    expect(bought).toBeGreaterThan(5);
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
    stats.cents = KEEP_CENTS;
    expect(stats.canDo({ name: "Browse", min: 15, item: "weapons" }, 12)).toBe(false);
    stats.cents = KEEP_CENTS + 1;
    expect(stats.canDo({ name: "Browse", min: 15, item: "weapons" }, 12)).toBe(true);
    expect(stats.canDo({ name: "Sell", min: 10, sell: true }, 12)).toBe(false);
    stats.bag.push(sword(1));
    expect(stats.canDo({ name: "Sell", min: 10, sell: true }, 12)).toBe(true);
  });

  it("saves up for the cheapest vehicle a step above what he rides", () => {
    expect(stats.vehicleGoal()).toEqual({ name: "Bike", kind: "bicycles", cents: Items.cheapest("bicycles").price });
    stats.gear.vehicle = vehicle("bike");
    expect(stats.vehicleGoal()).toMatchObject({ name: "Scooter", kind: "motorcycles" });
    stats.gear.vehicle = vehicle("motorcycle");
    expect(stats.vehicleGoal()).toMatchObject({ name: "Hatchback", kind: "cars", cents: 750000 });
    stats.gear.vehicle = vehicle("car");
    expect(stats.vehicleGoal()).toMatchObject({ name: "Dragon", kind: "dragons", cents: 4000000 });
    stats.gear.vehicle = vehicle("dragon");
    expect(stats.vehicleGoal()).toBeNull();
  });

  it("saving counts the vehicle plus his reserve, or a trip fare, whichever is more", () => {
    stats.gear.vehicle = vehicle("bike");
    const goal = stats.vehicleGoal()!.cents + KEEP_CENTS;
    expect(stats.savingTarget()).toBe(goal);
    stats.cents = goal - 1;
    expect(stats.saving()).toBe(true);
    stats.cents = goal;
    expect(stats.saving()).toBe(false);
    stats.savingFor = goal + 5;
    expect(stats.saving()).toBe(true);
    stats.gear.vehicle = vehicle("dragon");
    stats.savingFor = 0;
    stats.cents = S.DRAGON_UPKEEP + KEEP_CENTS - 1;
    expect(stats.saving()).toBe(true);
    stats.feedDragon(rng);
    stats.cents = 0;
    stats.savingFor = 0;
    expect(stats.savingTarget()).toBe(0);
    stats.gear.vehicle = vehicle("car");
    expect(stats.savingTarget()).toBe(stats.vehicleGoal()!.cents + KEEP_CENTS + S.DRAGON_UPKEEP);
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

  it("a dragon eats its gold once a day, and sulks on foot when he can't pay", () => {
    let t = Date.UTC(2026, 9, 30, 9) / 1000;
    stats.now = () => t;
    stats.equip(vehicle("dragon"));
    stats.cents = S.DRAGON_UPKEEP;
    expect(stats.getsAbout()).toBe("");
    expect(stats.speedMps()).toBeCloseTo(Speeds.WALK);
    const never = { randf: () => 0.99, randiRange: (a: number) => a } as unknown as Rng;
    expect(stats.feedDragon(never)).toMatch(/^Fed his dragon/);
    expect(stats.cents).toBe(0);
    expect(stats.getsAbout()).toBe("dragon");
    expect(stats.speedMps()).toBeCloseTo(Speeds.DRAGON);
    expect(stats.feedDragon(never)).toBe("");
    t += 24 * 3600;
    expect(stats.feedDragon(never)).toMatch(/sulks/);
    expect(stats.feedDragon(never)).toBe("");
    expect(stats.getsAbout()).toBe("");
    stats.gear.vehicle!.stats.speed = 50;
    expect(stats.speedMps()).toBeCloseTo(Speeds.WALK);
    stats.cents = S.DRAGON_UPKEEP;
    stats.feedDragon(never);
    expect(stats.getsAbout()).toBe("dragon");
    expect(roundTrip(stats).dragonFed).toBe(stats.dragonFed);
  });

  it("a fed dragon now and then brings back treasure", () => {
    stats.equip(vehicle("dragon"));
    stats.cents = S.DRAGON_UPKEEP;
    const lucky = { randf: () => 0, randiRange: (a: number) => a } as unknown as Rng;
    expect(stats.feedDragon(lucky)).toMatch(/treasure/);
    expect(stats.cents).toBe(S.DRAGON_TREASURE_MIN);
  });

  it("after a flyer lands he walks: walking speed and effort", () => {
    stats.equip(vehicle("broom", 50));
    expect(stats.speedMps(true)).toBeCloseTo(Speeds.WALK);
    const walker = new Stats();
    walker.passTime(0, 1000);
    stats.passTime(0, 1000, true);
    expect(stats.meters.energy).toBeCloseTo(walker.meters.energy);
  });

  it("a giant tortoise never tires him", () => {
    stats.equip(vehicle("tortoise"));
    stats.passTime(0, 5000);
    expect(stats.meters.energy).toBe(100);
  });

  it("a shop only now and then has a fantasy mount in", () => {
    stats.cents = 100_000_00;
    const ask: Action = { name: "Ask after a broomstick", min: 10, item: "brooms" };
    expect(stats.do(ask, "Hardware", { randf: () => Items.MOUNT_STOCK } as unknown as Rng)).toBe("Asked after a Broomstick at Hardware, but there were none in today");
    expect(stats.do(ask, "Hardware", new Rng(3))).toMatch(/Broomstick/);
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

describe("mood, hygiene and luck", () => {
  const study: Action = { name: "Study", min: 1, fx: { xp: 40 } };
  it("mood falls slowly and scales the XP actions give", () => {
    stats.passTime(60, 0);
    expect(stats.meters.mood).toBeCloseTo(70 - S.MOOD_PER_H, 6);
    stats.meters.mood = 100;
    stats.do(study, "", rng);
    expect(stats.xp).toBe(Math.round(40 * S.MOOD_XP_MAX));
    stats.xp = 0;
    stats.meters.mood = 0;
    stats.do(study, "", rng);
    expect(stats.xp).toBe(Math.round(40 * S.MOOD_XP_MIN));
    expect(S.moodXpMult(50)).toBeCloseTo(1, 6);
  });
  it("being dirty lowers charm and drains mood", () => {
    stats.attrs.cha = 4;
    stats.meters.hygiene = S.DIRTY_AT;
    expect(stats.attr("cha")).toBe(4);
    stats.meters.hygiene = 0;
    expect(stats.attr("cha")).toBeCloseTo(4 * (1 - S.DIRTY_CHARM_CUT), 6);
    stats.meters.mood = 50;
    stats.passTime(60, 0);
    expect(stats.meters.mood).toBeCloseTo(50 - S.MOOD_PER_H - S.DIRTY_MOOD_PER_H, 6);
  });
  it("luck makes mishaps rarer, up to a cap", () => {
    expect(S.riskMult(0)).toBe(1);
    expect(S.riskMult(2)).toBeCloseTo(1 - 2 * S.LUCK_RISK_CUT, 6);
    expect(S.riskMult(1000)).toBeCloseTo(1 - S.LUCK_RISK_CAP, 6);
    const risky: Action = { name: "Juggle", min: 1, risk: { p: 0.5, text: "dropped it" } };
    const fails = (luck: number) => {
      stats.attrs.luck = luck;
      let n = 0;
      for (let i = 0; i < 400; i++) n += +stats.do(risky, "", new Rng(i)).includes("dropped");
      return n;
    };
    expect(fails(20)).toBeLessThan(fails(0) * 0.75);
  });
  it("luck makes shop items rarer", () => {
    const rare = (luck: number) => {
      let n = 0;
      for (let i = 0; i < 400; i++) n += +(Items.make("weapons", 1, new Rng(i), luck).rarity !== "Common");
      return n;
    };
    expect(rare(10)).toBeGreaterThan(rare(0) + 20);
    expect(S.rarityBoost(1000)).toBe(S.LUCK_RARITY_CAP);
  });
  it("luck finds money now and then while he walks", () => {
    stats.attrs.luck = 10;
    const start = stats.cents;
    let found = 0;
    for (let i = 0; i < 600; i++) found += +!!stats.walkFor(1, new Rng(i));
    expect(found).toBeGreaterThan(0);
    expect(found).toBeLessThan(600 * S.FIND_CAP * 2);
    expect(stats.cents).toBeGreaterThan(start);
    expect(stats.history.entries.some((e) => e.text.startsWith("Found"))).toBe(true);
  });
  it("only rolls for money once per minute walked", () => {
    stats.walkFor(0.5, rng);
    expect(stats.walkMin).toBeCloseTo(0.5, 6);
    stats.walkFor(0.75, rng);
    expect(stats.walkMin).toBeCloseTo(0.25, 6);
    expect(roundTrip(stats).walkMin).toBeCloseTo(0.25, 6);
  });
  it("a Lucky buff adds 3 Luck while it lasts", () => {
    const tip: Action = { name: "Big tip", min: 1, buff: { name: "Lucky", min: 120, attrs: { luck: 3 } } };
    stats.do(tip, "", rng);
    expect(stats.attr("luck")).toBe(stats.attrs.luck + 3);
    stats.passTime(121, 0);
    expect(stats.attr("luck")).toBe(stats.attrs.luck);
  });
  it("the bundled Lucky buffs all add 3 Luck", () => {
    const table = JSON.parse(dataFile("actions.json")) as ActionTable;
    const lucky = Object.values(table).flat().filter((a) => a.buff?.name === "Lucky");
    expect(lucky.length).toBeGreaterThan(0);
    for (const a of lucky) expect(a.buff!.attrs).toEqual({ luck: 3 });
  });
});

describe("need-driven goals", () => {
  const eat: Action = { name: "Eat", min: 1, cost: 5, fx: { fullness: 40 } };
  const work: Action = { name: "Wash dishes", min: 1, earn: 10 };
  const pull = (acts: Action[]) => needOf(acts, stats, 12).pull;
  it("pull 1 when nothing he needs is there", () => {
    expect(pull([eat])).toBe(1);
    expect(pull([])).toBe(1);
  });
  it("pull steeply harder the lower the meter the place refills", () => {
    stats.meters.fullness = NEED_AT / 2;
    expect(pull([eat])).toBeCloseTo(1 + NEED_BOOST / 4, 6);
    stats.meters.fullness = 0;
    expect(pull([eat])).toBeCloseTo(1 + NEED_BOOST, 6);
    expect(pull([work])).toBe(1);
  });
  it("small refills meet a need only in part", () => {
    stats.meters.fullness = 0;
    expect(pull([{ name: "Nibble", min: 1, fx: { fullness: A.FULL_FIX / 2 } }])).toBeCloseTo(1 + NEED_BOOST / 2, 6);
  });
  it("add up every need an action meets, and name the biggest", () => {
    stats.meters.fullness = 0;
    stats.meters.thirst = NEED_AT / 2;
    const meal: Action = { name: "Meal and a drink", min: 1, fx: { fullness: 40, thirst: 40 } };
    expect(pull([meal])).toBeCloseTo(1 + NEED_BOOST * 1.25, 6);
    expect(needOf([meal], stats, 12).why).toBe("fullness");
  });
  it("only count what he can do", () => {
    stats.meters.fullness = 0;
    stats.cents = 0;
    expect(pull([eat])).toBe(1);
    expect(needOf([eat], stats, 12).urgent).toBe(false);
  });
  it("mark a place urgent when it fixes a meter under URGENT_AT", () => {
    stats.meters.fullness = URGENT_AT;
    expect(needOf([eat], stats, 12).urgent).toBe(false);
    stats.meters.fullness = URGENT_AT - 1;
    expect(needOf([eat], stats, 12)).toMatchObject({ urgent: true, bottom: false });
    stats.meters.fullness = A.BOTTOM_AT - 1;
    expect(needOf([eat], stats, 12).bottom).toBe(true);
  });
  it("send him to paid work when he is broke or saving up", () => {
    stats.gear.vehicle = vehicle("dragon");
    stats.dragonFed = dayOf(stats.now() * 1000);
    stats.cents = 0;
    expect(pull([work])).toBeCloseTo(1 + NEED_BOOST, 6);
    expect(needOf([work], stats, 12).why).toBe("money");
    stats.cents = A.SKINT;
    expect(pull([work])).toBe(1);
    stats.savingFor = 2 * A.SKINT;
    expect(pull([work])).toBeCloseTo(1 + NEED_BOOST * A.SAVING_URGE, 6);
  });
  it("name a strong need in the feed, and stay quiet about a mild one", () => {
    expect(A.needLine("fullness", 1 + NEED_BOOST * A.SAY_URGE, false, "Bakery", 0)).toBe("Hungry, heading for Bakery");
    expect(A.needLine("fullness", 2, false, "Bakery", 0)).toBe("");
    expect(A.needLine("money", 2, true, "Docks", 0)).toBe("Short of money, heading for Docks");
    expect(A.needLine("", 50, true, "Docks", 0)).toBe("");
    // Saving up with money in his pocket is not being short of it.
    expect(A.needLine("money", 1 + NEED_BOOST * A.SAVING_URGE, false, "Docks", A.SKINT)).toBe("");
  });
  it("a place pulls as hard as its best action, not a mix of two", () => {
    const meal: Action = { name: "Meal", min: 1, fx: { fullness: 40 } };
    const lift: Action = { name: "Lift", min: 1, fx: { str: 0.1 } };
    stats.meters.fullness = 0;
    stats.attrs.str = 4;
    expect(pull([meal, lift])).toBeCloseTo(1 + NEED_BOOST, 6);
  });
  it("pull towards places that suit his best attribute", () => {
    const lift: Action = { name: "Lift", min: 1, fx: { str: 0.1 } };
    expect(pull([lift])).toBe(1);
    stats.attrs.str = 4;
    expect(pull([lift])).toBeCloseTo(A.STRENGTH_MAX, 6);
    stats.attrs.str = 2;
    expect(pull([lift])).toBeCloseTo(2 / 1.25, 6);
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

  it("holiday actions join every place's on a public holiday", () => {
    const acts = new Activities({ cafe: [{ name: "Coffee", min: 1 }], _spot: [{ name: "Sit", min: 1 }], _holiday: [{ name: "Parade", min: 1 }] });
    expect(acts.forPlace({ class: "cafe", subclass: "cafe" }).map((a) => a.name)).toEqual(["Coffee"]);
    expect(acts.forPlace({ class: "cafe", subclass: "cafe" }, "", true).map((a) => a.name)).toEqual(["Coffee", "Parade"]);
    expect(acts.peek(null, "", true).map((a) => a.name)).toEqual(["Sit", "Parade"]);
    expect(bundled().data._holiday?.length).toBeGreaterThan(2);
  });

  it("needs steer the choice", () => {
    const eat: Action = { name: "Eat", min: 10, fx: { fullness: 40 } };
    const look: Action = { name: "Look", min: 10, fx: { mood: 5 } };
    stats.meters.fullness = 20;
    expect(weight(eat, stats)).toBeCloseTo((1 + NEED_BOOST / 4) * weight(look, stats), 6);
    stats.cents = 0;
    expect(weight({ name: "Wash dishes", min: 60, earn: 20 }, stats)).toBeCloseTo(1 + NEED_BOOST, 6);
  });

  it("an urgent need leaves only what fixes it", () => {
    const eat: Action = { name: "Eat", min: 10, fx: { fullness: 40 } };
    const look: Action = { name: "Look", min: 10, fx: { mood: 5 } };
    stats.meters.fullness = URGENT_AT - 1;
    for (const r of [URGENT_SLIP, 0.5, 0.999]) expect(choose([look, eat], stats, 12, r)!.name).toBe("Eat");
    // Not yet at rock bottom: URGENT_SLIP of the time he picks from everything.
    expect(choose([look, eat], stats, 12, 0)!.name).toBe("Look");
    stats.meters.fullness = A.BOTTOM_AT - 1;
    for (const r of [0, 0.05, 0.999]) expect(choose([look, eat], stats, 12, r)!.name).toBe("Eat");
    stats.meters.fullness = URGENT_AT;
    expect(choose([look, eat], stats, 12, 0)!.name).toBe("Look");
  });

  it("a need at rock bottom beats another urgent one", () => {
    const eat: Action = { name: "Eat", min: 10, fx: { fullness: 40 } };
    const fun: Action = { name: "Fun", min: 10, fx: { mood: 30 } };
    stats.meters.fullness = A.BOTTOM_AT - 2;
    stats.meters.mood = URGENT_AT - 5;
    for (let i = 0; i < 20; i++) expect(choose([fun, eat], stats, 12, i / 20)!.name).toBe("Eat");
  });

  it("he shuns actions that drain a meter he needs", () => {
    const jog: Action = { name: "Jog", min: 10, fx: { energy: -20, str: 0.1 } };
    const w = weight(jog, stats);
    stats.meters.energy = NEED_AT / 2;
    expect(weight(jog, stats)).toBeCloseTo(0.75 * w, 6);
    stats.meters.energy = 0;
    expect(weight(jog, stats)).toBeCloseTo(A.HARM_FLOOR * w, 6);
  });

  it("he leans towards what he is good at", () => {
    const chat: Action = { name: "Chat", min: 10, needs: { cha: 2 } };
    const w = weight(chat, stats);
    stats.attrs.cha = 3;
    expect(weight(chat, stats)).toBeCloseTo(A.STRENGTH_MAX * w, 6);
  });

  it("saving for a trip favours paid work and cuts spending", () => {
    stats.gear.vehicle = vehicle("dragon");
    stats.dragonFed = dayOf(stats.now() * 1000);
    stats.cents = 100;
    const job: Action = { name: "Wash dishes", min: 60, earn: 20 };
    const dinner: Action = { name: "Dinner", min: 10, cost: 30 };
    const jobW = weight(job, stats);
    const dinnerW = weight(dinner, stats);
    stats.cents = A.SKINT;
    const jobW2 = weight(job, stats);
    stats.savingFor = 3 * A.SKINT;
    expect(weight(job, stats)).toBeCloseTo(jobW2 * (1 + NEED_BOOST * A.SAVING_URGE), 6);
    stats.cents = 100;
    stats.savingFor = 150;
    expect(weight(dinner, stats)).toBeLessThan(dinnerW);
    stats.cents = 150;
    const done = weight(job, stats);
    stats.savingFor = 0;
    expect(done).toBeCloseTo(weight(job, stats), 6);
    expect(jobW).toBeGreaterThan(done);
  });

  it("saving for a vehicle favours paid work too", () => {
    stats.gear.vehicle = vehicle("dragon");
    const job: Action = { name: "Wash dishes", min: 60, earn: 20 };
    const jobW = weight(job, stats);
    stats.gear.vehicle = vehicle("bike");
    expect(weight(job, stats)).toBeCloseTo(jobW * (1 + NEED_BOOST * A.SAVING_URGE), 6);
  });

  it("once he can afford his next vehicle, its shop pulls him and he browses", () => {
    const pull = (acts: Action[]) => needOf(acts, stats, 12).pull;
    const browse: Action = { name: "Browse the scooters", min: 15, item: "motorcycles" };
    const bikes: Action = { name: "Browse the bikes", min: 15, item: "bicycles" };
    stats.gear.vehicle = vehicle("bike");
    stats.cents = stats.savingTarget() - 1;
    expect(pull([browse])).toBeCloseTo(1, 6);
    const saving = weight(browse, stats);
    stats.cents = stats.savingTarget();
    expect(pull([browse])).toBe(GOAL_SHOP_PULL);
    expect(pull([bikes])).toBeCloseTo(1, 6);
    expect(weight(browse, stats)).toBeGreaterThan(saving + GOAL_SHOP_WEIGHT - 1);
    expect(weight(browse, stats) - weight(bikes, stats)).toBeCloseTo(GOAL_SHOP_WEIGHT, 6);
  });

  it("choose skips what he can't do", () => {
    stats.cents = 0;
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
