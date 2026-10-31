// Skills, cooking and languages (src/core/skills.ts, cooking.ts,
// languages.ts): levels and what they give, his pantry and recipes, the
// languages he learns, how Stats runs them all, and saving them.
import { describe, expect, it } from "vitest";
import { skillLean } from "../../src/core/activities";
import type { Borders } from "../../src/core/border";
import * as Cook from "../../src/core/cooking";
import * as K from "../../src/core/keepsakes";
import * as Lang from "../../src/core/languages";
import { Rng } from "../../src/core/rng";
import * as Sk from "../../src/core/skills";
import { Stats, type Action, type Place } from "../../src/core/stats";
import { dataFile } from "../support/data";

const ACTIONS = JSON.parse(dataFile("actions.json")) as Record<string, Action[]>;
const BORDERS = JSON.parse(dataFile("borders.json")) as Borders;
const act = (key: string, name: string) => ACTIONS[key]!.find((a) => a.name === name)!;
const roundTrip = (s: Stats) => Stats.fromJSON(JSON.parse(JSON.stringify(s)));
/** A Stats in Sofia that has spent its first minute there, so Bulgarian is his own. */
const inSofia = () => {
  const s = Object.assign(new Stats(), { borders: BORDERS });
  s.now = () => 1_000_000;
  s.arrive("Sofia", "BGR", "Bulgaria");
  s.passTime(1, 0);
  return s;
};
const steps = (s: Stats, skill: Sk.Skill, level: number) => (s.skills.steps[skill] = Sk.stepsTo(level));

describe("skills", () => {
  it("climb slower the higher they get, up to the top level", () => {
    expect(Sk.levelOf(0)).toBe(0);
    expect(Sk.levelOf(Sk.SKILL_STEP - 1)).toBe(0);
    expect(Sk.levelOf(Sk.SKILL_STEP)).toBe(1);
    expect(Sk.stepsTo(4)).toBe(20);
    expect(Sk.stepsTo(10)).toBe(110);
    expect(Sk.levelOf(1e9)).toBe(Sk.SKILL_MAX);
    for (let l = 1; l < Sk.SKILL_MAX; l++) expect(Sk.stepsTo(l + 1) - Sk.stepsTo(l)).toBeGreaterThan(Sk.stepsTo(l) - Sk.stepsTo(l - 1));
  });

  it("says when a step reaches a new level", () => {
    const k = new Sk.Skills();
    k.steps.music = Sk.SKILL_STEP - 1;
    expect(k.train("music")).toBe("🎵 Music reached level 1");
    expect(k.train("music")).toBe("");
    expect(k.progress("music")).toBeCloseTo(1 / (2 * Sk.SKILL_STEP));
  });

  it("are trained by the actions tagged with them, each of the six by some", () => {
    const tagged = new Set(Object.values(ACTIONS).flatMap((l) => l.map((a) => a.skill).filter(Boolean)));
    expect([...tagged].sort()).toEqual([...Sk.SKILLS].sort());
    const s = inSofia();
    s.do(act("cafe", "Play chess with a regular"), "Café Rila", new Rng(1));
    expect(s.skills.steps.chess).toBe(1);
  });

  it("make their actions' gains and pay bigger", () => {
    const s = inSofia();
    const jog = act("park", "Jog a lap");
    s.do(jog, "", new Rng(1));
    const plain = s.attrs.str;
    steps(s, "sport", 10);
    const was = s.attrs.str;
    s.do(jog, "", new Rng(1));
    expect(s.attrs.str - was).toBeCloseTo((plain - 1) * (1 + 10 * Sk.SKILL_FX));
    const concert = act("park", "Play a street concert");
    expect(s.wageMult(concert)).toBeCloseTo((1 + 0) * 1); // music 0
    steps(s, "music", 4);
    expect(s.wageMult(concert)).toBeCloseTo(1 + 4 * Sk.SKILL_FX);
  });

  it("open actions that need a level", () => {
    const s = inSofia();
    const hustle = act("park", "Hustle chess for coins");
    expect(hustle.needs?.chess).toBe(4);
    expect(s.canDo(hustle, 12)).toBe(false);
    steps(s, "chess", 4);
    expect(s.canDo(hustle, 12)).toBe(true);
  });

  it("make him lean to what he is good at", () => {
    const s = inSofia();
    const chess = act("cafe", "Play chess with a regular");
    expect(skillLean(chess, s)).toBe(1);
    steps(s, "chess", Sk.SKILL_MAX);
    expect(skillLean(chess, s)).toBe(1 + Sk.SKILL_LEAN);
    expect(skillLean(act("cafe", "Espresso at the bar"), s)).toBe(1);
  });

  it("photography makes landmark cards shinier", () => {
    const s = inSofia();
    const sight = (name: string, lat: number): Place => ({ name, class: "attraction", subclass: "attraction", rank: 3, lat, lon: 23 });
    // A roll just past the shiny line: plain at photography 0, foil at 10.
    const r = K.GOLD_CHANCE + K.FOIL_CHANCE + 0.01;
    s.collect(sight("Tower A", 42.1), Object.assign(new Rng(1), { randf: () => r }));
    steps(s, "photo", 10);
    s.collect(sight("Tower B", 42.2), Object.assign(new Rng(1), { randf: () => r }));
    expect([...s.keepsakes.cards.values()].map((c) => c.finish)).toEqual(["", "foil"]);
  });
});

