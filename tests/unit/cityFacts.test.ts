// City trivia from Wikidata: the query and the actions made from its answer.
import { describe, expect, it } from "vitest";
import * as CityFacts from "../../src/core/cityFacts";

const row = (fields: Record<string, string>): CityFacts.Row => {
  const r: CityFacts.Row = { city: { value: "http://www.wikidata.org/entity/Q472" }, cityLabel: { value: "Sofia" } };
  for (const [k, v] of Object.entries(fields)) r[k] = { value: v };
  return r;
};
const names = (rows: CityFacts.Row[]) => CityFacts.actions(rows).map((a) => a.name);

describe("city facts", () => {
  it("query around the city centre", () => {
    const q = CityFacts.query(42.6977, 23.3219);
    expect(q).toContain("Point(23.3219 42.6977)");
    expect(q).toContain("wdt:P1082");
    expect(CityFacts.url(42.6977, 23.3219)).toContain("https://query.wikidata.org/sparql?format=json&query=");
  });

  it("become trivia actions without repeats", () => {
    const base = { inception: "-0700-01-01T00:00:00Z", pop: "1286383", elev: "550", namedLabel: "Hagia Sophia", capLabel: "Bulgaria" };
    const got = names([row({ ...base, twinLabel: "Bratislava" }), row({ ...base, twinLabel: "Kyiv" })]);
    expect(got).toEqual(
      expect.arrayContaining([
        "Learn that Sofia was founded in 700 BC",
        "Read that about 1,290,000 people live in Sofia",
        "Notice Sofia sits 550 m above the sea",
        "Find a signpost to Sofia's twin town Bratislava",
        "Find a signpost to Sofia's twin town Kyiv",
        "Learn that Sofia is named after Hagia Sophia",
        "Remember that Sofia is the capital of Bulgaria",
      ]),
    );
    expect(got).toHaveLength(7);
  });

  it("are quick and teach a little", () => {
    for (const a of CityFacts.actions([row({ inception: "1701-05-01T00:00:00Z" })])) {
      expect(a.name).toBe("Learn that Sofia was founded in 1701");
      expect(a.min).toBeLessThanOrEqual(10);
      expect(a.fx!.wit).toBeGreaterThan(0);
      expect(a.fx!.xp).toBeGreaterThan(0);
    }
  });

  it("cap twin towns", () => {
    expect(CityFacts.actions(Array.from({ length: 20 }, (_, i) => row({ twinLabel: `Town ${i}` })))).toHaveLength(CityFacts.MAX_TWINS);
  });

  it("give nothing for unlabelled items or empty answers", () => {
    expect(CityFacts.actions([])).toEqual([]);
    expect(CityFacts.actions([row({ twinLabel: "Q12345" })])).toEqual([]);
  });
});
