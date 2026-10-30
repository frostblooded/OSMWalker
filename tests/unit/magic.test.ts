// Ley lines and spells: where the lines run, how Magic fills and drains, and which spell he casts.
import { describe, expect, it } from "vitest";
import { FEATS, SETS } from "../../src/core/collection";
import { moved } from "../../src/core/geo";
import * as M from "../../src/core/magic";
import { METERS, Stats, type Place } from "../../src/core/stats";
import { dataFile } from "../support/data";

const T0 = 1_800_000_000;
const DAY = 86_400;
const SPELLS = JSON.parse(dataFile("spells.json")) as M.Spell[];
const spell = (id: string) => SPELLS.find((s) => s.id === id)!;
const SOFIA: [number, number] = [42.6977, 23.3219];
/** A place of class `cls`, `east` meters east of the middle of Sofia. */
const at = (cls: string, east: number, name = `${cls} ${east}`): Place => {
  const [lat, lon] = moved(SOFIA[0], SOFIA[1], [east, 0]);
  return { name, class: cls, subclass: cls, rank: 1, lat, lon };
};
const stats = () => {
  const s = Object.assign(new Stats(), { spellKinds: SPELLS });
  s.now = () => T0;
  return s;
};
const roundTrip = (s: Stats) => Stats.fromJSON(JSON.parse(JSON.stringify(s)));
/** A time from `t` on at which an old book at `place` teaches him a spell. */
function bookTime(place: Place, t = T0): number {
  for (let m = 0; m < 5000; m++) {
    const probe = Stats.fromJSON(JSON.parse(JSON.stringify(stats())));
    probe.spellKinds = SPELLS;
    probe.now = () => t + m * 60;
    probe.magicAt(place);
    if (probe.lore.known.length) return t + m * 60;
  }
  throw new Error("no spell");
}

describe("ley lines", () => {
  it("join each church, monument, memorial or castle to the nearest other one, each line once", () => {
    const church = at("place_of_worship", 0);
    const monument = at("monument", 300);
    const castle = at("castle", 2000);
    const cafe = at("cafe", 100);
    const lines = M.leyLines([church, monument, castle, cafe]);
    // Church and monument pick each other; the castle's nearest is the monument.
    expect(lines).toHaveLength(2);
    const ends = lines.map((l) => l.map((p) => p.join()).sort().join(" "));
    expect(ends).toContain([church, monument].map((p) => `${p.lat},${p.lon}`).sort().join(" "));
    expect(ends).toContain([monument, castle].map((p) => `${p.lat},${p.lon}`).sort().join(" "));
  });

  it("need two such places", () => {
    expect(M.leyLines([at("monument", 0), at("cafe", 10)])).toEqual([]);
    expect(M.leyLines([])).toEqual([]);
  });

  it("find the nearest one even when the latitudes are far apart", () => {
    const [lat, lon] = moved(SOFIA[0], SOFIA[1], [0, 500]);
    const north: Place = { name: "North", class: "memorial", subclass: "memorial", rank: 1, lat, lon };
    const lines = M.leyLines([at("monument", 0), at("monument", 3000), north]);
    expect(lines).toHaveLength(2);
    expect(lines.flat().filter((p) => p[0] === lat)).toHaveLength(1);
  });

  it("are under him within LEY_NEAR_M of a line, also halfway along it", () => {
    const lines = M.leyLines([at("monument", 0), at("monument", 1000)]);
    const off = (east: number, north: number) => moved(SOFIA[0], SOFIA[1], [east, north]) as [number, number];
    expect(M.onLey(lines, off(500, M.LEY_NEAR_M - 5))).toBe(true);
    expect(M.onLey(lines, off(500, M.LEY_NEAR_M + 5))).toBe(false);
    expect(M.onLey(lines, off(1000 + M.LEY_NEAR_M + 5, 0))).toBe(false);
    expect(M.onLey([], off(0, 0))).toBe(false);
  });

  it("walking along one fills Magic LEY_PER_KM a km, up to MAGIC_MAX, and charms his luck", () => {
    const s = stats();
    const luck = s.attr("luck");
    s.leyWalk(2000);
    expect(s.magic).toBeCloseTo(2 * M.LEY_PER_KM);
    expect(s.attr("luck")).toBe(luck + M.LEY_CHARM.attrs!.luck!);
    s.leyWalk(1_000_000);
    expect(s.magic).toBe(M.MAGIC_MAX);
    s.passTime(M.LEY_CHARM.min, 0);
    expect(s.buffNames()).not.toContain(M.LEY_CHARM.name);
  });

  it("quest and event rewards can give Magic, kept within 0 and MAGIC_MAX", () => {
    const s = stats();
    s.applyFx({ magic: 15 });
    expect(s.magic).toBe(15);
    s.applyFx({ magic: 500 });
    expect(s.magic).toBe(M.MAGIC_MAX);
    s.applyFx({ magic: -500 });
    expect(s.magic).toBe(0);
    const bank = JSON.parse(dataFile("quests.json")) as { quests: { id: string; reward: { fx?: Record<string, number> } }[] };
    for (const id of ["ley_hunter", "borrowed_spellbook"]) expect(bank.quests.find((q) => q.id === id)?.reward.fx?.magic, id).toBeGreaterThan(0);
  });

  it("a place on a line gives a burst once a day each", () => {
    const s = stats();
    const church = at("place_of_worship", 0, "St Nedelya");
    s.magicAt(church);
    expect(s.magic).toBe(M.LEY_BURST);
    expect(s.history.entries.at(-1)?.text).toBe(`✨ Felt the ley lines meet at St Nedelya (Magic +${M.LEY_BURST})`);
    s.magicAt(church);
    s.magicAt(at("cafe", 10));
    expect(s.magic).toBe(M.LEY_BURST);
    s.magicAt(at("monument", 50));
    expect(s.magic).toBe(2 * M.LEY_BURST);
    s.now = () => T0 + DAY;
    s.magicAt(church);
    expect(s.magic).toBe(3 * M.LEY_BURST);
  });
});

