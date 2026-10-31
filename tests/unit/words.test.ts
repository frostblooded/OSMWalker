// Local words: what he learns where, how it is kept, and the word list itself.
import { describe, expect, it } from "vitest";
import { Stats } from "../../src/core/stats";
import { LEARN_CHANCE, WORD_WIT, WORD_XP, Words, type WordBook } from "../../src/core/words";
import { dataFile } from "../support/data";

const BOOK: WordBook = {
  at: { coffee: ["cafe"], bread: ["bakery"] },
  languages: { bg: { name: "Bulgarian", words: [["здравей (zdravey)", "hello"], ["кафе (kafe)", "coffee"], ["хляб (hlyab)", "bread"], ["моля (molya)", "please"]] } },
  countries: { BGR: "bg" },
};

describe("local words", () => {
  it("learns a word that fits the place first, then one for anywhere, each once", () => {
    const w = new Words();
    expect(w.learn(BOOK, "BGR", "cafe", 0)).toEqual({ language: "Bulgarian", word: "кафе (kafe)", meaning: "coffee" });
    expect(w.learn(BOOK, "BGR", "cafe", 0)?.meaning).toBe("hello");
    expect(w.learn(BOOK, "BGR", "cafe", 0)?.meaning).toBe("please");
    // Only bread is left, and it is learned at bakeries only.
    expect(w.learn(BOOK, "BGR", "cafe", 0)).toBeNull();
    expect(w.learn(BOOK, "BGR", "bakery", 0)?.meaning).toBe("bread");
    expect(w.known).toEqual({ bg: ["coffee", "hello", "please", "bread"] });
    expect(w.count()).toBe(4);
  });

  it("learns now and then, and only where the country has a language", () => {
    const w = new Words();
    expect(w.learn(BOOK, "BGR", "cafe", LEARN_CHANCE)).toBeNull();
    expect(w.learn(BOOK, "FRA", "cafe", 0)).toBeNull();
    expect(w.count()).toBe(0);
  });

  it("keeps what he learned across a save, and repairs a bad one", () => {
    const w = new Words();
    w.learn(BOOK, "BGR", "cafe", 0);
    expect(Words.fromJSON(JSON.parse(JSON.stringify(w.toJSON()))).known).toEqual({ bg: ["coffee"] });
    expect(Words.fromJSON(undefined).count()).toBe(0);
    expect(Words.fromJSON({ known: { bg: ["hello", 5] as string[], x: "no" as unknown as string[] } }).known).toEqual({ bg: ["hello"] });
  });

  it("says the word in the feed and makes him a little wiser, on its own dice", () => {
    const s = new Stats();
    s.wordBook = BOOK;
    s.where = { city: "Sofia", code: "BGR", country: "Bulgaria" };
    const wit = s.attrs.wit;
    // Its own dice are seeded from the time and place, so some minute brings a word.
    for (let t = 0; t < 200 && s.words.count() === 0; t++) {
      s.now = () => t * 60;
      s.wordAt({ class: "cafe", name: "Cafe Near" });
    }
    expect(s.history.entries.at(-1)?.text).toBe('🗣 Learned a Bulgarian word at Cafe Near: "кафе (kafe)" means coffee');
    expect(s.attrs.wit).toBeCloseTo(wit + WORD_WIT, 6);
    expect(s.xp).toBe(WORD_XP);
    expect(Stats.fromJSON(JSON.parse(JSON.stringify(s.toJSON()))).words.known).toEqual({ bg: ["coffee"] });
  });

  it("the word list: every country is in cities.tsv, every place is a map kind, no meaning twice", () => {
    const book = JSON.parse(dataFile("words.json")) as WordBook;
    const codes = new Set(dataFile("cities.tsv").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.split("\t")[1]!));
    const kinds = new Set(Object.keys(JSON.parse(dataFile("actions.json"))));
    for (const [code, lang] of Object.entries(book.countries)) {
      expect(codes.has(code), code).toBe(true);
      expect(book.languages[lang], code).toBeDefined();
    }
    for (const [m, at] of Object.entries(book.at)) for (const k of at) expect(kinds.has(k), `${m}: ${k}`).toBe(true);
    for (const [key, lang] of Object.entries(book.languages)) {
      const meanings = lang.words.map(([, m]) => m);
      expect(new Set(meanings).size, key).toBe(meanings.length);
      expect(lang.words.every(([w]) => w.length > 0), key).toBe(true);
    }
  });
});
