// Postcards packed into a link and read back (src/core/postcard.ts).
import { describe, expect, it } from "vitest";
import { clean, decode, encode, NAME_MAX, POSTCARD_KEY, TEXT_MAX, title, type Postcard } from "../../src/core/postcard";

const card: Postcard = { from: "Ivan", city: "Kyoto, Japan", place: "Kinkaku-ji", level: 7, line: "Matcha at a tea house in Kyoto (-€6)" };

describe("postcards", () => {
  it("go into a link and come back the same", () => {
    const hash = encode(card);
    expect(hash.startsWith(POSTCARD_KEY)).toBe(true);
    expect(hash).toMatch(/^postcard=[A-Za-z0-9_-]+$/);
    expect(decode(`#${hash}`)).toEqual(card);
    expect(decode(hash)).toEqual(card);
  });

  it("read links sent before a field was dropped", () => {
    const old = { ...card, line: "Tea in Kyoto" };
    expect(decode(`#postcard=${btoa(JSON.stringify({ ...old, t: 1_800_000_000 }))}`)).toEqual(old);
  });

  it("keep accents and other scripts", () => {
    const c = { ...card, from: "Zoë", city: "Москва, Россия", place: "Café Пушкинъ" };
    expect(decode(encode(c))).toEqual(c);
  });

  it("stay well under 1 KB", () => {
    const big = { ...card, from: "x".repeat(99), city: "é".repeat(999), place: "y".repeat(999), line: "z".repeat(999) };
    expect(encode(big).length).toBeLessThan(1024);
  });

  it("ignore other links and broken ones", () => {
    expect(decode("")).toBeNull();
    expect(decode("#other=1")).toBeNull();
    expect(decode("#postcard=!!!")).toBeNull();
    expect(decode(`#postcard=${btoa("not json")}`)).toBeNull();
    expect(decode(`#postcard=${btoa(JSON.stringify({ from: "Ivan" }))}`)).toBeNull();
  });

  it("are cleaned: text cut, odd numbers fixed, unknown fields dropped", () => {
    const c = clean({ from: `  ${"n".repeat(50)} `, city: "Rome", place: 5, level: -3, line: "a\n\nb", t: "x", evil: "<script>" })!;
    expect(c).toEqual({ from: "n".repeat(NAME_MAX), city: "Rome", place: "", level: 1, line: "a b" });
    expect(clean({ city: "x".repeat(500) })!.city).toHaveLength(TEXT_MAX);
    expect(clean(null)).toBeNull();
  });

  it("have a title with the sender and the city alone", () => {
    expect(title(card)).toBe("A postcard from Ivan in Kyoto");
    expect(title({ ...card, from: "" })).toBe("A postcard from a friend in Kyoto");
  });
});