describe("spells", () => {
  it("are as many as the Spellbook feat's Gold tier, each costing Magic and doing something", () => {
    expect(SPELLS).toHaveLength(FEATS.find((f) => f.id === "spells")!.tiers[2]);
    for (const s of SPELLS) {
      expect(s.cost, s.id).toBeGreaterThan(0);
      expect(s.cost, s.id).toBeLessThanOrEqual(M.SPARE_MAGIC);
      expect(!!s.meter !== !!s.buff, `${s.id}: a meter spell or a buff spell`).toBe(true);
      if (s.meter) {
        expect(METERS).toContain(s.meter);
        expect(s.fx?.[s.meter], s.id).toBeGreaterThan(0);
      }
    }
    expect(new Set(SPELLS.map((s) => s.id)).size).toBe(SPELLS.length);
  });

  it("come from libraries and bookshops, which the map files in one class", () => {
    const dex = JSON.parse(dataFile("placedex.json")) as Record<string, string>;
    for (const kind of ["library/library", "library/books"]) expect(dex[kind], kind).toBeDefined();
    expect(M.BOOK_CLASSES).toEqual(["library"]);
  });

  it("are learned from old books at libraries and bookshops, with LEARN_CHANCE, each once", () => {
    const m = new M.Lore();
    expect(m.learn(SPELLS, M.LEARN_CHANCE)).toBeNull();
    expect(m.learn(SPELLS, 0)?.id).toBe(SPELLS[0]!.id);
    expect(m.learn(SPELLS, 0)?.id).toBe(SPELLS[1]!.id);
    for (let i = 0; i < SPELLS.length; i++) m.learn(SPELLS, M.LEARN_CHANCE * 0.99);
    expect(new Set(m.known).size).toBe(SPELLS.length);
    expect(m.learn(SPELLS, 0)).toBeNull();
  });

  it("magicAt teaches one at a library, says so and writes his first in the chronicle", () => {
    const s = stats();
    const lib = at("library", 0, "National Library");
    s.now = () => bookTime(lib);
    s.magicAt(lib);
    expect(s.lore.known).toHaveLength(1);
    const k = spell(s.lore.known[0]!);
    expect(s.history.entries.at(-1)?.text).toBe(`📖 Learned a spell from an old book at National Library: ${k.icon} ${k.name}`);
    expect(s.chronicle.lines.map((l) => l.text)).toContain(`Learned his first spell, ${k.name}, at National Library`);
    const none = stats();
    none.now = s.now;
    none.magicAt(at("cafe", 0, "National Library"));
    expect(none.lore.known).toEqual([]);
  });

  it("a meter spell is cast when its meter is under SPELL_AT and he has the Magic", () => {
    const meters = { health: 100, energy: 100, fullness: M.SPELL_AT - 1, mood: 70, hygiene: 100, thirst: 80 };
    expect(M.toCast(SPELLS, ["soup"], spell("soup").cost, meters, [])?.id).toBe("soup");
    expect(M.toCast(SPELLS, ["soup"], spell("soup").cost - 1, meters, [])).toBeNull();
    expect(M.toCast(SPELLS, [], 100, meters, [])).toBeNull();
    expect(M.toCast(SPELLS, ["soup"], 100, { ...meters, fullness: M.SPELL_AT }, [])).toBeNull();
  });

  it("a buff spell is cast only with SPARE_MAGIC and while its buff is off", () => {
    const meters = { health: 100, energy: 100, fullness: 80, mood: 70, hygiene: 100, thirst: 80 };
    expect(M.toCast(SPELLS, ["star"], M.SPARE_MAGIC - 1, meters, [])).toBeNull();
    expect(M.toCast(SPELLS, ["star"], M.SPARE_MAGIC, meters, [])?.id).toBe("star");
    expect(M.toCast(SPELLS, ["star"], 100, meters, ["Lucky star"])).toBeNull();
    // A low meter comes first.
    expect(M.toCast(SPELLS, ["star", "socks"], 100, { ...meters, hygiene: 10 }, [])?.id).toBe("socks");
  });

  it("casting spends Magic, does the spell and says so, as time passes", () => {
    const s = stats();
    s.lore.known = ["soup"];
    s.magic = 50;
    s.meters.fullness = 20;
    s.passTime(1, 0);
    expect(s.magic).toBe(50 - spell("soup").cost);
    expect(s.meters.fullness).toBeGreaterThan(20 + spell("soup").fx!.fullness! - 1);
    expect(s.lore.casts).toEqual({ soup: 1 });
    expect(s.history.entries.at(-1)?.text).toBe(`🍲 Conjured a bowl of warm soup (Magic −${spell("soup").cost})`);
  });

  it("the Collection lists every spell, with a hint until he learns it", () => {
    const s = stats();
    s.lore.known = ["dog"];
    s.lore.casts = { dog: 2 };
    const entries = SETS.find((x) => x.id === "spells")!.entries(s);
    expect(entries.map((e) => e.id)).toEqual(SPELLS.map((k) => k.id));
    expect(entries.find((e) => e.id === "dog")).toMatchObject({ got: true, info: "Cast 2×" });
    expect(entries.find((e) => e.id === "soup")).toMatchObject({ got: false, info: "Found in an old book at a library or bookshop" });
  });

  it("the save keeps his Magic and spells, and an old save starts with none", () => {
    const s = stats();
    s.magic = 42;
    s.lore.known = ["star"];
    s.lore.casts = { star: 3 };
    s.lore.tap("x", "2026-10-30");
    const back = roundTrip(s);
    expect(back.magic).toBe(42);
    expect(back.lore.toJSON()).toEqual({ known: ["star"], casts: { star: 3 }, day: "2026-10-30", tapped: ["x"] });
    const old = JSON.parse(JSON.stringify(new Stats()));
    delete old.magic;
    delete old.lore;
    const fresh = Stats.fromJSON(old);
    expect(fresh.magic).toBe(0);
    expect(fresh.lore.toJSON()).toEqual({ known: [], casts: {}, day: "", tapped: [] });
  });
});
