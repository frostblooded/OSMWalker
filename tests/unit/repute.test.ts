// Karma, fame and the law: what deeds do to them, perks either way, the police chase, and the same while away.
import { describe, expect, it } from "vitest";
import { Activities, BOUNTY_WEIGHT, exploreWeight, PAYOFF_PULL, weight } from "../../src/core/activities";
import { KIND_DEED_WEIGHT, DODGE_CHANCE } from "../../src/core/bond";
import { FEATS, SETS } from "../../src/core/collection";
import { Quests, type Bank } from "../../src/core/quests";
import { DEED_STEP, LEAN_AT, LEAN_MAX } from "../../src/core/bond";
import { catchUp, type AwayCity } from "../../src/core/catchup";
import * as Fm from "../../src/core/fame";
import { bboxAround } from "../../src/core/geo";
import { aura } from "../../src/core/look";
import { defaultPick, RASCAL_BASE, RASCAL_MAX, RASCAL_MIN, rascalOdds, type Moment } from "../../src/core/moments";
import * as R from "../../src/core/repute";
import { Rng, seedOf } from "../../src/core/rng";
import { KEEP_CENTS, Stats, type Action, type Place } from "../../src/core/stats";
import { parseCities, Trips } from "../../src/core/trips";
import { dataFile } from "../support/data";
import { hourSky } from "../support/sky";

const T0 = 1_800_000_000;
const place = (name: string, cls: string, lat = 0, lon = 0): Place => ({ name, class: cls, subclass: cls, rank: 1, lat, lon });
const fixed = (v: number) => ({ randf: () => v }) as Rng;
function at(t = T0, city = "Bigtown, A-land"): Stats {
  const s = new Stats();
  s.now = () => t;
  s.arrive(city, "AAA", "A-land");
  return s;
}
const ACTIONS = JSON.parse(dataFile("actions.json")) as Record<string, Action[]>;
const action = (kind: string, name: string) => ACTIONS[kind]!.find((a) => a.name === name)!;

describe("fame", () => {
  it("adds up by city, tiers up, never drops, and gives its tier's discount", () => {
    const f = new Fm.Fame();
    const k = Fm.cityKey("Sofia", "BG");
    expect(f.tier(k)).toBe(0);
    expect(f.add(k, Fm.FAME_TIERS[1] - 1)).toBeNull();
    expect(f.add(k, 1)).toBe(1);
    expect(f.add(k, -500)).toBeNull();
    expect(f.points(k)).toBe(Fm.FAME_TIERS[1]);
    expect(f.discount(k)).toBe(Fm.FAME_DISCOUNT[1]);
    f.add(k, 10_000);
    expect(f.points(k)).toBe(Fm.FAME_MAX);
    expect(f.tier(k)).toBe(3);
    f.add(Fm.cityKey("Varna", "BG"), 5);
    f.add(Fm.cityKey("Paris", "FR"), 7);
    expect(f.country("BG")).toBe(Fm.FAME_MAX + 5);
    expect(f.total()).toBe(Fm.FAME_MAX + 12);
    expect(f.citiesAt(1)).toBe(1);
    expect(Fm.Fame.fromJSON(JSON.parse(JSON.stringify(f))).toJSON()).toEqual(f.toJSON());
  });

  it("grows with time in a city, and the feed says when a city knows his face", () => {
    const s = at();
    s.passTime(Fm.FAME_TIERS[1] * 60, 0);
    expect(s.fame.tier(s.here())).toBe(1);
    expect(s.history.entries.map((e) => e.text)).toContain("⭐ Bigtown, A-land knows his face now: Known");
  });
});

