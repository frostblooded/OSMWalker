// @vitest-environment happy-dom
// The Stats sheet's speed and saving goal for fantasy mounts, his clubs, his Magic and spells, what the sky does to him, and his skills, languages and pantry.
import { h, render } from "preact";
import { describe, expect, it } from "vitest";
import * as Items from "../../src/core/items";
import { euro } from "../../src/core/money";
import { Rng } from "../../src/core/rng";
import { skyAt, SNOW_SPEED } from "../../src/core/sky";
import { DRAGON_UPKEEP, KEEP_CENTS, Stats } from "../../src/core/stats";
import { PANTRY_MAX } from "../../src/core/cooking";
import { stepsTo } from "../../src/core/skills";
import { speed } from "../../src/ui/format";
import { StatsSheet } from "../../src/ui/StatsSheet";
import type { Spell } from "../../src/core/magic";
import SPELLS from "../../public/data/spells.json";

const shown = (stats: Stats, afoot = false) => {
  const root = document.createElement("div");
  render(h(StatsSheet, { stats, afoot }), root);
  return root.textContent ?? "";
};

describe("Stats sheet", () => {
  it("shows his wants, fears and the total that moves his mood", () => {
    const stats = new Stats();
    stats.now = () => 1_800_000_000;
    stats.mind.wants = [{ kind: "long", place: "castle", until: 0 }, { kind: "short", place: "cafe", until: 1_800_000_000 + 2 * 3600 }];
    stats.mind.fears = ["dog_park"];
    stats.mind.wants.push({ kind: "face", place: "dog_park", until: 0 });
    stats.mind.feel("Wish come true", "🌠", 3, 4);
    const text = shown(stats);
    expect(text).toContain("💭Mind");
    expect(text).toContain("🌠 See a castle");
    expect(text).toContain("✨ Go to a cafe2 h");
    expect(text).toContain("😨 Wary of dog parks: face the dog park again");
    expect(text).toContain("🙂 Mood ▸+2/h"); // -1 drift + 3
  });

  it("shows his pet, its level and km together, and the pets he had", () => {
    const stats = new Stats();
    expect(shown(stats)).toContain("No pet yet");
    const p = stats.pets.adopt("cat", stats.now(), "", new Rng(1));
    expect(shown(stats)).toContain(`${p.name} the cat`);
    expect(shown(stats)).toContain("No, grumpy");
    stats.pets.pass(stats.now() + 86400 * 300);
    expect(shown(stats)).toContain("Remembered");
  });

  it("after a flyer lands, shows his walking speed", () => {
    const stats = new Stats();
    stats.equip(Items.build(Items.KINDS.dragons[0]!, Items.MATERIALS[0]!, []));
    stats.feedDragon(new Rng(1));
    expect(shown(stats)).toContain(speed(stats.speedMps()));
    expect(shown(stats, true)).toContain(speed(stats.speedMps(true)));
    expect(speed(stats.speedMps(true))).not.toBe(speed(stats.speedMps()));
  });

  it("on a day his dragon hasn't eaten, shows its gold under Saving for", () => {
    const stats = new Stats();
    stats.equip(Items.build(Items.KINDS.dragons[0]!, Items.MATERIALS[0]!, []));
    stats.cents = 0;
    expect(shown(stats)).toContain("🐉 Dragon's gold");
    stats.cents = DRAGON_UPKEEP;
    stats.feedDragon(new Rng(1));
    expect(shown(stats)).not.toContain("Saving for");
  });

  it("in a car, saves for the dragon and its first day of gold", () => {
    const stats = new Stats();
    stats.equip(Items.build(Items.KINDS.cars[0]!, Items.MATERIALS[0]!, []));
    expect(shown(stats)).toContain("🐉 Dragon");
    // A goal of his next vehicle leaves no stray "0" for a dragon's gold.
    const root = document.createElement("div");
    render(h(StatsSheet, { stats }), root);
    const card = [...root.querySelectorAll(".card")].find((c) => c.textContent?.includes("Saving for"))!;
    expect(card.textContent!.endsWith(euro(stats.vehicleSaving()))).toBe(true);
    expect(stats.vehicleSaving()).toBe(Items.cheapest("dragons").price + KEEP_CENTS + DRAGON_UPKEEP);
  });

  it("says snow slows him only when he is on foot, as after a flyer lands", () => {
    const stats = new Stats();
    stats.equip(Items.build(Items.KINDS.cars[0]!, Items.MATERIALS[0]!, []));
    stats.sky = skyAt(Date.UTC(2026, 0, 15, 12), 42.7, 23.3, 7200, { kind: "snow", tempC: -2 });
    const note = `speed ${Math.round(SNOW_SPEED * 100)}%`;
    expect(shown(stats)).not.toContain(note);
    expect(shown(stats, true)).toContain(note);
  });

  it("shows his Magic in Vitals and the spells he knows, with their cost and casts", () => {
    // Imported, as dataFile can't find files under happy-dom.
    const spells = SPELLS as Spell[];
    const stats = Object.assign(new Stats(), { spellKinds: spells });
    stats.magic = 42;
    let text = shown(stats);
    expect(text).toContain("🔮 Magic42");
    expect(text).toContain(`Spells0 / ${spells.length}`);
    expect(text).toContain("Knownnone yet");
    stats.lore.known = ["soup"];
    stats.lore.casts = { soup: 3 };
    text = shown(stats);
    expect(text).toContain(`Spells1 / ${spells.length}`);
    expect(text).toContain("🍲 Warm soup20 Magic · cast 3×");
    expect(text).not.toContain("none yet");
  });

  it("shows the local words he knows by language, with the last one", () => {
    const stats = new Stats();
    expect(shown(stats)).toContain("🗣Local wordsLearnednone so far");
    stats.wordBook = { at: {}, languages: { bg: { name: "Bulgarian", words: [["здравей (zdravey)", "hello"], ["кафе (kafe)", "coffee"]] } }, countries: { BGR: "bg" } };
    stats.words.known = { bg: ["hello", "coffee"] };
    expect(shown(stats)).toContain("🗣Local words2Bulgarian 2 / 2кафе (kafe) = coffee");
    // Past four languages, the ones with fewest words fold away.
    for (const k of ["a", "b", "c", "d"]) {
      stats.wordBook.languages[k] = { name: `Lang${k}`, words: [["x", "one"]] };
      stats.words.known[k] = ["one"];
    }
    const text = shown(stats);
    expect(text).toContain("Bulgarian 2 / 2");
    expect(text).toContain("More languages ▸1");
    expect(text).not.toContain("Langd");
  });

  it("lists his clubs on the Friends card, with their city and night", () => {
    const stats = new Stats();
    stats.clubs.list = [{ kind: "chess", host: "x", city: "Sofia, Bulgaria", place: { name: "Café Rila", lat: 0, lon: 0 }, day: 2, hour: 19, joined: 0, last: "", nights: 0 }];
    expect(shown(stats)).toContain("♟ Chess clubSofia · Tue 19:00");
  });

  it("shows what his enchanted gear adds to Magic a km", () => {
    const stats = new Stats();
    expect(shown(stats)).not.toContain("From enchanted gear");
    stats.equip(Items.build(Items.KINDS.trinkets[0]!, Items.MATERIALS[0]!, [Items.ENCHANTMENTS.find((e) => e.name === "of the Moon")!]));
    expect(shown(stats)).toContain("🌙 From enchanted gear+2 a km");
  });

  it("shows each skill's level, the languages he speaks with the local one marked, and his pantry", () => {
    const stats = new Stats();
    stats.skills.steps.music = stepsTo(3);
    stats.arrive("Lyon", "FRA", "France");
    stats.languages.add("France's language", 6);
    stats.pantry.items = ["bread", "cheese"];
    const text = shown(stats);
    expect(text).toContain("🎵 Music3");
    expect(text).toContain("France's language · herebasic");
    expect(text).toContain("Englishfluent");
    expect(text).toContain(`🧺 Pantry🍞🧀 · 2 / ${PANTRY_MAX}`);
  });
});
