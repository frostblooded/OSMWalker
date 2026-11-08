import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { KINDS } from "../../src/core/places";
import * as Help from "../../src/ui/help";
import { HELP_URL } from "../../src/ui/HelpSheet";
import { dataFile } from "../support/data";

const raw = dataFile("help.txt");
const sections = Help.build(raw);
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
    const unused = Object.keys(Help.values()).filter((k) => !raw.includes(`{${k}}`));
    expect(unused).toEqual([]);
  });

  it("has unique page ids", () => {
    const ids = pages.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses the game's real numbers", () => {
    expect(page("walking").body).toContain("5 km/h, about 83 m a minute");
    const places = page("places").body;
    expect(places).toContain("- 💶 work places pay money: cafe, bakery, restaurant, fast food,");
    expect(places).toContain("A minute of walking is worth €0.60 at a work place, 10 XP at a sight and 5 XP in a green space, and every stop is worth 3 minutes on top");
    expect(places).toMatch(/a work place 300 m away pays €[\d.]+ and one 1.2 km away €[\d.]+\./);
    expect(places).toContain("he gets 20 XP on top");
    expect(page("goal").body).toContain("each a place nearby");
    expect(page("goal").body).toContain("at most 200 m away");
    expect(page("goal").body).toContain("3 cards (4 with the 🗺 City map)");
    expect(page("upgrades").body).toContain("- 🚲 Bike, from level 3 for €25 at a bike shop: cards reach 2 times as far and he rides 3 times as fast.");
    expect(page("walking").body).toContain("rides at 15 km/h");
    expect(page("xp").body).toContain("100 XP from level 1 to 2, 200 XP from 2 to 3, 1000 XP from 10 to 11");
  });

  it("names every rewarding kind of place", () => {
    const body = page("places").body;
    for (const c of Object.values(KINDS).flat()) expect(body, c).toContain(c.replace(/_/g, " "));
  });

  it("has a page for every screen button", () => {
    for (const id of ["goal", "menu", "sheet", "history", "debug", "new_city", "help", "map", "screen", "upgrades"]) expect(page(id), id).toBeDefined();
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

  it("marks the right letters after an emoji", () => {
    const [hit] = Help.search(Help.parse("# A\n## B {b}\nHe is 🙂 and saves battery."), "battery");
    expect(hit!.snip[1]).toBe("battery");
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
    expect(Help.search(sections, "€25").length).toBeGreaterThan(0);
    expect(Help.search(sections, "levels")[0]!.page.id).toBe("xp");
  });

  it("is fetched from an address that changes with its text, so no cache serves an old Help", () => {
    expect(HELP_URL).toMatch(new RegExp(`data/help\\.txt\\?v=${createHash("sha1").update(raw).digest("hex").slice(0, 8)}$`));
  });
});
