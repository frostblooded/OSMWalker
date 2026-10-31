// Public holidays from Nager.Date: codes, the answer, and which day is one.
import { describe, expect, it } from "vitest";
import * as Holidays from "../../src/core/holidays";
import { iso2 } from "../../src/core/iso2";
import { dataFile } from "../support/data";

const answer = [
  { date: "2026-01-01", localName: "Нова година", name: "New Year's Day", countryCode: "BG", global: true, types: ["Public"] },
  { date: "2026-03-03", localName: "Ден на Освобождението", name: "Liberation Day", countryCode: "BG", global: true, types: ["Public"] },
  { date: "2026-05-24", localName: "Регионален", name: "Regional day", countryCode: "BG", global: false, types: ["Public"] },
  { date: "2026-06-01", localName: "Банков", name: "Bank day", countryCode: "BG", global: true, types: ["Bank"] },
];

describe("holidays", () => {
  it("turn the game's three-letter codes into two-letter ones", () => {
    expect(iso2("BGR")).toBe("BG");
    expect(iso2("ABW")).toBe("AW");
    expect(iso2("KOS")).toBe("XK");
    expect(iso2("XXX")).toBe("");
    expect(Holidays.url(2026, "BG")).toBe("https://date.nager.at/api/v3/PublicHolidays/2026/BG");
  });

  it("know a two-letter code for every country in cities.tsv", () => {
    const codes = new Set(dataFile("cities.tsv").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.split("\t")[1]!));
    // Northern Cyprus and Somaliland have no code of their own, and the Republic's or Somalia's holidays are not theirs.
    expect([...codes].filter((c) => !/^[A-Z]{2}$/.test(iso2(c)))).toEqual(["CYN", "SOL"]);
  });

  it("keep only country-wide public holidays", () => {
    expect(Holidays.parse(answer)?.map((h) => h.name)).toEqual(["New Year's Day", "Liberation Day"]);
    expect(Holidays.parse({ status: 404 })).toBeNull();
    expect(Holidays.parse([])).toEqual([]);
  });

  it("find the holiday on the local day there", () => {
    const list = Holidays.parse(answer)!;
    const lateMarch2 = Date.UTC(2026, 2, 2, 23, 30); // 01:30 on 3 March in Sofia (UTC+2)
    expect(Holidays.on(list, lateMarch2, 2 * 3600)?.name).toBe("Liberation Day");
    expect(Holidays.on(list, lateMarch2, 0)).toBeNull();
    expect(Holidays.dayOf(Date.UTC(2026, 0, 1, 12), -5 * 3600)).toBe("2026-01-01");
  });
});
