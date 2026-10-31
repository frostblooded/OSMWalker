// Chance cards at work (src/core/workCards.ts): he picks by himself, the bold choice can go either way, and Stats draws one after a paid job.
import { describe, expect, it } from "vitest";
import type { Rng } from "../../src/core/rng";
import { Stats, type Action } from "../../src/core/stats";
import * as W from "../../src/core/workCards";

/** Rolls from `rolls` in turn; picks take card `card`. */
const fixed = (card: number, ...rolls: number[]) => ({ randf: () => rolls.shift() ?? 0, pick: <T>(l: readonly T[]) => l[card]! }) as unknown as Rng;
const DOUBLE = W.CARDS.findIndex((c) => c.id === "double");
const TILL = W.CARDS.findIndex((c) => c.id === "till");

describe("work chance cards", () => {
  it("has cards with unique ids and both choices", () => {
    expect(new Set(W.CARDS.map((c) => c.id)).size).toBe(W.CARDS.length);
    expect(W.CARDS.length).toBeGreaterThanOrEqual(6);
    expect(W.helpList().split("\n")).toHaveLength(W.CARDS.length);
  });

  it(`comes after ${W.CARD_CHANCE} of paid jobs, never an unpaid one`, () => {
    const s = new Stats();
    expect(W.draw(s, 0, fixed(DOUBLE, 0))).toBe("");
    expect(W.draw(s, 1000, fixed(DOUBLE, W.CARD_CHANCE))).toBe("");
  });

  it("takes the bold choice, which works out with his attribute: the double shift pays a second wage", () => {
    const s = new Stats();
    s.cents = 0;
    s.meters.energy = 100;
    expect(W.draw(s, 1000, fixed(DOUBLE, 0, 0, 0))).toBe("⏱ At work: The boss asks him to cover a double shift. Take it: he worked the double and got paid for it (+€10, -25 energy, +20 XP)");
    expect(s.cents).toBe(1000);
    expect(s.meters.energy).toBe(75);
  });

  it("can go wrong, and docks no more than he has", () => {
    const s = new Stats();
    s.cents = 200;
    expect(W.draw(s, 1000, fixed(TILL, 0, 0, 0.99))).toMatch(/got caught and was docked \(-€2\b/);
    expect(s.cents).toBe(0);
    expect(s.bond.toJSON()).not.toEqual(new Stats().bond.toJSON());
  });

  it("plays safe more often with a low attribute, and leans bold as it grows", () => {
    const s = new Stats();
    expect(W.draw(s, 1000, fixed(DOUBLE, 0, 0.5))).toMatch(/Go home: he went home on time/);
    s.attrs.str = 5;
    expect(W.draw(s, 1000, fixed(DOUBLE, 0, 0.5))).toMatch(/Take it/);
    expect(W.winChance(100)).toBe(W.WIN_MAX);
  });

  it("follows a paid job in his stats with its own dice", () => {
    const s = new Stats();
    s.now = () => 0;
    const job: Action = { name: "Worked a shift", min: 60, earn: 10 };
    const said: string[] = [];
    s.onSay = (l) => said.push(l);
    // Dice from the time and place: find a time with a card.
    for (let t = 1; t < 200 && said.length < 2; t++) {
      said.length = 0;
      s.now = () => t;
      s.do(job, "Cafe", fixed(0, 0.99));
    }
    expect(said[0]).toMatch(/^Worked a shift at Cafe/);
    expect(said[1]).toMatch(/^\S+ At work: /);
  });

  it(`never follows a short paid action (under ${W.SHIFT_MIN} minutes) or a bet`, () => {
    const s = new Stats();
    const said: string[] = [];
    s.onSay = (l) => said.push(l);
    for (let t = 1; t < 200; t++) {
      s.now = () => t;
      s.do({ name: "Find a coin", min: 1, earn: 1 }, "ATM", fixed(0, 0.99));
      s.do({ name: "Arm-wrestling bet", min: W.SHIFT_MIN, earn: 15, risk: { p: 0 } }, "Bar", fixed(0, 0.99));
    }
    expect(said.filter((l) => l.includes(" At work: "))).toEqual([]);
  });
});
