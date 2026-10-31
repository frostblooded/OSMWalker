// The Collection registry: sets and their hints, items he has owned, feats,
// badges and titles, the overall %, and saving it all.
import { beforeEach, describe, expect, it } from "vitest";
import * as CC from "../../src/core/cityCards";
import * as C from "../../src/core/collection";
import * as Items from "../../src/core/items";
import { HOME_THINGS } from "../../src/core/home";
import { TOWER_KIND } from "../../src/core/poiGen";
import { VISAS } from "../../src/core/visas";
import { Rng } from "../../src/core/rng";
import { Stats } from "../../src/core/stats";
import { parseCities } from "../../src/core/trips";
import { collected } from "../../src/ui/CollectionSheet";
import { dataFile } from "../support/data";

const roundTrip = (s: Stats) => Stats.fromJSON(JSON.parse(JSON.stringify(s)));
const set = (id: string) => C.SETS.find((x) => x.id === id)!;
const feat = (id: string) => C.FEATS.find((x) => x.id === id)!;
const pool = CC.pool(parseCities(dataFile("cities.tsv")));
const dex = JSON.parse(dataFile("placedex.json")) as Record<string, string>;

let stats: Stats;
beforeEach(() => {
  stats = new Stats();
  stats.now = () => 1_000_000;
  stats.setCityPool(pool);
  stats.dex = dex;
});

describe("the registry", () => {
  it("puts every set on a tab, with ids unique across sets and feats", () => {
    const tabs = C.TABS.map((t) => t.id);
    for (const s of C.SETS) expect(tabs).toContain(s.tab);
    expect(new Set(C.SETS.map((s) => s.id)).size).toBe(C.SETS.length);
    expect(new Set(C.FEATS.map((f) => f.id)).size).toBe(C.FEATS.length);
  });

  it("gives every entry of a set a unique id", () => {
    for (const s of C.SETS) {
      const ids = s.entries(stats).map((e) => e.id);
      expect(new Set(ids).size, s.id).toBe(ids.length);
    }
  });

  it("never gives away an unfound entry's name in its hint", () => {
    for (const s of C.SETS)
      for (const e of s.entries(stats).filter((x) => !x.got)) expect(e.info.toLowerCase(), `${s.id} ${e.id}`).not.toContain(e.name.toLowerCase());
  });

  it("has feat tiers that rise, and a title for each", () => {
    for (const f of C.FEATS) {
      expect(f.tiers[0] < f.tiers[1] && f.tiers[1] < f.tiers[2], f.id).toBe(true);
      expect(f.title, f.id).not.toBe("");
    }
  });

  it("lists every country of the city list and every item base", () => {
    expect(set("countries").entries(stats)).toHaveLength(pool.byCountry.size);
    const bases = [...set("gear").entries(stats), ...set("vehicles").entries(stats)].map((e) => e.id);
    expect(bases.sort()).toEqual(C.BASES.map((b) => b.base).sort());
    expect(set("materials").entries(stats)).toHaveLength(C.MATERIAL_NAMES.length);
  });
});

describe("items he has owned", () => {
  it("reads the base and material back from any item's name", () => {
    expect(new Set(C.BASES.map((b) => b.base)).size).toBe(C.BASES.length);
    const rng = new Rng(7);
    for (const kind of Object.keys(Items.KINDS) as Items.Kind[])
      for (let i = 0; i < 200; i++) {
        const item = Items.make(kind, 30, rng, 50);
        const { base, mat } = C.partsOf(item);
        expect(item.name, item.name).toContain(Items.KINDS[kind][0]!.plain ? `${base}` : `${mat} ${base}`);
        expect(Items.KINDS[kind].some((b) => b.base === base), item.name).toBe(true);
      }
    expect(C.partsOf({ name: "Lucky Copper Lucky Charm of Fortune", slot: "trinket" })).toEqual({ base: "Lucky Charm", mat: "Copper" });
    expect(C.partsOf({ name: "Wooden Racing Bike", slot: "vehicle" })).toEqual({ base: "Racing Bike", mat: "Wooden" });
    expect(C.partsOf({ name: "Swift Dragon of the Hare", slot: "vehicle" })).toEqual({ base: "Dragon" });
  });

  it("counts what he has, and keeps what he had once a save notes it", () => {
    const sword = Items.build(Items.KINDS.weapons[0]!, Items.MATERIALS[2]!, []);
    stats.equip(sword);
    expect(set("gear").entries(stats).find((e) => e.id === "Sword")!.got).toBe(true);
    expect(set("materials").entries(stats).find((e) => e.id === "Bronze")!.got).toBe(true);
    C.award(stats);
    stats.gear = {};
    const back = roundTrip(stats);
    expect(back.keepsakes.owned).toEqual(["b:Sword", "m:Bronze"]);
    expect(set("gear").entries(back).find((e) => e.id === "Sword")!.got).toBe(true);
  });
});

