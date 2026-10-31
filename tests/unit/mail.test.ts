// Letters and gifts from his friends: alone, the data file, and through Stats.
import { describe, expect, it } from "vitest";
import type { Friend } from "../../src/core/friends";
import { isNote } from "../../src/core/bond";
import * as M from "../../src/core/mail";
import type { Rng } from "../../src/core/rng";
import * as Sp from "../../src/core/spot";
import { FX_KEYS, Stats } from "../../src/core/stats";
import { dataFile } from "../support/data";

const DATA = JSON.parse(dataFile("mail.json")) as M.MailData;
const SOFIA = "Sofia, Bulgaria";
const PORTO = "Porto, Portugal";
const T0 = Date.UTC(2026, 9, 29, 12) / 1000;
const friend = (name: string, city: string, hearts: number): Friend => ({ id: `${city}|${name}`, name, icon: "🧑", city, kind: "cafe", place: { name: "Cafe Luz", lat: 1, lon: 2 }, hearts, met: 0, seen: 0 });
/** Dice that always roll `r`. */
const fixed = (r: number) => ({ randf: () => r, pick: <T>(l: readonly T[]) => l[0]! }) as unknown as Rng;

describe("mail data", () => {
  it("letters use only {NAME}, {PLACE} and {CITY}; gifts change only known stats", () => {
    for (const l of DATA.letters) for (const [, k] of l.matchAll(/\{(\w+)\}/g)) expect(["NAME", "PLACE", "CITY"]).toContain(k);
    for (const g of DATA.gifts) for (const k of Object.keys(g.fx)) expect(FX_KEYS as readonly string[]).toContain(k);
  });
});

describe("mailbox", () => {
  it("a friend elsewhere with LETTER_AT hearts may write about where they met", () => {
    const m = new M.Mailbox();
    expect(m.day(T0, SOFIA, [friend("Ana", PORTO, M.LETTER_AT - 1)], "", [], DATA, fixed(0))).toEqual([]);
    expect(m.day(T0, PORTO, [friend("Ana", PORTO, M.LETTER_AT)], "", [], DATA, fixed(0))).toEqual([]); // she is right there
    expect(m.day(T0, SOFIA, [friend("Ana", PORTO, M.LETTER_AT)], "", [], DATA, fixed(M.LETTER_CHANCE))).toEqual([]);
    expect(m.day(T0, SOFIA, [friend("Ana", PORTO, M.LETTER_AT)], "", [], DATA, fixed(0))).toEqual(["💌 A letter from Ana in Porto"]);
    expect(m.letters[0]!.text).toContain("Cafe Luz");
    // A letter is no deed of his to praise or scold.
    expect(isNote("💌 A letter from Ana in Porto")).toBe(true);
  });

  it("never from his partner, who is with him", () => {
    const m = new M.Mailbox();
    const her = friend("Ana", PORTO, 10);
    expect(m.day(T0, SOFIA, [her], her.id, [PORTO], DATA, fixed(0))).toEqual([]);
    expect(m.waiting).toEqual([]);
  });

  it("keeps KEEP_LETTERS letters", () => {
    const m = new M.Mailbox();
    for (let i = 0; i < M.KEEP_LETTERS + 3; i++) m.day(T0 + i, SOFIA, [friend("Ana", PORTO, 5)], "", [], DATA, fixed(0));
    expect(m.letters).toHaveLength(M.KEEP_LETTERS);
  });

  it("a friend with GIFT_AT hearts in a city with his spot may leave one gift there, picked up once", () => {
    const m = new M.Mailbox();
    m.day(T0, SOFIA, [friend("Ana", PORTO, M.GIFT_AT)], "", [], DATA, fixed(0));
    expect(m.waiting).toEqual([]);
    m.day(T0, SOFIA, [friend("Ana", PORTO, M.GIFT_AT)], "", [PORTO], DATA, fixed(0));
    m.day(T0, SOFIA, [friend("Ana", PORTO, M.GIFT_AT)], "", [PORTO], DATA, fixed(0));
    expect(m.waiting).toEqual([{ from: "Ana", city: PORTO, gift: DATA.gifts[0] }]);
    expect(m.pickUp(SOFIA)).toBeNull();
    expect(m.pickUp(PORTO)?.from).toBe("Ana");
    expect(m.pickUp(PORTO)).toBeNull();
  });

  it("survives a save", () => {
    const m = new M.Mailbox();
    m.day(T0, SOFIA, [friend("Ana", PORTO, 5)], "", [PORTO], DATA, fixed(0));
    expect(M.Mailbox.fromJSON(JSON.parse(JSON.stringify(m))).toJSON()).toEqual(m.toJSON());
  });
});

describe("through Stats", () => {
  it("letters come on a new local day, and a gift is found at his spot", () => {
    let t = T0;
    const s = new Stats();
    s.now = () => t;
    s.mailData = { ...DATA, gifts: [{ name: "cake", icon: "🍰", fx: { fullness: 30 }, line: "A slice of cake" }] };
    s.where = { city: SOFIA, code: "BGR", country: "Bulgaria" };
    const cafe = { name: "Cafe A", class: "cafe", lat: 1, lon: 2 };
    for (let i = 0; i < Sp.SPOT_MIN; i++) s.visit(cafe);
    s.friends.list = [friend("Ana", PORTO, 5), friend("Bo", SOFIA, 5)];
    s.passTime(1, 0);
    for (let day = 1; day < 60 && !(s.mail.waiting.length && s.mail.letters.length); day++) {
      t += 86400;
      s.passTime(1, 0);
    }
    expect(s.mail.letters.length).toBeGreaterThan(0);
    expect(s.mail.waiting[0]?.from).toBe("Bo");
    s.meters.fullness = 10;
    s.visit(cafe);
    expect(s.meters.fullness).toBe(40);
    expect(s.history.entries.at(-1)!.text).toBe("🍰 Found a gift at Cafe A from Bo: a slice of cake");
    expect(s.mail.waiting).toEqual([]);
  });
});