describe("karma", () => {
  it("moves his lean within its bounds, adds fame either way, and only bad deeds raise the heat", () => {
    const s = at();
    s.applyFx({ karma: 10 });
    expect(s.bond.lean).toBe(10);
    expect(s.law.heat).toBe(0);
    expect(s.fame.points(s.here())).toBe(10);
    s.applyFx({ karma: -10 });
    expect(s.bond.lean).toBe(0);
    expect(s.law.heat).toBe(10 * R.HEAT_PER_KARMA);
    s.karma(-500);
    expect(s.bond.lean).toBe(-LEAN_MAX);
    expect(s.law.heat).toBe(R.HEAT_MAX);
    expect(s.law.topStars).toBe(R.STARS_MAX);
    expect(s.law.worstKarma).toBe(-LEAN_MAX);
    expect(s.law.bestKarma).toBe(10);
  });

  it("raises more heat where people know his face", () => {
    const stranger = at();
    stranger.karma(-10);
    const known = at();
    known.fame.add(known.here(), Fm.FAME_TIERS[2]);
    known.karma(-10);
    expect(known.law.heat).toBe(stranger.law.heat * (1 + 2 * R.FAME_HEAT));
  });

  it("a rascal deed from an action is a small crime", () => {
    const s = at();
    s.do(action("restaurant", "Sneak out without paying"), "Diner", new Rng(1), "restaurant");
    expect(s.bond.lean).toBe(-DEED_STEP);
    expect(s.law.heat).toBe(DEED_STEP * R.HEAT_PER_KARMA);
  });

  it("a rascal picks rascal deeds more often, and a dodged bus ticket is a rascal deed", () => {
    const s = at();
    const rascal = { name: "Sneak", min: 5, deed: -1 };
    const before = weight(rascal, s);
    s.bond.lean = -LEAN_AT;
    expect(weight(rascal, s)).toBe(before + KIND_DEED_WEIGHT);
    let t = T0;
    while (new Rng(seedOf(`Central${t}`)).randf() >= DODGE_CHANCE) t++;
    s.now = () => t;
    s.ride(500, "bus", "Central", "Plovdiv");
    expect(s.bond.lean).toBe(-LEAN_AT - DEED_STEP);
    expect(s.law.heat).toBe(DEED_STEP * R.HEAT_PER_KARMA);
  });

  it("his own picks follow his karma: a saint stays kind, a crook keeps at it, with a small chance to change", () => {
    expect(rascalOdds(0)).toBe(RASCAL_BASE);
    expect(rascalOdds(LEAN_MAX)).toBe(RASCAL_MIN);
    expect(rascalOdds(-LEAN_MAX)).toBe(RASCAL_MAX);
    const m: Moment = { id: "shop", icon: "🛍", ask: "?", options: [{ id: "kind", label: "Be kind" }, { id: "rob", label: "Rob" }], default: "kind", rascal: "rob" };
    const s = new Stats();
    s.bond.lean = -LEAN_MAX;
    expect(defaultPick(m, s, fixed(RASCAL_MAX - 0.01))).toBe("rob");
    s.bond.lean = LEAN_MAX;
    expect(defaultPick(m, s, fixed(RASCAL_MIN + 0.01))).toBe("kind");
  });

  it("shows as a halo or horns at either end", () => {
    expect(aura(R.AURA_AT)).toBe("halo");
    expect(aura(-R.AURA_AT)).toBe("horns");
    expect(aura(R.AURA_AT - 1)).toBeUndefined();
  });
});

