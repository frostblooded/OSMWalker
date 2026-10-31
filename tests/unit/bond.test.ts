// His bond with you: trust, letters, whispers, praise or scold, and what his lean changes.
import { describe, expect, it } from "vitest";
import * as B from "../../src/core/bond";
import { anyUrgent, needOf, exploreWeight, EXPLORE_PULL, weight } from "../../src/core/activities";
import { GIFTS } from "../../src/core/gifts";
import { Rng } from "../../src/core/rng";
import { Stats } from "../../src/core/stats";
import { dataFile } from "../support/data";

const LETTERS = JSON.parse(dataFile("letters.json")) as B.Letters;
const DAY = 86400;
/** A Rng whose next randf() is `r`. */
const fixed = (r: number) => ({ randf: () => r }) as Rng;

describe("trust", () => {
  it("tells his letters and your whispers from his deeds", () => {
    expect(B.isNote(B.letter(LETTERS, 0, 0))).toBe(true);
    expect(B.isNote(B.whisperLine("eat", true))).toBe(true);
    expect(B.isNote(B.whisperLine("rest", false))).toBe(true);
    expect(B.isNote(`${B.FRIEND_LETTER_MARK} A letter from Ana in Sofia: "Hi"`)).toBe(true);
    expect(B.isNote("Had a coffee at Cafe Near")).toBe(false);
  });

  it("rises with check-ins and care packages, and stays within 0-100", () => {
    const b = new B.Bond();
    expect(b.trust).toBe(B.TRUST_START);
    b.checkIn(1000, true);
    expect(b.trust).toBe(B.TRUST_START + B.TRUST_PER_CHECKIN);
    b.checkIn(2000, false);
    expect(b.trust).toBe(B.TRUST_START + B.TRUST_PER_CHECKIN);
    b.addTrust(500);
    expect(b.trust).toBe(100);
  });

  it("fades a little for whole days away after the first, never sharply", () => {
    const b = new B.Bond();
    b.trust = 50;
    b.checkIn(1.5 * DAY, false);
    expect(b.trust).toBe(50);
    b.checkIn(3.5 * DAY, false);
    expect(b.trust).toBe(50 - 2 * B.TRUST_FADE_PER_DAY);
    b.checkIn(60 * DAY, false);
    expect(b.trust).toBe(50 - 2 * B.TRUST_FADE_PER_DAY - B.TRUST_FADE_MAX);
  });

  it("says which letter step it crossed going up", () => {
    const b = new B.Bond();
    b.trust = B.LETTER_AT[0] - 1;
    expect(b.addTrust(2)).toBe(0);
    expect(b.addTrust(1)).toBe(-1);
    b.trust = 0;
    expect(b.addTrust(100)).toBe(B.LETTER_AT.length - 1);
  });

  it("he writes to you when trust crosses a step, and may thank you for a package", () => {
    const s = new Stats();
    s.letters = LETTERS;
    s.bond.trust = B.LETTER_AT[0] - 1;
    s.care.clovers = 1;
    s.care.send("snack");
    s.care.open(s);
    const letters = s.history.entries.filter((e) => e.text.startsWith("✉"));
    expect(letters).toHaveLength(1);
    expect(LETTERS.tiers[0]!.map((l) => `✉ ${l}`)).toContain(letters[0]!.text);
    // Without letters loaded he still gains trust, but writes nothing.
    const quiet = new Stats();
    quiet.bond.trust = B.LETTER_AT[0] - 1;
    quiet.gifted("snack");
    expect(quiet.bond.trust).toBe(B.LETTER_AT[0] - 1 + B.TRUST_PER_GIFT);
    expect(quiet.history.entries).toHaveLength(0);
  });

  it("has a letter for every step and a thank-you for every gift", () => {
    expect(LETTERS.tiers).toHaveLength(B.LETTER_AT.length);
    for (const t of LETTERS.tiers) expect(t.length).toBeGreaterThan(0);
    for (const g of GIFTS) expect(LETTERS.thanks[g.id], g.id).toBeTruthy();
  });

  it("thanks you for some packages, not all", () => {
    let thanked = 0;
    for (let i = 0; i < 300; i++) {
      const s = new Stats();
      s.letters = LETTERS;
      s.now = () => 1_800_000_000 + i * 977;
      s.gifted("umbrella");
      if (s.history.entries.length) thanked++;
    }
    expect(thanked / 300).toBeGreaterThan(B.THANKS_CHANCE - 0.12);
    expect(thanked / 300).toBeLessThan(B.THANKS_CHANCE + 0.12);
  });
});

