// Sketches that remember (src/core/sketches.ts): quality by art skill and inspiration, a subject from his History, the sketchbook keeping the best and selling the rest, and how Stats runs it.
import { describe, expect, it } from "vitest";
import { FEATS } from "../../src/core/collection";
import { Rng } from "../../src/core/rng";
import * as Sc from "../../src/core/sketches";
import * as Sk from "../../src/core/skills";
import { Stats, type Action } from "../../src/core/stats";
import { dataFile } from "../support/data";

const ACTIONS = JSON.parse(dataFile("actions.json")) as Record<string, Action[]>;
const act = (key: string, name: string) => ACTIONS[key]!.find((a) => a.name === name)!;
const sketch = (q: Sc.Quality, t: number): Sc.Sketch => ({ of: `line ${t}`, q, t });

describe("a sketch's quality", () => {
  it("rolls three grades wide, lifted by his art level and by being Inspired", () => {
    expect([0, 0.4, 0.99].map((r) => Sc.quality(0, false, r))).toEqual(["awful", "poor", "decent"]);
    expect(Sc.quality(0, true, 0)).toBe("poor");
    expect(Sc.quality(Sk.SKILL_MAX, false, 0)).toBe("fine");
    expect(Sc.quality(Sk.SKILL_MAX, true, 0.99)).toBe("masterwork");
  });
});

describe("a sketch's subject", () => {
  it("is one of his last History lines, never a sketch", () => {
    const lines = ["Old line", ...Array.from({ length: Sc.LOOK_BACK - 1 }, (_, i) => `Line ${i}`), `${Sc.ICON} Sketched "x": fine, kept it`];
    for (let i = 0; i < 50; i++) {
      const s = Sc.subject(lines, new Rng(i))!;
      expect(s).toMatch(/^Line \d+$/);
    }
    expect(Sc.subject([], new Rng(1))).toBeNull();
  });
});

describe("the sketchbook", () => {
  it("keeps KEPT sketches, then trades its worst (oldest first) for a better one and sells the loser", () => {
    const b = new Sc.Sketchbook();
    for (let i = 0; i < Sc.KEPT; i++) expect(b.add(sketch(i < 2 ? "poor" : "fine", i))).toBeNull();
    const worse = sketch("awful", 100);
    expect(b.add(worse)).toBe(worse);
    expect(b.add(sketch("excellent", 101))?.t).toBe(0);
    expect(b.kept.map((s) => s.t)).not.toContain(0);
    expect(b.best()[0]?.q).toBe("excellent");
    expect(b.made).toBe(Sc.KEPT + 2);
  });

  it("round-trips through JSON, and an old save starts empty", () => {
    const b = new Sc.Sketchbook();
    b.add(sketch("masterwork", 1));
    expect(Sc.Sketchbook.fromJSON(JSON.parse(JSON.stringify(b))).toJSON()).toEqual(b.toJSON());
    const old = JSON.parse(JSON.stringify(new Stats()));
    delete old.sketches;
    expect(Stats.fromJSON(old).sketches.toJSON()).toEqual({ kept: [], made: 0, masterworks: 0 });
  });
});

describe("Stats sketches", () => {
  const stats = () => {
    const s = new Stats();
    s.now = () => 1_000_000;
    s.say("Bought a coffee at Café Rila");
    return s;
  };

  it("after an art action, of something he did before it, with a feed line and the Sketcher badge", () => {
    const s = stats();
    s.do(act("park", "Sketch the passers-by"), "Borisova Garden", new Rng(1));
    expect(s.sketches.kept).toHaveLength(1);
    expect(s.sketches.kept[0]!.of).toBe("Bought a coffee at Café Rila");
    expect(s.history.entries.at(-1)?.text).toMatch(/^🎨 Sketched "Bought a coffee at Café Rila": \w+, kept it$/);
    expect(FEATS.find((f) => f.id === "sketches")!.count(s)).toBe(1);
  });

  it("not after other actions", () => {
    const s = stats();
    s.do(act("park", "Jog a lap"), "", new Rng(1));
    expect(s.sketches.made).toBe(0);
  });

  it("sells one he doesn't keep, and a first masterwork goes in his life story", () => {
    const s = stats();
    // A full book of masterworks: nothing beats the worst, so the new one is sold.
    for (let i = 0; i < Sc.KEPT; i++) s.sketches.add({ of: "x", q: "masterwork", t: i });
    s.skills.steps.art = Sk.stepsTo(Sk.SKILL_MAX);
    const cents = s.cents;
    s.do(act("park", "Sketch the passers-by"), "", new Rng(1));
    const q = s.history.entries.at(-1)!.text.match(/: (\w+), sold it \(\+/)?.[1] as Sc.Quality;
    expect(s.cents - cents).toBe(Sc.GRADE[q][1]);
    s.sketches = new Sc.Sketchbook();
    for (let t = 0; t < 60 && !s.sketches.masterworks; t++) {
      s.now = () => 2_000_000 + t;
      s.do(act("park", "Sketch the passers-by"), "", new Rng(1));
    }
    expect(s.chronicle.lines.map((l) => l.text).some((l) => l.startsWith("Drew his first masterwork"))).toBe(true);
  });

  it("never of the action's own line, even when it levels up his art", () => {
    const s = stats();
    s.skills.steps.art = Sk.stepsTo(3) - 1;
    s.do(act("park", "Sketch the passers-by"), "Borisova Garden", new Rng(1));
    expect(s.history.entries.map((e) => e.text)).toContain("🎨 Art reached level 3");
    expect(s.sketches.kept[0]?.of).not.toMatch(/^Sketch the passers-by/);
  });

  it("without what a line cost or paid, and can draw other 🎨 lines", () => {
    expect(Sc.subject(["Ate a kebab (-€6) He chewed."], new Rng(1))).toBe("Ate a kebab");
    expect(Sc.subject(["🎨 Art reached level 3"], new Rng(1))).toBe("🎨 Art reached level 3");
    expect(Sc.subject(["Wish come true: see the sea (+30 XP)"], new Rng(1))).toBe("Wish come true: see the sea");
    expect(Sc.subject(["Jog a lap at Borisova Garden The pigeons judged him."], new Rng(1), ["The pigeons judged him."])).toBe("Jog a lap at Borisova Garden");
  });
});
