// His mind: moodlets, wants and fears, alone and through Stats.
import { describe, expect, it } from "vitest";
import { minded } from "../../src/core/activities";
import { NO_NEED } from "../../src/core/goals";
import * as M from "../../src/core/mind";
import { Rng } from "../../src/core/rng";
import { Stats, type Action } from "../../src/core/stats";

const T0 = 1_800_000_000;
const rng = () => new Rng(1);
/** Dice whose first roll is `r`. */
const fixed = (r: number) => ({ randf: () => r, pick: <T>(l: readonly T[]) => l[0]! }) as unknown as Rng;

describe("moodlets", () => {
  it("add their mood an hour while they last, then go", () => {
    const m = new M.Mind();
    m.feel("Great espresso", "☕", 4, 2);
    expect(m.moodPerH()).toBe(4);
    expect(m.pass(60)).toBeCloseTo(4);
    expect(m.pass(120)).toBeCloseTo(4); // only the hour left counts
    expect(m.moodlets).toEqual([]);
  });

  it("renew rather than stack, and keep at most MAX_MOODLETS", () => {
    const m = new M.Mind();
    m.feel("A", "", 1, 1);
    m.feel("A", "", 1, 3);
    expect(m.moodlets).toHaveLength(1);
    expect(m.moodlets[0]!.left).toBe(180);
    for (let i = 0; i < M.MAX_MOODLETS + 3; i++) m.feel(`m${i}`, "", 1, i + 1);
    expect(m.moodlets).toHaveLength(M.MAX_MOODLETS);
    expect(m.moodlets.some((x) => x.name === "A")).toBe(false); // the one nearest its end went
  });
});

describe("wants", () => {
  it("always hold a long and a short one; a short one runs out after SHORT_H", () => {
    const m = new M.Mind();
    m.refill(T0, rng);
    expect(m.wants.map((w) => w.kind).sort()).toEqual(["long", "short"]);
    expect(M.LONG_KINDS).toContain(m.wants.find((w) => w.kind === "long")!.place);
    const short = m.wants.find((w) => w.kind === "short")!;
    expect(short.until).toBe(T0 + M.SHORT_H * 3600);
    let made = 0;
    m.refill(T0 + 60, () => (made++, rng()));
    expect(made).toBe(0); // full, so no dice
    m.refill(short.until, rng);
    expect(m.wants.find((w) => w.kind === "short")!.until).toBe(short.until + M.SHORT_H * 3600);
  });

  it("pull places of their kind WANT_PULL times as hard; fears FEAR_PULL", () => {
    const m = new M.Mind();
    m.wants = [{ kind: "long", place: "castle", until: 0 }];
    m.fears = ["dog_park"];
    expect(m.pull("castle")).toBe(M.WANT_PULL);
    expect(m.pull("dog_park")).toBe(M.FEAR_PULL);
    expect(m.pull("cafe")).toBe(1);
  });

  it("come true at a place of their kind, with a moodlet and a feed line", () => {
    const m = new M.Mind();
    m.wants = [{ kind: "long", place: "castle", until: 0 }];
    const { met, lines } = m.did("castle", false, T0, rng());
    expect(met.map((w) => w.kind)).toEqual(["long"]);
    expect(lines[0]).toContain("Wish come true: see a castle");
    expect(m.wants).toEqual([]);
    expect(m.moodPerH()).toBe(M.WANT_MOOD.long[0]);
  });
});

describe("fears", () => {
  it("a mishap rattles him and wants him to cheer up somewhere else", () => {
    const m = new M.Mind();
    m.did("cafe", true, T0, fixed(0.99));
    expect(m.moodlets.map((x) => x.name)).toEqual(["Rattled"]);
    const shake = m.wants.find((w) => w.kind === "shake")!;
    expect(shake.place).not.toBe("cafe");
    expect(shake.until).toBe(T0 + M.SHAKE_H * 3600);
    expect(m.fears).toEqual([]);
  });

  it("with FEAR_CHANCE leaves a fear and a want to face it, which cancel out in the pull", () => {
    const m = new M.Mind();
    const { lines } = m.did("dog_park", true, T0, fixed(0));
    expect(m.fears).toEqual(["dog_park"]);
    expect(lines.at(-1)).toContain("wary of dog parks");
    expect(m.pull("dog_park")).toBeCloseTo(M.WANT_PULL * M.FEAR_PULL);
  });

  it("are beaten by a visit with no mishap, and stay after another mishap", () => {
    const m = new M.Mind();
    m.did("dog_park", true, T0, fixed(0));
    m.did("dog_park", true, T0 + 60, fixed(0.99));
    expect(m.fears).toEqual(["dog_park"]);
    const { met, lines } = m.did("dog_park", false, T0 + 120, fixed(0.99));
    expect(met.map((w) => w.kind)).toEqual(["face"]);
    expect(lines[0]).toContain("Faced his fear");
    expect(m.fears).toEqual([]);
    expect(m.pull("dog_park")).toBe(1);
  });

  it("are at most MAX_FEARS", () => {
    const m = new M.Mind();
    for (const k of ["a", "b", "c"]) m.did(k, true, T0, fixed(0));
    expect(m.fears).toEqual(["a", "b"]);
  });

  it("survive a save", () => {
    const m = new M.Mind();
    m.did("dog_park", true, T0, fixed(0));
    const back = M.Mind.fromJSON(JSON.parse(JSON.stringify(m)));
    expect(back.toJSON()).toEqual(m.toJSON());
    expect(M.Mind.fromJSON(undefined).wants).toEqual([]);
  });
});

describe("through Stats", () => {
  const at = () => {
    const s = new Stats();
    s.now = () => T0;
    return s;
  };

  it("moodlets add to mood as time passes, and wants fill in", () => {
    const s = at();
    s.meters.mood = 50;
    s.passTime(60, 0);
    const drift = 50 - s.meters.mood;
    const t = at();
    t.meters.mood = 50;
    t.mind.feel("Great espresso", "☕", 4, 2);
    t.passTime(60, 0);
    expect(t.meters.mood).toBeCloseTo(50 - drift + 4);
    expect(t.mind.wants).toHaveLength(2);
  });

  it("an action at a wanted kind gives the want's XP", () => {
    const s = at();
    s.mind.wants = [{ kind: "short", place: "cafe", until: T0 + 3600 }];
    const xp = s.xp;
    s.do({ name: "Drink a coffee", min: 1 } as Action, "Cafe East", new Rng(1), "cafe");
    expect(s.xp - xp).toBe(M.WANT_XP.short);
    expect(s.history.entries.at(-1)!.text).toContain("Wish come true");
  });

  it("a risk gone wrong rattles him", () => {
    const s = at();
    s.do({ name: "Pet a dog", min: 1, risk: { p: 1, text: "and got bitten" } } as Action, "Dog Park", new Rng(1), "dog_park");
    expect(s.mind.moodlets.map((m) => m.name)).toContain("Rattled");
  });

  it("wants and fears scale a place's need pull", () => {
    const s = at();
    s.mind.wants = [{ kind: "long", place: "castle", until: 0 }];
    expect(minded(NO_NEED, { class: "castle" }, s).pull).toBe(M.WANT_PULL);
    expect(minded(NO_NEED, { class: "cafe" }, s)).toBe(NO_NEED);
  });
});
