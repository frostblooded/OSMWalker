// Guessing where his next trip goes (src/core/guess.ts) and settling it (Care).
import { describe, expect, it } from "vitest";
import { Care } from "../../src/core/gifts";
import { GUESS_CHOICES, makeGuess } from "../../src/core/guess";
import { Rng } from "../../src/core/rng";
import { Stats } from "../../src/core/stats";
import type { City } from "../../src/core/trips";

const city = (name: string, code: string, country: string): City => ({ name, code, country, lat: 0, lon: 0, pop: 1 });
const CITIES = [
  city("Sofia", "BGR", "Bulgaria"),
  city("Plovdiv", "BGR", "Bulgaria"),
  city("Varna", "BGR", "Bulgaria"),
  city("Burgas", "BGR", "Bulgaria"),
  city("Paris", "FRA", "France"),
  city("Lyon", "FRA", "France"),
  city("Rome", "ITA", "Italy"),
  city("Oslo", "NOR", "Norway"),
];

describe("making a guess", () => {
  it("offers cities of his country for a trip at home, never the city he is in", () => {
    for (let seed = 1; seed < 30; seed++) {
      const g = makeGuess(CITIES[1]!, "BGR", "Sofia", CITIES, new Rng(seed))!;
      expect(g.abroad).toBe(false);
      expect(g.answer).toBe("Plovdiv");
      expect(g.choices).toHaveLength(GUESS_CHOICES);
      expect(g.choices).toContain("Plovdiv");
      expect(g.choices).not.toContain("Sofia");
      for (const c of g.choices) expect(["Plovdiv", "Varna", "Burgas"]).toContain(c);
    }
  });

  it("offers countries for a trip abroad, each once", () => {
    const g = makeGuess(CITIES[5]!, "BGR", "Sofia", CITIES, new Rng(3))!;
    expect(g.abroad).toBe(true);
    expect(g.answer).toBe("France");
    expect(new Set(g.choices).size).toBe(GUESS_CHOICES);
    expect(g.choices).not.toContain("Bulgaria");
  });

  it("puts the answer in different places", () => {
    const spots = new Set<number>();
    for (let seed = 1; seed < 30; seed++) spots.add(makeGuess(CITIES[1]!, "BGR", "Sofia", CITIES, new Rng(seed))!.choices.indexOf("Plovdiv"));
    expect(spots.size).toBe(GUESS_CHOICES);
  });

  it("has fewer choices when there are few cities, and none with no decoy", () => {
    expect(makeGuess(CITIES[1]!, "BGR", "Sofia", CITIES.slice(0, 3), new Rng(1))!.choices).toHaveLength(2);
    expect(makeGuess(CITIES[1]!, "BGR", "Sofia", CITIES.slice(0, 2), new Rng(1))).toBeNull();
  });
});

describe("settling a guess", () => {
  const open = () => {
    const s = new Stats();
    s.care.guess = { abroad: false, choices: ["Varna", "Plovdiv", "Burgas"], answer: "Plovdiv", pick: "" };
    return s;
  };

  it("pays a clover for a right guess", () => {
    const s = open();
    expect(s.care.pickGuess("Plovdiv")).toBe(true);
    expect(s.care.reveal(s)).toBe("You guessed it: Plovdiv! (+1 ☘)");
    expect(s.care.clovers).toBe(1);
    expect(s.care.guess).toBeNull();
  });

  it("says where he went after a wrong guess", () => {
    const s = open();
    s.care.pickGuess("Varna");
    expect(s.care.reveal(s)).toBe("Not Varna: he's off to Plovdiv");
    expect(s.care.clovers).toBe(0);
  });

  it("takes one pick from the choices, and says nothing when nobody guessed", () => {
    const s = open();
    expect(s.care.pickGuess("Oslo")).toBe(false);
    expect(s.care.pickGuess("Burgas")).toBe(true);
    expect(s.care.pickGuess("Plovdiv")).toBe(false);
    const quiet = open();
    expect(quiet.care.reveal(quiet)).toBe("");
    expect(new Care().pickGuess("Varna")).toBe(false);
  });

  it("is kept in the save", () => {
    const s = open();
    s.care.pickGuess("Varna");
    expect(Stats.fromJSON(JSON.parse(JSON.stringify(s))).care.guess).toEqual({ abroad: false, choices: ["Varna", "Plovdiv", "Burgas"], answer: "Plovdiv", pick: "Varna" });
  });
});