describe("whispers", () => {
  it("up to WHISPERS_PER_DAY a day, heeded by trust", () => {
    const b = new B.Bond();
    b.trust = 0;
    expect(b.whisper("eat", "d1", fixed(B.HEED_MIN - 0.01))).toBe(true);
    expect(b.nudge).toBe("eat");
    expect(b.whisper("rest", "d1", fixed(B.HEED_MIN + 0.01))).toBe(false);
    expect(b.nudge).toBe("eat");
    b.trust = 100;
    expect(b.whisper("rest", "d1", fixed(B.HEED_MIN + 0.01))).toBe(true);
    expect(b.whisper("rest", "d1", fixed(0))).toBeNull();
    expect(b.whispersLeft("d2")).toBe(B.WHISPERS_PER_DAY);
  });

  it("a heeded whisper wears off after NUDGE_MIN", () => {
    const s = new Stats();
    s.bond.whisper("rest", "d", fixed(0));
    s.passTime(B.NUDGE_MIN - 1, 0);
    expect(s.bond.nudge).toBe("rest");
    s.passTime(2, 0);
    expect(s.bond.nudge).toBe("");
  });

  it("eat and rest make that need feel empty, save makes him save, explore pulls to new places", () => {
    const s = new Stats();
    const food = [{ name: "Eat", min: 5, fx: { fullness: 30 } }];
    const before = needOf(food, s, 12);
    expect(before.bottom).toBe(false);
    s.bond.whisper("eat", "d", fixed(0));
    expect(needOf(food, s, 12)).toMatchObject({ urgent: true, bottom: true });
    expect(needOf(food, s, 12).pull).toBeGreaterThan(before.pull);
    expect(anyUrgent(s)).toBe(true);
    s.bond.nudge = "rest";
    expect(s.felt("energy")).toBe(0);
    expect(s.felt("fullness")).toBe(s.meters.fullness);
    s.bond.nudge = "save";
    expect(s.saving()).toBe(true);
    const place = { name: "Cafe", class: "cafe", subclass: "cafe", rank: 1, lat: 1, lon: 1 };
    s.bond.nudge = "explore";
    expect(exploreWeight(place, s)).toBe(EXPLORE_PULL);
    s.visit(place);
    expect(exploreWeight(place, s)).toBe(1);
  });
});

describe("kind or rascal", () => {
  it("praise and scold move his lean once per line; his deeds move it too", () => {
    const b = new B.Bond();
    expect(b.judge(1, 10)).toBe(true);
    expect(b.judge(1, 10)).toBe(false);
    expect(b.lean).toBe(B.JUDGE_STEP);
    expect(b.judge(-1, 11)).toBe(true);
    expect(b.lean).toBe(0);
    const s = new Stats();
    s.do({ name: "Pick up litter", min: 5, deed: 1 }, "", new Rng(1));
    expect(s.bond.lean).toBe(B.DEED_STEP);
    for (let i = 0; i < 100; i++) s.do({ name: "Haggle", min: 5, deed: -1 }, "", new Rng(1));
    expect(s.bond.lean).toBe(-B.LEAN_MAX);
    expect(s.bond.leaning()).toBe("rascal");
  });

  it("a kind walker picks kind deeds more often", () => {
    const s = new Stats();
    const kind = { name: "Help", min: 5, deed: 1 };
    const before = weight(kind, s);
    s.bond.lean = B.LEAN_AT;
    expect(weight(kind, s)).toBe(before + B.KIND_DEED_WEIGHT);
  });

  it("a rascal sells for more, and sometimes rides the bus without a ticket", () => {
    const s = new Stats();
    const item = { name: "Cup", slot: "weapon" as const, stats: {}, rarity: "Common" as const, price: 1000 };
    const plain = s.sellPrice(item);
    s.bond.lean = -B.LEAN_AT;
    expect(s.sellPrice(item)).toBe(Math.round(plain * B.RASCAL_SELL));
    let dodged = 0;
    let fined = 0;
    for (let i = 0; i < 400; i++) {
      s.cents = 10_000;
      s.now = () => i;
      s.ride(500, "bus", "Central", "Plovdiv");
      const paid = 10_000 - s.cents;
      if (paid === 0) dodged++;
      if (paid === 1000) fined++;
      expect([0, 500, 1000]).toContain(paid);
    }
    expect(dodged / 400).toBeGreaterThan(B.DODGE_CHANCE * (1 - B.CAUGHT_CHANCE) - 0.07);
    expect(fined).toBeGreaterThan(0);
    // Never on a plane, and never when he isn't a rascal.
    const paid = (mode: string, i: number) => {
      s.cents = 10_000;
      s.now = () => i;
      s.ride(500, mode, "x", "y");
      return 10_000 - s.cents;
    };
    for (let i = 0; i < 50; i++) expect(paid("plane", i)).toBe(500);
    s.bond.lean = 0;
    for (let i = 0; i < 50; i++) expect(paid("bus", i)).toBe(500);
  });

  it("says in the ride line when he skipped the ticket or was fined", () => {
    const s = new Stats();
    expect(s.ride(500, "bus", "Central", "Plovdiv, Bulgaria")).toBe("Took the bus to Plovdiv, Bulgaria from Central (-€5)");
    expect(s.ride(500, "car", "Shell", "Plovdiv, Bulgaria")).toBe("Filled up and drove to Plovdiv, Bulgaria from Shell (-€5)");
    s.bond.lean = -B.LEAN_MAX;
    const lines = new Set<string>();
    for (let i = 0; i < 200; i++) {
      s.cents = 10_000;
      s.now = () => i;
      lines.add(s.ride(500, "bus", "Central", "Plovdiv"));
    }
    expect(lines).toContain("Took the bus to Plovdiv from Central without a ticket");
    expect(lines).toContain("Took the bus to Plovdiv from Central without a ticket, got caught and was fined (-€10)");
  });

  it("a fine never takes more than he has", () => {
    const s = new Stats();
    s.bond.lean = -B.LEAN_MAX;
    for (let i = 0; i < 400; i++) {
      s.cents = 600;
      s.now = () => i;
      s.ride(500, "bus", "k", "y");
      expect(s.cents).toBeGreaterThanOrEqual(0);
    }
  });

  it("deeds in the data are kind (+1) or rascal (-1), and both kinds exist", () => {
    const actions = Object.values(JSON.parse(dataFile("actions.json")) as Record<string, { deed?: number }[]>).flat();
    const deeds = actions.filter((a) => a.deed !== undefined).map((a) => a.deed);
    for (const d of deeds) expect([1, -1]).toContain(d);
    expect(deeds).toContain(1);
    expect(deeds).toContain(-1);
  });
});
