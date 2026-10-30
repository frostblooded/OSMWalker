import { describe, expect, it } from "vitest";
import * as Items from "../../src/core/items";
import { Rng } from "../../src/core/rng";

describe("items", () => {
  it("rarity comes from the modifier count", () => {
    expect(Items.modifierCount(0)).toBe(0);
    expect(Items.modifierCount(0.59)).toBe(0);
    expect(Items.modifierCount(0.61)).toBe(1);
    expect(Items.modifierCount(0.89)).toBe(2);
    expect(Items.modifierCount(0.99)).toBe(3);
    expect(Items.RARITY).toEqual(["Common", "Uncommon", "Rare", "Legendary"]);
  });

  it("items have a name, slot, stats and price", () => {
    for (let s = 0; s < 50; s++) {
      const it = Items.make("weapons", 1, new Rng(s));
      expect(Items.SLOTS).toContain(it.slot);
      expect(it.price).toBeGreaterThan(0);
      expect(Object.keys(it.stats).length).toBeGreaterThan(0);
      expect(Items.RARITY).toContain(it.rarity);
      expect(it.name).not.toBe("");
    }
  });

  it("modifiers show in the name and add stats", () => {
    const sword = { base: "Sword", slot: "weapon", stat: "str", price: 20 } as const;
    const plain = Items.build(sword, Items.MATERIALS[2]!, []);
    const mighty = Items.build(sword, Items.MATERIALS[2]!, [Items.PREFIXES[0]!, Items.SUFFIXES[1]!]);
    expect(plain.name).toBe("Bronze Sword");
    expect(mighty.name).toBe("Mighty Bronze Sword of the Fox");
    expect(mighty.rarity).toBe("Rare");
    expect(mighty.stats.str!).toBeGreaterThan(plain.stats.str!);
    expect(mighty.stats.wit!).toBeGreaterThan(0);
    expect(mighty.price).toBeGreaterThan(plain.price);
  });

  it("prices are real euros, in cents", () => {
    const sword = Items.KINDS.weapons.find((b) => b.base === "Sword")!;
    expect(Items.build(sword, Items.MATERIALS.find((m) => m.metal === "Bronze")!, []).price).toBe(sword.price * 100);
    expect(Items.build(sword, Items.MATERIALS.find((m) => m.metal === "Wooden")!, []).price).toBe(sword.price * 50);
    expect(sword.price).toBeGreaterThanOrEqual(20);
    expect(Items.KINDS.cars[0]!.price).toBeGreaterThanOrEqual(10000);
  });

  it("better materials unlock with level", () => {
    for (let s = 0; s < 50; s++) {
      const name = Items.make("weapons", 1, new Rng(s)).name;
      expect(name.includes("Steel") || name.includes("Mithril")).toBe(false);
    }
  });

  it("each shop kind sells its own things", () => {
    for (let s = 0; s < 30; s++) {
      const rng = new Rng(s);
      expect(["body", "feet", "head", "bag"]).toContain(Items.make("clothes", 3, rng).slot);
      expect(Items.make("trinkets", 3, rng).slot).toBe("trinket");
    }
  });

  it("vehicle shops sell their own vehicle", () => {
    for (let s = 0; s < 20; s++) {
      const rng = new Rng(s);
      for (const [kind, vehicle] of [["bicycles", "bike"], ["motorcycles", "motorcycle"], ["cars", "car"]] as const) {
        const it = Items.make(kind, 30, rng);
        expect(it.slot).toBe("vehicle");
        expect(it.vehicle).toBe(vehicle);
        expect(it.stats.speed ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it("vehicles are a saving goal", () => {
    const cheapest: Record<string, number> = {};
    for (let s = 0; s < 50; s++) {
      const rng = new Rng(s);
      for (const kind of ["bicycles", "motorcycles", "cars"] as const) cheapest[kind] = Math.min(cheapest[kind] ?? Infinity, Items.make(kind, 1, rng).price);
    }
    // A used bike, scooter and car: €100-200, €1,000-1,500 and €6,000-9,000.
    expect(cheapest.bicycles).toBeGreaterThanOrEqual(10_000);
    expect(cheapest.bicycles).toBeLessThanOrEqual(20_000);
    expect(cheapest.motorcycles).toBeGreaterThanOrEqual(100_000);
    expect(cheapest.motorcycles).toBeLessThanOrEqual(150_000);
    expect(cheapest.cars).toBeGreaterThanOrEqual(600_000);
    expect(cheapest.cars).toBeLessThanOrEqual(900_000);
  });

  it("fantasy mounts: the dragon tops the cars, the others sit beside a vehicle of their tier", () => {
    expect(Items.cheapest("dragons").price).toBe(4_000_000);
    expect(Items.nextVehicle("car")).toMatchObject({ name: "Dragon", kind: "dragons" });
    expect(Items.nextVehicle("dragon")).toBeNull();
    expect(Items.nextVehicle("tortoise")).toMatchObject({ name: "Scooter" });
    expect(Items.nextVehicle("broom")).toMatchObject({ name: "Hatchback" });
    expect(Items.nextVehicle("carpet")).toMatchObject({ name: "Dragon" });
    const best = Items.MATERIALS.at(-1)!;
    const carpet = Items.build(Items.KINDS.carpets[0]!, best, []);
    const car = Items.build(Items.KINDS.cars[0]!, Items.MATERIALS[0]!, []);
    expect(Items.power(carpet)).toBeGreaterThan(Items.power(car));
    expect(Items.power(Items.build(Items.KINDS.dragons[0]!, Items.MATERIALS[0]!, []))).toBeGreaterThan(Items.power(Items.build(Items.KINDS.cars[0]!, best, [])));
  });

  it("a living mount has no material in its name", () => {
    expect(Items.build(Items.KINDS.dragons[0]!, Items.MATERIALS[3]!, [Items.SUFFIXES[5]!]).name).toBe("Dragon of the Hare");
    expect(Items.build(Items.KINDS.tortoises[0]!, Items.MATERIALS[0]!, []).name).toBe("Giant Tortoise");
    expect(Items.build(Items.KINDS.carpets[0]!, Items.MATERIALS[4]!, []).name).toBe("Silk Flying Carpet");
  });

  it("a car outranks any bike", () => {
    const bike = Items.build(Items.KINDS.bicycles[0]!, Items.MATERIALS.at(-1)!, [Items.PREFIXES[0]!, Items.SUFFIXES[0]!]);
    const car = Items.build(Items.KINDS.cars[0]!, Items.MATERIALS[0]!, []);
    expect(Items.power(car)).toBeGreaterThan(Items.power(bike));
  });
});