describe("perks", () => {
  it("kind walkers pay less, the more so where he is known; rascals pay more and sell at fence prices", () => {
    const s = at();
    expect(s.priced(1000)).toBe(1000);
    s.bond.lean = LEAN_AT;
    expect(s.priced(1000)).toBe(Math.round(1000 * (1 - R.KIND_DISCOUNT)));
    s.fame.add(s.here(), Fm.FAME_TIERS[3]);
    expect(s.shopDiscount()).toBeCloseTo(R.KIND_DISCOUNT + Fm.FAME_DISCOUNT[3]);
    s.bond.lean = -LEAN_AT;
    expect(s.priced(1000)).toBe(Math.round(1000 * (1 + R.RASCAL_MARKUP)));
    const before = s.cents;
    s.do(action("cafe", "Espresso at the bar"), "Cafe", new Rng(1), "cafe");
    expect(before - s.cents).toBe(s.priced(300));
  });

  it("he saves up for his next vehicle at the price he will pay", () => {
    const s = at();
    const list = s.vehicleSaving();
    s.bond.lean = -LEAN_AT;
    expect(s.vehicleSaving() - KEEP_CENTS).toBe(s.priced(list - KEEP_CENTS));
    expect(s.vehicleSaving()).toBeGreaterThan(list);
  });

  it("a kind walker may get a free bus ride and gifts from locals", () => {
    let t = T0;
    while (new Rng(seedOf(`freeStation${t}`)).randf() >= R.FREE_RIDE_CHANCE) t++;
    const s = at(t);
    s.bond.lean = LEAN_AT;
    const cents = s.cents;
    expect(s.ride(500, "bus", "Station", "Nexttown")).toContain("waved him on for free");
    expect(s.cents).toBe(cents);
    let g = T0;
    const p = place("Square", "park");
    // Nobody is after him, so the gift takes the first roll.
    while (new Rng(seedOf(`law${g}${p.name}`)).randf() >= R.GIFT_CHANCE) g++;
    const k = at(g);
    k.bond.lean = LEAN_AT;
    expect(k.reputeAt(p)).toBeNull();
    expect(k.history.latest()).toMatch(/^🎁 /);
  });

  it("only a rascal shoplifts; what he takes is marked stolen", () => {
    const steal = action("clothing_store", "Pocket something while nobody looks");
    const s = at();
    expect(s.canDo(steal, 12)).toBe(false);
    s.bond.lean = -LEAN_AT;
    expect(s.canDo(steal, 12)).toBe(true);
    const cents = s.cents;
    s.do(steal, "Boutique", new Rng(3), "clothing_store");
    expect(s.cents).toBe(cents);
    const all = [...s.bag, ...Object.values(s.gear)];
    expect(all.some((i) => i?.stolen)).toBe(true);
    expect(s.bond.lean).toBe(-LEAN_AT - R.STEAL_KARMA);
    expect(s.history.latest()).toMatch(/^🫳 Pocketed a /);
  });
});