describe("cooking", () => {
  it("buys what a recipe he knows lacks, and nothing once he can cook, with a full pantry or where nothing helps", () => {
    const p = new Cook.Pantry();
    p.items = ["bread"];
    expect(p.pick(["cheese", "tomato", "eggs"], 0)).toBe("cheese");
    p.items = ["bread", "tomato"];
    expect(p.pick(["eggs", "cheese"], 0)).toBe("cheese");
    p.items = ["bread", "cheese"];
    expect(p.pick(["tomato"], 0)).toBeNull();
    p.items = ["eggs"];
    expect(p.pick(["meat"], 0)).toBeNull();
    expect(p.pick(["meat"], 4)).toBe("meat");
    p.items = ["bread", "bread", "bread", "bread", "bread", "eggs"];
    expect(p.pick(["cheese"], 0)).toBeNull();
  });

  it("cooks the most filling recipe his level knows", () => {
    const p = new Cook.Pantry();
    p.items = ["meat", "veg", "tomato", "bread", "cheese"];
    expect(p.best(0)!.id).toBe("picnic");
    expect(p.best(6)!.id).toBe("stew");
    p.use(p.best(6)!);
    expect(p.items).toEqual(["bread", "cheese"]);
  });

  it("a picnic fills more than its parts eaten alone", () => {
    const picnic = Cook.RECIPES.find((r) => r.id === "picnic")!;
    const parts = act("grocery", "Bread and cheese").fx!.fullness!;
    expect(picnic.fx.fullness).toBeGreaterThan(parts);
  });

  it("every recipe is made of ingredients some shop sells, and every ingredient goes in a recipe", () => {
    const sold = new Set(Object.values(ACTIONS).flatMap((l) => l.flatMap((a) => a.groceries ?? [])));
    expect([...sold].sort()).toEqual([...Cook.INGREDIENTS].sort());
    for (const i of Cook.INGREDIENTS) expect(Cook.RECIPES.some((r) => r.uses.includes(i)), i).toBe(true);
  });

  it("Stats buys at a shop, then cooks at the hostel, training cooking", () => {
    const s = inSofia();
    const buy = act("grocery", "Buy something to cook with");
    const cook = act("lodging", "Cook in the hostel kitchen");
    expect(s.canDo(cook, 12)).toBe(false);
    s.pantry.items = ["bread", "tomato"];
    const cents = s.cents;
    expect(s.do(buy, "Billa", new Rng(1))).toBe("🧀 Bought cheese for cooking at Billa (-€3)");
    expect(s.cents).toBe(cents - 300);
    s.meters.fullness = 10;
    expect(s.canDo(cook, 12)).toBe(true);
    expect(s.do(cook, "Hostel Mostel", new Rng(1))).toBe("🧺 Cooked a picnic with bread, cheese and tomatoes at Hostel Mostel");
    expect(s.meters.fullness).toBe(55);
    expect(s.pantry.items).toEqual([]);
    expect(s.pantry.cooked).toBe(1);
    expect(s.skills.steps.cooking).toBe(1);
  });
});

