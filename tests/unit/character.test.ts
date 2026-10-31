// His emotion, hidden tastes and lifetime rewards, alone and through Stats.
import { describe, expect, it } from "vitest";
import { minded, weight } from "../../src/core/activities";
import * as E from "../../src/core/emotion";
import { NO_NEED } from "../../src/core/goals";
import type { Moodlet } from "../../src/core/mind";
import * as P from "../../src/core/perks";
import { Rng } from "../../src/core/rng";
import { Stats, type Action } from "../../src/core/stats";
import * as T from "../../src/core/tastes";
import { dataFile } from "../support/data";

const T0 = 1_800_000_000;
const ml = (per_h: number, emo?: E.Emotion): Moodlet => ({ name: `m${per_h}${emo}`, icon: "", per_h, left: 60, ...(emo ? { emo } : {}) });
const at = () => {
  const s = new Stats();
  s.now = () => T0;
  s.meters.energy = 50;
  s.meters.mood = 50;
  return s;
};
const attrs = { str: 1, cha: 1, wit: 1, luck: 1 };

describe("emotion", () => {
  it("is the emotion his moodlets count most towards; untagged ones by their sign", () => {
    expect(E.emotionOf([ml(2, "playful"), ml(1, "focused")], 50, 50)).toBe("playful");
    expect(E.emotionOf([ml(1, "playful"), ml(3)], 50, 50)).toBe("happy");
    expect(E.emotionOf([ml(1, "playful"), ml(-2)], 50, 50)).toBe("sad");
    expect(E.emotionOf([ml(-1, "tense"), ml(-1, "tense"), ml(1)], 50, 50)).toBe("tense");
  });

  it("full energy leans Energised and very low mood Sad; with nothing else he is Bored or Fine", () => {
    expect(E.emotionOf([], E.FULL_ENERGY, 50)).toBe("energised");
    expect(E.emotionOf([ml(1)], 50, E.SAD_MOOD)).toBe("sad");
    expect(E.emotionOf([], 50, E.BORED_MOOD - 1)).toBe("bored");
    expect(E.emotionOf([], 50, 50)).toBe("fine");
  });

  it("pulls him to its kinds of place, and a visit there brings its moodlet", () => {
    const s = at();
    s.mind.feel("Pumped", "🏃", 5, 1, "energised");
    expect(s.emotion()).toBe("energised");
    expect(minded(NO_NEED, { class: "stadium" }, s).pull).toBe(E.EMO_PULL);
    expect(minded(NO_NEED, { class: "library" }, s)).toBe(NO_NEED);
    s.do({ name: "Read", min: 1 } as Action, "Library", new Rng(1), "library");
    expect(s.mind.moodlets.find((m) => m.name === E.INFO.focused.moodlet![0])?.emo).toBe("focused");
  });

  it("weighs up and lifts the XP and pay of actions with its attribute", () => {
    const study: Action = { name: "Study", min: 1, fx: { wit: 0.1, xp: 100 }, needs: { wit: 0 }, earn: 10 };
    const s = at();
    const w = weight(study, s);
    const pay = s.wageMult(study);
    s.mind.feel("Deep in thought", "🧐", 5, 1, "focused");
    expect(weight(study, s)).toBeCloseTo(E.EMO_PULL * w);
    expect(s.wageMult(study)).toBeCloseTo(pay * (1 + E.EMO_BONUS));
    expect(s.emoXpMult(study)).toBeCloseTo(1 + E.EMO_BONUS);
    s.mind.moodlets = [];
    s.mind.feel("Wish come true", "🌠", 5, 1);
    expect(s.emoXpMult({ name: "Look", min: 1 })).toBeCloseTo(1 + E.HAPPY_XP);
  });
});

describe("tastes", () => {
  it("rolls LIKES and DISLIKES different kinds, once", () => {
    const t = new T.Tastes();
    t.roll(() => new Rng(7));
    const all = [...t.likes, ...t.dislikes];
    expect(t.likes).toHaveLength(T.LIKES);
    expect(t.dislikes).toHaveLength(T.DISLIKES);
    expect(new Set(all).size).toBe(all.length);
    const before = [...all];
    t.roll(() => new Rng(8));
    expect([...t.likes, ...t.dislikes]).toEqual(before);
  });

  it("pull before he knows them, and are found on the first visit", () => {
    const s = at();
    Object.assign(s.tastes, { likes: ["zoo"], dislikes: ["library"] });
    expect(minded(NO_NEED, { class: "zoo" }, s).pull).toBe(T.LIKE_PULL);
    s.do({ name: "Read", min: 1 } as Action, "Library", new Rng(1), "library");
    expect(s.history.entries.some((e) => e.text === "💢 Turns out he can't stand libraries")).toBe(true);
    expect(s.tastes.known).toEqual(["library"]);
    expect(s.mind.moodlets.find((m) => m.name === "Can't stand libraries")?.per_h).toBe(T.DISLIKE_MOOD[0]);
    const lines = s.history.entries.length;
    s.do({ name: "Read", min: 1 } as Action, "Library", new Rng(1), "library");
    expect(s.history.entries.filter((e) => e.text.startsWith("💢")).length).toBe(1);
    expect(s.history.entries.length).toBe(lines + 1);
  });

  it("names kinds in the plural", () => {
    expect(T.plural("library")).toBe("libraries");
    expect(T.plural("art_gallery")).toBe("galleries");
    expect(T.plural("cafe")).toBe("cafes");
  });

  it("roll for a walker as time passes", () => {
    const s = at();
    s.passTime(1, 0);
    expect(s.tastes.likes).toHaveLength(T.LIKES);
  });
});

