import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
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
    const riding = page("walking").body;
    expect(riding).toContain("He rides his bike at 45 km/h, about 750 m a minute");
    expect(riding).toContain("3 times a real city bike's 15 km/h");
    expect(riding).toContain("Each 🔧 Bike tune-up makes him 10% faster");
    const orders = page("orders").body;
    expect(orders).toContain("after about 60 seconds of riding about on average");
    expect(orders).toContain("Each 📱 Delivery app boost makes the wait 10% shorter");
    expect(orders).toContain("one of the 5 food places nearest him");
    expect(orders).toContain("300 m to 1.5 km from it");
    expect(page("places").body).toMatch(/An order pays €2 plus €1 per km .* a door 500 m from the restaurant pays €[\d.]+ and one 1.5 km off pays €[\d.]+\./);
    const up = page("upgrades").body;
    expect(up).toContain("costs 9% more each time");
    expect(up).toContain("- 🔧 Bike tune-up, from €4: he rides 10% faster.");
    expect(up).toContain("opens once he has 10 Bike tune-ups");
  });

  it("has a page for every screen button", () => {
    for (const id of ["orders", "menu", "sheet", "history", "debug", "new_city", "help", "map", "screen", "upgrades"]) expect(page(id), id).toBeDefined();
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
    expect(Help.search(sections, "€4")[0]!.page.id).toBe("upgrades");
    expect(Help.search(sections, "orders")[0]!.page.id).toBe("orders");
  });

  it("is fetched from an address that changes with its text, so no cache serves an old Help", () => {
    expect(HELP_URL).toMatch(new RegExp(`data/help\\.txt\\?v=${createHash("sha1").update(raw).digest("hex").slice(0, 8)}$`));
  });
});
