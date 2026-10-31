// The street collector: which streets count, how they are kept, and when the feed counts them.
import { describe, expect, it } from "vitest";
import { Stats } from "../../src/core/stats";
import { STREET_MARK, StreetBook } from "../../src/core/streetBook";

describe("street collector", () => {
  it("keeps each named street once per city", () => {
    const b = new StreetBook();
    expect(b.walk("Sofia, Bulgaria", "Vitosha Blvd")).toBe(true);
    expect(b.walk("Sofia, Bulgaria", "Vitosha Blvd")).toBe(false);
    expect(b.walk("Sofia, Bulgaria", "")).toBe(false);
    expect(b.walk("", "Rue Cler")).toBe(false);
    expect(b.walk("Paris, France", "Vitosha Blvd")).toBe(true);
    expect(b.count("Sofia, Bulgaria")).toBe(1);
    expect(b.count("Rome, Italy")).toBe(0);
    expect(b.count()).toBe(2);
  });

  it("keeps the streets across a save, and repairs a bad one", () => {
    const b = new StreetBook();
    b.walk("Sofia, Bulgaria", "Vitosha Blvd");
    expect(StreetBook.fromJSON(JSON.parse(JSON.stringify(b.toJSON()))).cities).toEqual({ "Sofia, Bulgaria": ["Vitosha Blvd"] });
    expect(StreetBook.fromJSON(undefined).count()).toBe(0);
    expect(StreetBook.fromJSON({ cities: { a: ["x", "x", 3, ""] as string[], b: "no" as unknown as string[] } }).cities).toEqual({ a: ["x"] });
  });

  it("counts every STREET_MARK new streets in his city in the feed", () => {
    const s = new Stats();
    s.where = { city: "Sofia, Bulgaria", code: "BGR", country: "Bulgaria" };
    for (let i = 1; i < STREET_MARK; i++) s.streetAt(`Street ${i}`);
    s.streetAt("Street 1");
    expect(s.history.entries.some((e) => e.text.startsWith("🛣"))).toBe(false);
    s.streetAt(`Street ${STREET_MARK}`);
    expect(s.history.entries.at(-1)?.text).toBe(`🛣 Walked ${STREET_MARK} streets in Sofia`);
    expect(Stats.fromJSON(JSON.parse(JSON.stringify(s.toJSON()))).streets.count()).toBe(STREET_MARK);
  });
});
