// Border moments: the lines for crossing into another country, and that the
// bundled words cover every country with its own actions.
import { describe, expect, it } from "vitest";
import { crossing, type Borders } from "../../src/core/border";
import { Stats } from "../../src/core/stats";
import { parseCities } from "../../src/core/trips";
import { dataFile } from "../support/data";

const B: Borders = { words: { BGR: ["Zdravey", "hello", "leva"], FRA: ["Bonjour", "good day", ""] }, guards: ["waved him through.", "yawned."] };

describe("border crossing lines", () => {
  it("stamp, money, the first word and a guard on a first visit", () => {
    const lines = crossing(B, "BGR", "Bulgaria", 3, true);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("Bulgaria");
    expect(lines[0]).toContain("3");
    expect(lines[1]).toContain("leva");
    expect(lines[2]).toContain('"Zdravey" (hello)');
    expect(lines[3]).toMatch(/^Border guard (waved him through\.|yawned\.)$/);
  });

  it("no new word on a return visit, and no money to change in a euro country", () => {
    const lines = crossing(B, "FRA", "France", 4, false);
    expect(lines).toHaveLength(3);
    expect(lines.join(" ")).not.toContain("Bonjour");
    expect(lines[1]).toContain("euros here too");
  });

  it("a country with no words still gets the stamp and the guard, and the guard is the same each time", () => {
    const a = crossing(B, "XXX", "Nowhere", 5, true);
    expect(a).toHaveLength(2);
    expect(crossing(B, "XXX", "Nowhere", 5, true)).toEqual(a);
  });

  it("nothing while the data hasn't loaded", () => {
    expect(crossing(null, "BGR", "Bulgaria", 1, true)).toEqual([]);
  });
});

describe("Stats.arrive", () => {
  const heard = (s: Stats) => {
    const out: string[] = [];
    s.onSay = (l) => out.push(l);
    return out;
  };

  it("says the border lines only when the country changes", () => {
    const s = new Stats();
    s.borders = B;
    const said = heard(s);
    s.arrive("Sofia, Bulgaria", "BGR", "Bulgaria");
    expect(said).toEqual([]);
    s.arrive("Plovdiv, Bulgaria", "BGR", "Bulgaria");
    expect(said).toEqual([]);
    s.arrive("Paris, France", "FRA", "France");
    expect(said.some((l) => l.includes("Bonjour"))).toBe(true);
    said.length = 0;
    s.arrive("Sofia, Bulgaria", "BGR", "Bulgaria");
    expect(said.some((l) => l.includes("Zdravey"))).toBe(false);
    expect(said.some((l) => l.startsWith("Border guard"))).toBe(true);
  });
});

describe("data/borders.json", () => {
  const data = JSON.parse(dataFile("borders.json")) as Borders;
  const codes = new Set(parseCities(dataFile("cities.tsv")).map((c) => c.code));

  it("has a word for every country with its own actions, and only listed countries", () => {
    for (const code of Object.keys(JSON.parse(dataFile("flavour.json")))) expect(data.words[code], code).toBeDefined();
    for (const code of Object.keys(data.words)) expect(codes.has(code), code).toBe(true);
    for (const [word, meaning] of Object.values(data.words)) expect(word && meaning).toBeTruthy();
    expect(data.guards.length).toBeGreaterThan(5);
  });
});
