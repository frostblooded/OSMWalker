import { describe, expect, it } from "vitest";
import type { ActionTable } from "../../src/core/activities";
import { RARITY, SLOTS } from "../../src/core/items";
import { CRAWLS } from "../../src/core/keepsakes";
import { ATTRS, METERS } from "../../src/core/stats";
import { parseAirports, parseCities } from "../../src/core/trips";
import * as Help from "../../src/ui/help";
import { dataFile } from "../support/data";

const data = {
  actions: JSON.parse(dataFile("actions.json")) as ActionTable,
  flavour: JSON.parse(dataFile("flavour.json")) as Record<string, ActionTable>,
  cities: parseCities(dataFile("cities.tsv")),
  airports: parseAirports(dataFile("airports.tsv")),
  dex: JSON.parse(dataFile("placedex.json")) as Record<string, string>,
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
    expect(page("trips").body).toMatch(/^- 2.5%: he travels to a city in another country/m);
    expect(page("trips").body).toMatch(/^- 10%: he travels to another city in the same country/m);
    expect(page("stations").body).toContain("rides go 10 times faster and never take longer than 15 minutes");
    expect(page("stations").body).toContain("100 km by bus takes about 8 minutes, and 300 km by bus about 15.");
    expect(page("fares").body).toContain("300 km by bus costs about €31.20");
    expect(page("coins").body).toContain("He starts with €200.");
    expect(page("fainting").body).toContain("Waking up costs €60, but never more than 50% of his money.");
    expect(page("wages").body).toContain("3% more for every level above 1");
    expect(page("wages").body).toContain("with charm 10 it pays 20% more");
    expect(page("saving").body).toContain("on foot, a Bike for €150");
    expect(page("cards").body).toContain("0.5% of cards are Gold and 5% are Foil");
    expect(page("placedex").body).toContain("Legendary: +200 XP");
    expect(page("citycards").body).toContain("He also buys packs at kiosks, newsagents and gift shops: \"Buy a city card pack\" costs €5.");
    expect(page("citycards").body).toContain("Rare 5% of the time, Uncommon 25% and Common 70%");
    expect(page("citycards").body).toContain("he gets Charm +1 while he is in that country");
    expect(page("placedex").body).toContain("The sweep knows 329 kinds.");
    expect(page("souvenirs").body).toContain("there is a 30% chance he finds it there");
    expect(page("souvenirs").body).toContain("every 5 souvenirs make his fares 2% cheaper, up to 10%");
    expect(page("crawls").body).toMatch(/^- ☕ Coffee crawl: 4 different cafes or coffee shops in a day, then \+2 energy at each one he visits,$/m);
    expect(page("stories").body).toContain("worn through 3 or more countries");
    expect(page("saving").body).toContain("on a scooter or motorbike, a Hatchback for €7,500");
    expect(page("modifiers").body).toContain("Common, no modifiers: 60% of items");
    expect(page("map").body).toContain("more than 20% of the view away from the middle");
    expect(page("menu").body).toContain("Camera follows him");
    expect(page("map").body).toContain("ⓘ");
    expect(page("away").body).toContain("at most 24 hours");
    expect(page("away").body).toContain("at least 1 minute");
    expect(page("offline").body).toContain("While you were away");
    expect(page("guess").body).toContain("with up to 3 choices");
    expect(page("postcards").body).toContain("up to 24 letters");
    expect(page("guess").body).toContain("earns 1 ☘ clover");
    expect(page("guess").body).toContain("leaving the game for 1 minute or more");
    expect(page("care").body).toContain("after at least 1 hour away earns 1 ☘ clover");
    expect(page("care").body).toMatch(/^- 📖 City guide, 2 ☘: \+2 Wits for 4 h$/m);
  });

  it("words every crawl's kinds", () => {
    for (const c of CRAWLS) expect(Help.CRAWL_KINDS[c.id], c.id).toBeTruthy();
  });

  it("has a page for every screen button", () => {
    for (const id of ["menu", "collection", "care", "postcards", "sheet", "history", "debug", "new_city", "help", "map", "screen"]) expect(page(id), id).toBeDefined();
  });
});

describe("search", () => {
  const s = Help.parse(
    "# 🚶 Walking\n## How he walks {walking}\nHe walks at 5 km/h.\n- Cafés are goals.\n## Speed {speed}\nA bike makes him faster than walking.\n# 🪙 Money\n## Coins {coins}\nHe starts with €200 and buys a bike.",
  );
  const ids = (q: string) => Help.search(s, q).map((h) => h.page.id);

  it("finds nothing for an empty query", () => {
    expect(Help.search(s, "  ")).toEqual([]);
  });

  it("matches titles and page text, title matches first", () => {
    expect(ids("speed")).toEqual(["speed"]);
    expect(ids("bike")).toEqual(["speed", "coins"]);
    expect(ids("walk")).toEqual(["walking", "speed"]);
  });

  it("needs every word, in any order and case", () => {
    expect(ids("BIKE starts")).toEqual(["coins"]);
    expect(ids("bike nope")).toEqual([]);
  });

  it("matches from the start of words only", () => {
    expect(ids("alks")).toEqual([]);
    expect(ids("fast")).toEqual(["speed"]);
  });

  it("ignores accents", () => {
    expect(ids("cafes")).toEqual(["walking"]);
    expect(ids("Café")).toEqual(["walking"]);
  });

  it("gives the section and a snippet split around the match", () => {
    const [hit] = Help.search(s, "cafes");
    expect(hit!.section).toBe("🚶 Walking");
    expect(hit!.snip).toEqual(["", "Cafés", " are goals."]);
  });

  it("cuts long lines around the match", () => {
    const long = Help.parse(`# A\n## B {b}\n${"x ".repeat(60)}needle${" y".repeat(60)}`);
    const [before, match, after] = Help.search(long, "needle")[0]!.snip;
    expect(match).toBe("needle");
    expect(before.startsWith("…")).toBe(true);
    expect(after.endsWith("…")).toBe(true);
    expect(before.length + after.length).toBeLessThan(120);
  });

  it("finds real pages by their filled numbers", () => {
    expect(Help.search(sections, "€150").length).toBeGreaterThan(0);
    expect(Help.search(sections, "hygiene")[0]!.page.id).toBe("hygiene");
  });
});