describe("languages", () => {
  it("names a country's language from the data, else after the country", () => {
    expect(Lang.languageOf(BORDERS.languages, "BGR", "Bulgaria")).toBe("Bulgarian");
    expect(Lang.languageOf(BORDERS.languages, "AUT", "Austria")).toBe("German");
    expect(Lang.languageOf(BORDERS.languages, "XXX", "Atlantis")).toBe("Atlantis's language");
    expect(Lang.languageOf(BORDERS.languages, "", "")).toBe("");
  });

  it("has a language for every country in the city list", () => {
    const codes = new Set(dataFile("cities.tsv").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.split("\t")[1]!));
    const missing = [...codes].filter((c) => c && !BORDERS.languages![c]);
    expect(missing).toEqual([]);
  });

  it("makes the first country's language his own, and English, fluent", () => {
    const s = inSofia();
    expect(s.languages.native).toBe("Bulgarian");
    expect(s.languages.level("Bulgarian")).toBe(Lang.FLUENT);
    expect(s.languages.level(Lang.ENGLISH)).toBe(Lang.FLUENT);
    expect(s.attr("cha") - s.attrs.cha).toBeCloseTo(Lang.LANG_CHARM * Lang.FLUENT);
  });

  it("learns a country's language from time there and chats, with Charm there", () => {
    const s = inSofia();
    s.arrive("Lyon", "FRA", "France");
    expect(s.attr("cha")).toBeCloseTo(s.attrs.cha);
    const lines: string[] = [];
    s.onSay = (l) => lines.push(l);
    s.passTime(60 * Lang.LANG_HOURS[1]!, 0);
    expect(lines).toContain("🗣 French: now a few words");
    expect(s.attr("cha") - s.attrs.cha).toBeCloseTo(Lang.LANG_CHARM);
    s.do(act("cafe", "Chat with the locals"), "", new Rng(1));
    expect(s.languages.hours.French).toBeCloseTo(Lang.LANG_HOURS[1]! + Lang.CHAT_H);
  });

  it("guides and translates only when fluent in a language learned abroad", () => {
    const s = inSofia();
    const guide = act("information", "Guide a walking tour");
    expect(s.canDo(guide, 12)).toBe(false);
    s.arrive("Lyon", "FRA", "France");
    expect(s.canDo(guide, 12)).toBe(false);
    s.languages.add("French", Lang.LANG_HOURS[Lang.FLUENT]!);
    expect(s.canDo(guide, 12)).toBe(true);
  });
});

describe("saving", () => {
  it("keeps skills, the pantry and languages", () => {
    const s = inSofia();
    steps(s, "art", 3);
    s.pantry.items = ["eggs"];
    s.pantry.cooked = 4;
    s.languages.add("French", 7);
    const back = roundTrip(s);
    expect(back.skills.level("art")).toBe(3);
    expect(back.pantry.items).toEqual(["eggs"]);
    expect(back.pantry.cooked).toBe(4);
    expect(back.languages.level("French")).toBe(2);
    expect(back.languages.native).toBe("Bulgarian");
  });

  it("loads an old save with no skills, pantry or languages, and his own language comes from where he is", () => {
    const old = JSON.parse(JSON.stringify(new Stats()));
    delete old.skills;
    delete old.pantry;
    delete old.languages;
    old.where = { city: "Porto", code: "PRT", country: "Portugal" };
    const s = Object.assign(Stats.fromJSON(old), { borders: BORDERS });
    expect(Sk.SKILLS.map((k) => s.skills.level(k))).toEqual([0, 0, 0, 0, 0, 0]);
    expect(s.pantry.items).toEqual([]);
    expect(s.languages.level(Lang.ENGLISH)).toBe(Lang.FLUENT);
    s.passTime(1, 0);
    expect(s.languages.native).toBe("Portuguese");
  });
});
