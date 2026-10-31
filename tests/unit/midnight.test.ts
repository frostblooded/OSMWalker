// The shop after midnight: when it is open, what it sells, and what he pays in euros and Magic.
import { describe, expect, it } from "vitest";
import { SETS } from "../../src/core/collection";
import * as Items from "../../src/core/items";
import * as Mn from "../../src/core/midnight";
import { Rng } from "../../src/core/rng";
import { KEEP_CENTS, Stats, type Action } from "../../src/core/stats";
import { dataFile } from "../support/data";

const ACTIONS = JSON.parse(dataFile("actions.json")) as Record<string, Action[]>;
const KNOCK = ACTIONS["shop/antiques"]!.find((a) => a.midnight)!;
const enchantmentsOf = (item: Items.Item) => Items.ENCHANTMENTS.filter((e) => item.name.includes(e.name));
/** A seed whose first roll takes the enchanted shelf (`enchanted`) or the trinket one. */
function seed(enchanted: boolean, from = 1): number {
  for (let s = from; ; s++) if (new Rng(s).randf() < Mn.ENCHANTED_CHANCE === enchanted) return s;
}
const rich = () => {
  const s = new Stats();
  s.cents = 1_000_000;
  s.magic = 100;
  s.level = 30;
  return s;
};

describe("the shop after midnight", () => {
  it("is a knock at real antique and second-hand shops, only from midnight to 3", () => {
    for (const kind of ["shop/antiques", "shop/second_hand"]) expect(ACTIONS[kind]!.some((a) => a.midnight && a.needs?.time === "midnight"), kind).toBe(true);
    const s = new Stats();
    expect(s.canDo(KNOCK, 0)).toBe(true);
    expect(s.canDo(KNOCK, 2)).toBe(true);
    expect(s.canDo(KNOCK, 3)).toBe(false);
    expect(s.canDo(KNOCK, 23)).toBe(false);
  });

  it("enchants an item with exactly one enchantment, and never past Legendary", () => {
    for (let i = 0; i < 300; i++) {
      const item = Items.makeEnchanted("weapons", 30, new Rng(i), 15);
      expect(enchantmentsOf(item), item.name).toHaveLength(1);
      expect(item.rarity).not.toBe("Common");
      expect(Items.RARITY).toContain(item.rarity);
      expect(item.name.split(" of ").length, item.name).toBeLessThanOrEqual(2);
    }
  });

  it("ordinary shops never sell enchantments", () => {
    for (let i = 0; i < 300; i++) expect(enchantmentsOf(Items.make("clothes", 30, new Rng(i), 15))).toEqual([]);
  });

  it("an enchanted upgrade costs ENCHANTED_PRICE times its price plus ENCHANTED_MAGIC, and he wears it", () => {
    const s = rich();
    const r = seed(true);
    s.do(KNOCK, "Old Curiosity", new Rng(r));
    const worn = Object.values(s.gear).find((i) => i && enchantmentsOf(i).length)!;
    expect(worn).toBeDefined();
    expect(s.magic).toBe(100 - Mn.ENCHANTED_MAGIC);
    expect(s.cents).toBe(1_000_000 - worn.price);
    expect(s.history.entries.at(-1)?.text).toMatch(/^🌙 Bought a \w+ .+ at Old Curiosity after midnight \(-€[\d.,]+, Magic −20\)$/);
    expect(s.finds.got).toEqual([enchantmentsOf(worn)[0]!.name]);
  });

  it("without the Magic he only looks", () => {
    const s = rich();
    s.magic = Mn.ENCHANTED_MAGIC - 1;
    s.do(KNOCK, "Old Curiosity", new Rng(seed(true)));
    expect(s.gear).toEqual({});
    expect(s.cents).toBe(1_000_000);
    expect(s.history.entries.at(-1)?.text).toMatch(/hadn't the Magic for it/);
  });

  it("a trinket is used on the spot, for euros plus its Magic, keeping his reserve", () => {
    const s = rich();
    s.meters.mood = 50;
    s.meters.energy = 50;
    s.do(KNOCK, "Flea Corner", new Rng(seed(false)));
    const t = Mn.TRINKETS.find((k) => s.finds.got.includes(k.id))!;
    expect(s.cents).toBe(1_000_000 - t.cents);
    expect(s.magic).toBe(Math.min(100 - t.magic + (t.fx?.magic ?? 0), 100));
    expect(s.history.entries.at(-1)?.text.startsWith(`${t.icon} Bought a ${t.name} at Flea Corner after midnight and ${t.say}`)).toBe(true);
    const poor = new Stats();
    poor.cents = KEEP_CENTS;
    poor.magic = 100;
    poor.do(KNOCK, "Flea Corner", new Rng(seed(false)));
    expect(poor.cents).toBe(KEEP_CENTS);
    expect(poor.finds.got).toEqual([]);
  });

  it("enchanted gear fills Magic for each km he walks", () => {
    const s = new Stats();
    s.equip(Items.build(Items.KINDS.trinkets[0]!, Items.MATERIALS[0]!, [Items.ENCHANTMENTS.find((e) => e.name === "of the Moon")!]));
    expect(s.gearMagic()).toBe(2);
    s.passTime(1, 3000);
    expect(s.magic).toBeCloseTo(6);
  });

  it("the Collection lists every enchantment and trinket, with a hint until he finds it", () => {
    const s = new Stats();
    s.finds.got = ["Moonlit", "tea"];
    const entries = SETS.find((x) => x.id === "midnight")!.entries(s);
    expect(entries).toHaveLength(Items.ENCHANTMENTS.length + Mn.TRINKETS.length);
    expect(entries.filter((e) => e.got).map((e) => e.id)).toEqual(["Moonlit", "tea"]);
    expect(entries.find((e) => e.id === "star")).toMatchObject({ got: false, info: "A trinket from the shop after midnight" });
  });

  it("the save keeps his finds, and an old save starts with none", () => {
    const s = new Stats();
    s.finds.got = ["bone"];
    expect(Stats.fromJSON(JSON.parse(JSON.stringify(s))).finds.got).toEqual(["bone"]);
    const old = JSON.parse(JSON.stringify(new Stats()));
    delete old.finds;
    expect(Stats.fromJSON(old).finds.got).toEqual([]);
  });
});
