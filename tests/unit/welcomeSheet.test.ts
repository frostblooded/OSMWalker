// @vitest-environment happy-dom
// The welcome-back card: the time away and the boost it earned, the clover only when earned, and its dilemma bar starts when shown.
import { h, render } from "preact";
import { describe, expect, it } from "vitest";
import type { Dilemma } from "../../src/core/dilemmas";
import { BOOST } from "../../src/core/boost";
import { Week } from "../../src/core/week";
import { WelcomeSheet } from "../../src/ui/WelcomeSheet";

const shown = (o: { clover?: boolean; dilemma?: Dilemma | null; onShown?: () => number } = {}) => {
  const root = document.createElement("div");
  render(h(WelcomeSheet, { awayS: 8 * 3600, boostS: (8 * 3600) / 9, clover: o.clover ?? false, week: new Week(), dilemma: o.dilemma ?? null, dilemmaS: Infinity, onChoose: () => {}, onShown: o.onShown ?? (() => 0), onDone: () => {} }), root);
  return root;
};

describe("welcome-back card", () => {
  it("says how long you were away and how long he runs 10x, and the clover only when earned", () => {
    const text = shown().textContent ?? "";
    expect(text).toContain("Time away8 h");
    expect(text).toContain(`⏩ ${BOOST}× speed for53 min`);
    expect(text).not.toContain("Clover");
    expect(shown({ clover: true }).textContent).toContain("☘ Clover for checking in+1");
  });

  it("starts the dilemma's bar when the card shows, not before (its time is unknown until then)", () => {
    const dilemma = { id: "bread", city: null, icon: "🥖", ask: "Bread?", labels: ["Yes", "No"], picked: null, by: null, said: "" } as unknown as Dilemma;
    const root = shown({ dilemma, onShown: () => 5 });
    expect(root.querySelector<HTMLElement>(".moment-time > div")!.style.animationDuration).toBe("5s");
    expect(root.querySelector(".moment-time")!.getAttribute("aria-label")).toBe("5 seconds to choose");
  });
});