describe("odd places", () => {
  it("knows a wizard's tower by the kind poiGen gives it", () => {
    expect(TOWER_KIND).toBe("wizard_tower");
  });

  it("notes the first of each made-up odd kind, but not must-haves", () => {
    const at = { rank: 1, lat: 0, lon: 0, made: true };
    stats.collect({ ...at, name: "Wizard's tower at X", class: "wizard_tower", subclass: "wizard_tower" }, new Rng(1));
    stats.collect({ ...at, name: "Sofia inn", class: "lodging", subclass: "guest_house", must: true }, new Rng(1));
    expect(roundTrip(stats).keepsakes.odd).toEqual(["wizard_tower"]);
    expect(set("odd").entries(stats).filter((e) => e.got).map((e) => e.name)).toEqual(["Wizard tower"]);
    expect(stats.keepsakes.dex.size).toBe(0);
  });
});

describe("old saves", () => {
  it("load with no items noted, odd places, badges or title", () => {
    const old = JSON.parse(JSON.stringify(stats));
    for (const key of ["owned", "odd", "badges", "title"]) delete old.keepsakes[key];
    const k = Stats.fromJSON(old).keepsakes;
    expect([k.owned, k.odd, k.badges, k.title]).toEqual([[], [], {}, ""]);
  });
});

describe("badges and titles", () => {
  it("gives each tier once, with a feed line, and a Gold one's title", () => {
    stats.level = 5;
    expect(C.award(stats)).toEqual(["🥉 Bronze badge: Growing up (level 5)"]);
    expect(C.award(stats)).toEqual([]);
    stats.level = 30;
    expect(C.award(stats)).toEqual(["🥇 Gold badge: Growing up (level 30). New title: Veteran"]);
    expect(stats.keepsakes.title).toBe("Veteran");
    expect(stats.history.entries.at(-1)!.text).toContain("New title: Veteran");
    const back = roundTrip(stats).keepsakes;
    expect([back.badges, back.title]).toEqual([{ level: 3 }, "Veteran"]);
  });

  it("keeps a badge when the count falls again", () => {
    stats.keepsakes.badges.treasured = 1;
    expect(C.tierHeld(feat("treasured"), stats)).toBe(1);
  });

  it("counts countries and cities from where he has been", () => {
    stats.arrive("Sofia", "BGR", "Bulgaria");
    stats.arrive("Plovdiv", "BGR", "Bulgaria");
    stats.arrive("Paris", "FRA", "France");
    expect([feat("countries").count(stats), feat("cities").count(stats)]).toEqual([2, 3]);
    expect(set("countries").entries(stats).filter((e) => e.got).map((e) => e.name)).toEqual(["Bulgaria", "France"]);
  });
});

describe("completion", () => {
  it("counts found entries and tiers, leaving out open sets", () => {
    const empty = C.completion(stats);
    expect(empty.got).toBe(0);
    stats.arrive("Sofia", "BGR", "Bulgaria");
    stats.keepsakes.cards.set("x", { name: "X", kind: "museum/museum", city: "Sofia", rarity: "Rare", finish: "", t: 1 });
    const after = C.completion(stats);
    expect(after.total).toBe(empty.total);
    expect(after.got).toBe(1);
  });
});

describe("the sheet's numbers", () => {
  it("are worked out once, and again only after a new feed line", () => {
    const first = collected(stats);
    expect(collected(stats)).toBe(first);
    stats.arrive("Sofia", "BGR", "Bulgaria");
    stats.say("Reached Sofia");
    const next = collected(stats);
    expect(next).not.toBe(first);
    expect(next.entries.get("countries")!.filter((e) => e.got).map((e) => e.id)).toEqual(["BGR"]);
  });
});

describe("a life of his own", () => {
  it("fills with a pet, a fairy pet, a flat, his own full home and visas, and its feats count them", () => {
    const s = new Stats();
    const got = () => Object.fromEntries(set("settled").entries(s).map((e) => [e.id, e.got]));
    expect(Object.values(got()).some(Boolean)).toBe(false);
    expect([feat("homebody").count(s), feat("citizen").count(s)]).toEqual([0, 0]);
    s.pets.adopt("dog", 0, "", new Rng(1));
    s.pets.pet!.fairy = true;
    s.home.rent("Sofia, Bulgaria", "BG", [0, 0], 0);
    expect(got()).toMatchObject({ pet: true, fairy: true, rent: true, own: false, full: false });
    s.home.bought = 1;
    s.home.things = Array.from({ length: HOME_THINGS }, (_, i) => ({ name: `T${i}`, slot: "trinket", stats: {}, rarity: "Common", price: 1 }) as Items.Item);
    s.visas.days = { BG: VISAS[1].from };
    expect(got()).toMatchObject({ own: true, full: true, long: true, citizen: false });
    s.visas.days.RO = VISAS[3].from;
    expect(got().citizen).toBe(true);
    expect([feat("homebody").count(s), feat("citizen").count(s)]).toEqual([HOME_THINGS, 1]);
  });
});