describe("the law", () => {
  it("heat fades by itself and stars count each STAR_HEAT", () => {
    const l = new R.Law();
    l.addHeat(R.STAR_HEAT * 2 + 1);
    expect(l.stars()).toBe(2);
    l.pass(60);
    expect(l.heat).toBe(R.STAR_HEAT * 2 + 1 - R.HEAT_FADE_PER_H);
    l.pass(100_000);
    expect(l.heat).toBe(0);
  });

  it("the police only spot him while he is wanted, and a kind walker gives himself up by himself", () => {
    const p = place("Square", "park");
    expect(at().reputeAt(p)).toBeNull();
    let t = T0;
    while (new Rng(seedOf(`law${t}${p.name}`)).randf() >= R.spotChance(R.HEAT_MAX, 0)) t++;
    const s = at(t);
    s.law.addHeat(R.HEAT_MAX);
    const m = s.reputeAt(p)!;
    expect(m.id).toBe("police_chase");
    expect(s.history.latest()).toBe("🚨 The police spotted him at Square!");
    s.bond.lean = LEAN_MAX;
    expect(defaultPick(m, s, fixed(0.5))).toBe("surrender");
  });

  it("caught, he pays a fine, or short of money sits in jail, and loses what he stole", () => {
    const s = at();
    s.law.addHeat(50);
    s.bag.push({ name: "Hat", slot: "head", stats: {}, rarity: "Common", price: 100, stolen: true } as Stats["bag"][number]);
    const cents = s.cents;
    expect(s.chased("surrender", 0)).toBe(0);
    expect(cents - s.cents).toBe(R.fineOf(50));
    expect(s.law.heat).toBe(0);
    expect(s.bag.some((i) => i.stolen)).toBe(false);
    expect(s.bond.lean).toBe(R.SURRENDER_KARMA);
    const broke = at();
    broke.cents = 0;
    broke.law.addHeat(R.HEAT_MAX);
    expect(broke.chased("run", 0.99)).toBe(R.STARS_MAX * R.JAIL_MIN_PER_STAR);
    expect(broke.law.jailed).toBe(1);
    expect(broke.chronicle.lines.map((l) => l.text)).toContain("Spent 5 hours in jail in Bigtown, A-land");
    // Heat faded under a star during the chase: still at least an hour, and never a fine he can't pay.
    const faded = at();
    faded.cents = 0;
    faded.law.addHeat(R.STAR_HEAT - 1);
    expect(faded.chased("surrender", 0.99)).toBe(R.JAIL_MIN_PER_STAR);
    expect(faded.history.latest()).toMatch(/: 1 hour in jail$/);
    expect(faded.cents).toBe(0);
  });

  it("running or hiding may lose them (more heat), a bribe clears it at a karma cost", () => {
    const s = at();
    s.law.addHeat(40);
    expect(s.chased("run", 0)).toBe(0);
    expect(s.law.heat).toBe(40 + R.ESCAPE_HEAT);
    expect(s.law.escapes).toBe(1);
    const cents = s.cents;
    expect(s.chased("bribe", 0)).toBe(0);
    expect(s.law.heat).toBe(0);
    expect(cents - s.cents).toBe(R.bribeOf(40 + R.ESCAPE_HEAT));
    expect(s.bond.lean).toBe(-R.BRIBE_KARMA);
    expect(R.escapeOdds("bribe", { ...s.him(), heat: 100, cents: 0 })).toBe(0);
  });

  it("wanted, he pays it off at a police station, and they pull him", () => {
    const s = at();
    const pay = action("police", "Pay off his bounty");
    s.law.addHeat(R.STAR_HEAT * R.PAYOFF_STARS - 1);
    expect(s.canDo(pay, 12)).toBe(false);
    expect(exploreWeight(place("Police", "police"), s)).toBe(1);
    s.law.addHeat(1);
    expect(s.canDo(pay, 12)).toBe(true);
    expect(exploreWeight(place("Police", "police"), s)).toBe(PAYOFF_PULL);
    expect(weight(pay, s)).toBe(weight({ ...pay, bounty: undefined }, s) + BOUNTY_WEIGHT);
    const cents = s.cents;
    s.do(pay, "Police", new Rng(1), "police");
    expect(cents - s.cents).toBe(R.payoffOf(R.STAR_HEAT * R.PAYOFF_STARS));
    expect(s.law.heat).toBe(0);
    s.cents = KEEP_CENTS;
    s.law.addHeat(R.HEAT_MAX);
    expect(s.canDo(pay, 12)).toBe(false);
  });

  it("the save keeps fame and the law; an old save starts a stranger nobody is after", () => {
    const s = at();
    s.karma(-30);
    const back = Stats.fromJSON(JSON.parse(JSON.stringify(s)));
    expect(back.law.toJSON()).toEqual(s.law.toJSON());
    expect(back.fame.toJSON()).toEqual(s.fame.toJSON());
    const old = JSON.parse(JSON.stringify(new Stats()));
    delete old.fame;
    delete old.law;
    old.bond.lean = 80;
    const o = Stats.fromJSON(old);
    expect(o.law.heat).toBe(0);
    expect(o.fame.total()).toBe(0);
    // His karma so far counts towards the halo tile and the Saint badge.
    expect(o.law.bestKarma).toBe(80);
  });

  it("while away, a wanted walker gets chased and it plays out by itself", () => {
    const trips = new Trips(parseCities("Bigtown\tAAA\tA-land\t0.0\t0.0\t1000000\n"));
    const home: AwayCity = { name: "Bigtown, A-land", code: "AAA", center: [0, 0], bounds: bboxAround(0, 0, 3000), places: [place("Cafe", "cafe", 0, 0.003), place("Square", "park", 0.003, 0), place("Bakery", "bakery", 0.003, 0.003)] };
    const deps = { activities: new Activities(ACTIONS), trips, rng: new Rng(7), skyAt: hourSky((ms: number) => new Date(ms).getUTCHours()), roll: () => 0.99 };
    const stats = new Stats();
    stats.law.addHeat(R.HEAT_MAX);
    const s = catchUp(stats, home, [0, 0], 24 * 3600, Date.UTC(2026, 9, 29, 8), deps);
    const lines = s.lines.map((l) => l.text);
    expect(lines.some((l) => l.startsWith("🚨 The police spotted him"))).toBe(true);
    expect(lines.some((l) => l.startsWith("🚓 "))).toBe(true);
    expect(stats.law.chases).toBeGreaterThan(0);
    // A chase takes the place of the stop's action, as while you watch.
    const spotted = lines.findIndex((l) => l.startsWith("🚨"));
    expect(lines[spotted + 1]).toMatch(/^🚓 /);
  });
});

