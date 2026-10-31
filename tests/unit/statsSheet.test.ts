// @vitest-environment happy-dom
// The Stats sheet's speed and saving goal for fantasy mounts, his clubs, his Magic and spells, what the sky does to him, and his skills, languages and pantry.
// Also the Diary sheet: its days, newest first, with their dreams.
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
import { DiarySheet } from "../../src/ui/DiarySheet";
import type { Spell } from "../../src/core/magic";
import SPELLS from "../../public/data/spells.json";

const shown = (stats: Stats, afoot = false) => {
  const root = document.createElement("div");
  render(h(StatsSheet, { stats, afoot }), root);
  return root.textContent ?? "";
};

describe("Stats sheet", () => {
  it("lists his careers with his title and the shifts to the next rank", () => {
    const stats = new Stats();
    expect(shown(stats)).toContain("No shifts yet.");
    stats.careers.shifts = { cafe: 41, bar: 150 };
    const text = shown(stats);
    expect(text).toContain("🍸 Bar · Bar managerTop rank");
    expect(text).toContain("☕ Café · Head barista19 shifts to go");
    expect(text).toContain("Rank 5 / 5");
  });

  it("shows his newest letters and where gifts wait", () => {
    const stats = new Stats();
    expect(shown(stats)).toContain("No letters yet.");
    stats.mail.letters = [{ from: "Ana", icon: "👩", city: "Porto, Portugal", text: "Come back soon!", t: 1 }];
    stats.mail.waiting = [{ from: "Bo", city: "Sofia, Bulgaria", gift: { name: "cake", icon: "🍰", fx: {}, line: "Cake" } }];
    const text = shown(stats);
    expect(text).toContain("📬Mailbox1");
    expect(text).toContain("👩 Ana, Porto");
    expect(text).toContain("🎁 Gifts wait at his spot inSofia");
    // Past four letters, the older ones fold into More.
    stats.mail.letters = Array.from({ length: 6 }, (_, i) => ({ from: `F${i}`, icon: "👩", city: "Porto, Portugal", text: "Hi", t: i }));
    const many = shown(stats);
    expect(many).toContain("📬Mailbox6");
    expect(many).toContain("F5, Porto");
    expect(many).toContain("More ▸2");
    expect(many).not.toContain("F1, Porto");
  });

  it("shows his quirks, and his spot once he has one", () => {
    const stats = new Stats();
    stats.where = { city: "Sofia, Bulgaria", code: "BGR", country: "Bulgaria" };
    expect(shown(stats)).toContain("None yet.");
    expect(shown(stats)).not.toContain("His spot");
    stats.quirks.have = ["culture"];
    for (let i = 0; i < 3; i++) stats.visit({ name: "Cafe A", class: "cafe", lat: 1, lon: 2 });
    const text = shown(stats);
    expect(text).toContain("🌟Quirks1 / 5");
    expect(text).toContain("🎭 Culture vulture");
    expect(text).toContain("🏠His spotCafe A");
    expect(text).toContain("−10%");
  });

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

  it("tells a failed quest from an event that went badly", () => {
    const stats = new Stats();
    stats.quests.log.push({ icon: "🧪", title: "Lost cause", city: "X", t: 0, good: false }, { icon: "🌟", title: "Rough fair", city: "X", t: 1, good: false, event: true });
    expect(shown(stats)).toContain("Lost cause✖ Failed");
    expect(shown(stats)).toContain("Rough fairWent badly");
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

describe("Diary sheet", () => {
  it("lists days newest first, each opening to its lines and dreams", () => {
    const stats = new Stats();
    const root = document.createElement("div");
    render(h(DiarySheet, { diary: stats.diary }), root);
    expect(root.textContent).toContain("Nothing yet.");
    stats.diary.entries = [
      { date: "2026-10-29", city: "Sofia, Bulgaria", day: 1, lines: ["Sofia, day 1.", "Found Cafe East today."], dreams: [] },
      { date: "2026-10-30", city: "Sofia, Bulgaria", day: 2, lines: ["Sofia, day 2.", "A quiet day."], dreams: ["Dreamt Cafe East was full of pigeons."] },
    ];
    render(h(DiarySheet, { diary: stats.diary }), root);
    const rows = [...root.querySelectorAll("button.row")];
    expect(rows.map((r) => r.textContent)).toEqual(["📔 Sofia, day 2. ▸", "📔 Sofia, day 1. ▸"]);
    (rows[0] as HTMLButtonElement).click();
    return Promise.resolve().then(() => {
      expect(root.textContent).toContain("💤 Dreamt Cafe East was full of pigeons.");
    });
  });
});