describe("lifetime rewards", () => {
  it("buys the perk of his best attribute he can afford, cheaper on a tie", () => {
    const p = new P.Perks();
    expect(p.earn(9, attrs)).toEqual([]);
    expect(p.earn(1, attrs)[0]).toContain("Iron stomach"); // str and wit tie at 10: list order
    expect(p.earn(15, { ...attrs, cha: 1, luck: 3 })[0]).toContain("Lucky streak");
    expect(p.points).toBe(0);
  });

  it("buys every perk he can afford at once", () => {
    const p = new P.Perks();
    expect(p.earn(20, attrs)).toHaveLength(2);
    expect(p.owned).toEqual(["iron_stomach", "bargain_eye"]);
  });

  it("come from wishes that come true and from levels", () => {
    const s = at();
    s.level = 20; // so the wish's XP brings no level too
    s.mind.wants = [{ kind: "long", place: "castle", until: 0 }];
    s.do({ name: "Tour", min: 1 } as Action, "Castle", new Rng(1), "castle");
    expect(s.perks.points).toBe(P.WANT_POINTS.long);
    s.addXp(10_000);
    const spent = s.perks.owned.reduce((n, id) => n + P.PERKS.find((x) => x.id === id)!.cost, 0);
    expect(s.perks.points + spent).toBe(P.WANT_POINTS.long + P.LEVEL_POINTS * (s.level - 20));
  });

  it("do what they say", () => {
    const s = at();
    s.cents = 10_000;
    const meal: Action = { name: "Dodgy kebab", min: 1, cost: 10, fx: { fullness: 20 }, risk: { p: 1, text: "and got food poisoning" } };
    s.perks.owned = ["iron_stomach", "bargain_eye"];
    s.do(meal, "Kebab Hut", new Rng(1), "fast_food");
    expect(s.cents).toBe(10_000 - 900);
    expect(s.history.entries.at(-1)!.text).not.toContain("food poisoning");
    const job: Action = { name: "Shift", min: 1, earn: 10 };
    const pay = s.wageMult(job);
    s.perks.owned.push("silver_tongue");
    expect(s.wageMult(job)).toBeCloseTo(pay * (1 + P.SILVER_PAY));
  });
});

describe("lifetime rewards, the rest", () => {
  it("Lucky streak finds money more often, Never weary tires him less, Quick study gives more XP", () => {
    const s = at();
    s.attrs.luck = 1;
    const finds = (t: Stats) => {
      let n = 0;
      const rng = new Rng(3);
      for (let i = 0; i < 2000; i++) if (t.walkFor(1, rng)) n++;
      return n;
    };
    const plain = finds(s);
    const lucky = at();
    lucky.attrs.luck = 1;
    lucky.perks.owned = ["lucky_streak"];
    expect(finds(lucky)).toBeGreaterThan(plain * 1.5);
    const walk = (t: Stats) => {
      t.meters.energy = 50;
      t.passTime(1, 1000);
      return 50 - t.meters.energy;
    };
    const tired = walk(at());
    const weary = at();
    weary.perks.owned = ["never_weary"];
    expect(walk(weary)).toBeLessThan(tired);
    const study = at();
    study.perks.owned = ["quick_study"];
    expect(study.emoXpMult({ name: "Look", min: 1 })).toBeCloseTo(1 + P.STUDY_XP);
  });
});

describe("data", () => {
  it("emotions and tastes name place classes that actions.json has", () => {
    const classes = new Set(Object.keys(JSON.parse(dataFile("actions.json"))).map((k) => k.split("/")[0]));
    for (const k of [...Object.values(E.INFO).flatMap((i) => i.kinds), ...T.KINDS]) expect(classes, k).toContain(k);
  });
});

describe("saves", () => {
  it("keep tastes and perks, and an old save has none yet", () => {
    const s = at();
    Object.assign(s.tastes, { likes: ["zoo"], dislikes: ["bar"], known: ["zoo"] });
    s.perks.points = 4;
    s.perks.owned = ["quick_study"];
    const back = Stats.fromJSON(JSON.parse(JSON.stringify(s)));
    expect(back.tastes.toJSON()).toEqual(s.tastes.toJSON());
    expect(back.perks.toJSON()).toEqual({ points: 4, owned: ["quick_study"] });
    const old = JSON.parse(JSON.stringify(s));
    delete old.tastes;
    delete old.perks;
    const o = Stats.fromJSON(old);
    expect(o.tastes.likes).toEqual([]);
    expect(o.perks.points).toBe(0);
    o.now = () => T0;
    o.passTime(1, 0);
    expect(o.tastes.likes).toHaveLength(T.LIKES);
  });

  it("an old save's Rattled and Scared moodlets count towards Tense", () => {
    const s = at();
    s.mind.moodlets = [
      { name: "Rattled", icon: "😖", per_h: -1, left: 60 },
      { name: "Scared of the dog park", icon: "😨", per_h: -2, left: 60 },
      { name: "Bad meal", icon: "", per_h: -1, left: 60 },
    ];
    const back = Stats.fromJSON(JSON.parse(JSON.stringify(s)));
    expect(back.mind.moodlets.map((m) => m.emo)).toEqual(["tense", "tense", undefined]);
    expect(back.emotion()).toBe("tense");
  });
});