describe("quests, events and the Collection", () => {
  const bank = JSON.parse(dataFile("quests.json")) as Bank;

  it("the bank has quests for the kind and for rascals, and quests and events that move his karma", () => {
    expect(bank.quests.filter((q) => q.side === "kind").length).toBeGreaterThan(1);
    expect(bank.quests.filter((q) => q.side === "rascal").length).toBeGreaterThan(1);
    expect(bank.quests.some((q) => (q.reward.fx?.karma ?? 0) > 0 && !q.side)).toBe(true);
    expect(bank.events.some((e) => (e.win.fx?.karma ?? 0) > 0)).toBe(true);
    expect(bank.events.some((e) => (e.win.fx?.karma ?? 0) < 0)).toBe(true);
    for (const q of bank.quests) if (q.side === "rascal") expect(q.reward.fx?.karma ?? 0).toBeLessThan(0);
  });

  it("a board only has the kind or rascal quests that fit his lean", () => {
    const places = ["bar", "shop/pawnbroker", "place_of_worship", "town_hall", "cafe", "bus", "park", "police", "grocery", "bakery"].map((c, i) => ({ ...place(`P${i}`, c.split("/")[0]!), subclass: c.split("/")[1] ?? c, lat: i * 0.001 }));
    const sides = (lean: string) => {
      const q = new Quests();
      q.bank = bank;
      q.roll("Bigtown", 5_000_000, places, new Rng(5), lean);
      return new Set(q.board.map((o) => bank.quests.find((k) => k.id === o.kind)!.side ?? ""));
    };
    expect(sides("kind").has("rascal")).toBe(false);
    expect(sides("rascal").has("kind")).toBe(false);
    const plain = sides("");
    expect(plain.has("kind") || plain.has("rascal")).toBe(false);
  });

  it("badges and the Good name, bad name set count his karma, fame and run-ins with the law", () => {
    const s = at();
    s.karma(R.AURA_AT);
    s.karma(-2 * R.AURA_AT);
    s.law.addHeat(R.HEAT_MAX);
    s.chased("run", 0);
    s.fame.add(s.here(), Fm.FAME_TIERS[3]);
    const feat = (id: string) => FEATS.find((f) => f.id === id)!.count(s);
    expect(feat("saint")).toBe(R.AURA_AT);
    expect(feat("villain")).toBe(R.AURA_AT);
    expect(feat("wanted")).toBe(R.STARS_MAX);
    expect(feat("getaways")).toBe(1);
    expect(feat("known")).toBe(1);
    const got = SETS.find((x) => x.id === "repute")!.entries(s).filter((e) => e.got).map((e) => e.id);
    expect(got).toEqual(["halo", "horns", "hero", "getaway"]);
  });
});
