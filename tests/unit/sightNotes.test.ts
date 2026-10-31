// Sight notes: which article names a sight, how its first sentence is cut, and how lookups are kept.
import { describe, expect, it } from "vitest";
import { ask, MAX_CHARS, matches, NONE_KEEP, NOTE_WIT, NOTE_XP, PER_HOUR, pick, SightNotes, tidy, url, wikiOf } from "../../src/core/sightNotes";
import { Stats } from "../../src/core/stats";

const answer = (...pages: { title: string; extract?: string; index: number }[]) => ({ query: { pages: Object.fromEntries(pages.map((p, i) => [String(100 + i), p])) } });

describe("sight notes", () => {
  it("asks one Wikipedia for its articles near the sight, with their first sentence", () => {
    expect(url("bg", 42.69589, 23.33276)).toBe(
      "https://bg.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=geosearch&ggscoord=42.69589|23.33276&ggsradius=200&ggslimit=10&prop=extracts&exintro=1&explaintext=1&exsentences=1&exlimit=10",
    );
    expect(wikiOf("pt-BR")).toBe("pt");
    expect(wikiOf("fil")).toBe("tl");
    expect(wikiOf("bg")).toBe("bg");
  });

  it("looks up at most PER_HOUR sights an hour", () => {
    let asks: number[] = [];
    for (let i = 0; i < PER_HOUR; i++) asks = ask(asks, i * 60_000)!;
    expect(ask(asks, PER_HOUR * 60_000)).toBeNull();
    expect(ask(asks, 3_600_000)).toEqual([...asks.slice(1), 3_600_000]);
  });

  it("takes an article only when its title names the sight", () => {
    expect(matches("Alexander Nevsky Cathedral, Sofia", "Alexander Nevsky Cathedral")).toBe(true);
    expect(matches("Musée d'Orsay", "Musee d’Orsay")).toBe(true);
    expect(matches("Храм-паметник „Св. Александър Невски“", "храм-паметник Св. Александър Невски")).toBe(true);
    // A short word is no match inside a longer name.
    expect(matches("Museum", "National History Museum")).toBe(false);
    expect(matches("Sofia University", "Alexander Nevsky Cathedral")).toBe(false);
  });

  it("drops brackets and cuts a long sentence at a word", () => {
    expect(tidy("The Alexander Nevsky Cathedral (Bulgarian: Катедрален храм [ˈxram]) is a cathedral in Sofia .")).toBe("The Alexander Nevsky Cathedral is a cathedral in Sofia.");
    const long = tidy(`The ${"very ".repeat(80)}old tower.`);
    expect(long.length).toBeLessThanOrEqual(MAX_CHARS + 1);
    expect(long.endsWith("very…")).toBe(true);
  });

  it("picks the nearest article that names the sight, or none", () => {
    const data = answer(
      { title: "Sofia University", extract: "A university.", index: 1 },
      { title: "Alexander Nevsky Cathedral, Sofia", extract: "A cathedral (built 1912) in Sofia.", index: 2 },
    );
    expect(pick(data, "Alexander Nevsky Cathedral")).toBe("A cathedral in Sofia.");
    expect(pick(data, "National Gallery")).toBeNull();
    expect(pick({ batchcomplete: "" }, "National Gallery")).toBeNull();
    expect(pick(null, "National Gallery")).toBeNull();
    expect(pick(answer({ title: "National Gallery", index: 1 }), "National Gallery")).toBeNull();
  });

  it("keeps what he read and what has no article, and repairs a bad save", () => {
    const n = new SightNotes();
    n.noted("a");
    n.missed("b");
    expect(n.knows("a") && n.knows("b") && !n.knows("c")).toBe(true);
    for (let i = 0; i < NONE_KEEP + 5; i++) n.missed(`x${i}`);
    expect(n.none).toHaveLength(NONE_KEEP);
    expect(n.knows("b")).toBe(false);
    expect(SightNotes.fromJSON(JSON.parse(JSON.stringify(n.toJSON()))).read).toEqual(["a"]);
    expect(SightNotes.fromJSON(undefined).knows("a")).toBe(false);
    expect(SightNotes.fromJSON({ read: ["a", 3] as string[], none: "no" as unknown as string[] })).toMatchObject({ read: ["a"], none: [] });
  });

  it("says the note in the feed and makes him a little wiser", () => {
    const s = new Stats();
    const wit = s.attrs.wit;
    s.noteRead("k", "Alexander Nevsky Cathedral", "A cathedral in Sofia.");
    expect(s.history.entries.at(-1)?.text).toBe("📖 Read up on Alexander Nevsky Cathedral: A cathedral in Sofia.");
    expect(s.attrs.wit).toBeCloseTo(wit + NOTE_WIT, 6);
    expect(s.xp).toBe(NOTE_XP);
    expect(Stats.fromJSON(JSON.parse(JSON.stringify(s.toJSON()))).sightNotes.read).toEqual(["k"]);
  });
});
