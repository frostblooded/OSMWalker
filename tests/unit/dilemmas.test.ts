// One small choice on reopen, and his own pick when you don't make it (src/core/dilemmas.ts).
import { describe, expect, it } from "vitest";
import { CHESS_STAKE, chessWin, DILEMMA_AWAY_S, DILEMMA_CHANCE, DILEMMAS, helpList, hisPick, LEAN_CAP, rollDilemma, settle, type Dilemma } from "../../src/core/dilemmas";
import { Rng } from "../../src/core/rng";
import { Stats } from "../../src/core/stats";
import type { City } from "../../src/core/trips";

const VARNA: City = { name: "Varna", code: "BGR", country: "Bulgaria", lat: 43.2, lon: 27.9, pop: 330000 };
/** An Rng whose rolls come from `rolls` in turn, and whose ranges always pick their low end. */
const fixed = (...rolls: number[]) => ({ randf: () => rolls.shift() ?? 0, randiRange: (lo: number) => lo }) as unknown as Rng;
const open = (id: string, city: City | null = null): Dilemma => ({ id, city, icon: "", ask: "", labels: [], picked: null, by: null, said: "" });

describe("rolling a dilemma", () => {
  it("needs a long absence and a lucky roll", () => {
    expect(rollDilemma(DILEMMA_AWAY_S - 1, fixed(0), () => VARNA)).toBeNull();
    expect(rollDilemma(DILEMMA_AWAY_S, fixed(DILEMMA_CHANCE), () => VARNA)).toBeNull();
    expect(rollDilemma(DILEMMA_AWAY_S, fixed(0), () => VARNA)).toMatchObject({ id: DILEMMAS[0]!.id, city: VARNA, picked: null, by: null });
  });

  it("skips trip offers when there is no city to go to", () => {
    const d = rollDilemma(DILEMMA_AWAY_S, fixed(0), () => null)!;
    expect(DILEMMAS.find((k) => k.id === d.id)!.trip).toBeUndefined();
    expect(d.city).toBeNull();
  });

  it("asks with the city and sums filled in, and two choices", () => {
    const pick = (id: string) => ({ randf: () => 0, randiRange: () => DILEMMAS.findIndex((k) => k.id === id) }) as unknown as Rng;
    expect(rollDilemma(DILEMMA_AWAY_S, pick("trucker"), () => VARNA)).toMatchObject({ icon: "🚚", ask: "A trucker offers a free ride to Varna.", labels: ["Hop on", "Stay"] });
    expect(rollDilemma(DILEMMA_AWAY_S, pick("wallet"), () => VARNA)!.ask).toBe("He finds a wallet with €40 in it.");
    expect(rollDilemma(DILEMMA_AWAY_S, pick("chess"), () => VARNA)!.ask).toBe("A chess hustler bets €10 he can't beat him.");
    for (const k of DILEMMAS) expect(k.options).toHaveLength(2);
  });
});

describe("his own pick", () => {
  it("leans to going for it the higher his attribute", () => {
    const s = new Stats();
    const share = (wit: number) => {
      s.attrs.wit = wit;
      const rng = new Rng(4);
      let go = 0;
      for (let i = 0; i < 2000; i++) if (hisPick(open("wallet"), s, rng) === 0) go++;
      return go / 2000;
    };
    expect(share(1)).toBeCloseTo(0.5, 1);
    expect(share(30)).toBeCloseTo(0.5 + LEAN_CAP, 1);
    // Wits under 1 (dirt cuts Charm, say) never tilt him the other way.
    expect(share(-3)).toBeCloseTo(0.5, 1);
  });
});

describe("settling", () => {
  it("applies your pick and says it", () => {
    const s = new Stats();
    const cents = s.cents;
    const mood = s.meters.mood;
    settle(open("wallet"), 1, "you", s, new Rng(1));
    expect(s.cents).toBe(cents + 4000);
    expect(s.meters.mood).toBe(mood - 10);
    expect(s.history.latest()).toBe("Kept a wallet he found (+€40)");
  });

  it("marks his own pick and fills in the city", () => {
    const s = new Stats();
    const d = open("trucker", VARNA);
    const o = settle(d, 0, "him", s, new Rng(1));
    expect(o.trip).toBe(true);
    expect(d).toMatchObject({ picked: 0, by: "him", said: "Decided by himself: Hopped on a trucker's free ride to Varna" });
  });

  it("plays chess for the stake, won or lost by Wits", () => {
    const s = new Stats();
    const cents = s.cents;
    settle(open("chess"), 0, "you", s, fixed(0));
    expect(s.cents).toBe(cents + CHESS_STAKE);
    expect(s.history.latest()).toBe("Played a chess hustler for €10 and won (+€10)");
    settle(open("chess"), 0, "you", s, fixed(0.99));
    expect(s.cents).toBe(cents);
    expect(s.history.latest()).toContain("and lost (-€10)");
    expect(chessWin(1)).toBeLessThan(chessWin(10));
  });

  it("can give a boost for a few hours", () => {
    const s = new Stats();
    settle(open("gym"), 0, "you", s, new Rng(1));
    expect(s.attr("str")).toBe(2);
    expect(s.buffNames()).toContain("Pumped");
  });

  it("are listed for Help with what each option does", () => {
    const lines = helpList().split("\n");
    expect(lines).toHaveLength(DILEMMAS.length);
    expect(lines[0]).toBe("- 🚚 A trucker offers a free ride to another city. Hop on (a free ride there) or Stay (+5 mood). He leans on Strength.");
    expect(helpList()).toContain("Keep it (+€40, -10 mood)");
    expect(helpList()).toContain("Play (+25 XP, win or lose €10, better odds with more Wits)");
    expect(helpList()).toContain("Pass (nothing)");
  });
});
