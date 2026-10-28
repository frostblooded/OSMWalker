import { describe, expect, it } from "vitest";
import type { ActionTable } from "../../src/core/activities";
import { RARITY, SLOTS } from "../../src/core/items";
import { ATTRS, METERS } from "../../src/core/stats";
import { parseAirports, parseCities } from "../../src/core/trips";
import * as Help from "../../src/ui/help";
import { dataFile } from "../support/data";

const data = {
  actions: JSON.parse(dataFile("actions.json")) as ActionTable,
  flavour: JSON.parse(dataFile("flavour.json")) as Record<string, ActionTable>,
  cities: parseCities(dataFile("cities.tsv")),
  airports: parseAirports(dataFile("airports.tsv")),
};
const raw = dataFile("help.txt");
const sections = Help.build(raw, data);
const pages = sections.flatMap((s) => s.pages);
const page = (id: string) => pages.find((p) => p.id === id)!;

describe("parse", () => {
  it("splits sections and pages with ids", () => {
    const s = Help.parse("# 🚶 Walking\n## How he walks {walking}\nLine one.\n\nLine two.\n## Map {map}\nTiles.\n# Other\n## X {x}\nY");
    expect(s.map((x) => x.title)).toEqual(["🚶 Walking", "Other"]);
    expect(s[0]!.pages).toEqual([
      { id: "walking", title: "How he walks", body: "Line one.\n\nLine two." },
      { id: "map", title: "Map", body: "Tiles." },
    ]);
  });

  it("turns paragraphs into blocks, with - lines as items", () => {
    expect(Help.blocks("Intro\nmore.\n\nList:\n- a,\n- b.")).toEqual([
      { text: "Intro more.", items: [] },
      { text: "List:", items: ["a,", "b."] },
    ]);
  });

  it("fills placeholders", () => {
    expect(Help.fill("{A} and {B} but {c}", { A: "1", B: "two" })).toBe("1 and two but {c}");
  });
});

describe("the real help", () => {
  it("has every placeholder filled", () => {
    const left = sections.flatMap((s) => s.pages.flatMap((p) => p.body.match(/\{[A-Z0-9_]+\}/g) ?? []));
    expect(left).toEqual([]);
  });

  it("has no unused values", () => {
    const unused = Object.keys(Help.values(data)).filter((k) => !raw.includes(`{${k}}`));
    expect(unused).toEqual([]);
  });

  it("has unique page ids", () => {
    const ids = pages.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has a page for every meter and attribute", () => {
    for (const k of [...METERS, ...ATTRS]) expect(page(k), k).toBeDefined();
  });

  it("names every gear slot and rarity", () => {
    for (const s of SLOTS) expect(page("items").body).toContain(s);
    for (const r of RARITY) expect(page("modifiers").body).toContain(r);
  });

  it("uses the game's real numbers", () => {
    expect(page("walking").body).toContain("5 km/h, about 83 m a minute");
    expect(page("speed").body).toContain("bike: 15 km/h");
    expect(page("trips").body).toMatch(/^- 5%: he travels to a city in another country/m);
    expect(page("fares").body).toContain("300 km by bus costs about €31.20");
    expect(page("coins").body).toContain("He starts with €200.");
    expect(page("health").body + page("coins").body).toContain("€150");
    expect(page("modifiers").body).toContain("Common, no modifiers: 60% of items");
    expect(page("map").body).toContain("more than 20% of the view away from the middle");
    expect(page("menu").body).toContain("Camera follows him");
    expect(page("map").body).toContain("ⓘ");
  });

  it("has a page for every screen button", () => {
    for (const id of ["menu", "sheet", "history", "debug", "new_city", "help", "map", "screen"]) expect(page(id), id).toBeDefined();
  });
});
