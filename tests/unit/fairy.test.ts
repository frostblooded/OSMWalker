// Fairy rings: where and when he naps, how rarely, what he wakes with, and the same while away.
import { describe, expect, it } from "vitest";
import { Activities } from "../../src/core/activities";
import { catchUp, type AwayCity } from "../../src/core/catchup";
import { FEATS, SETS } from "../../src/core/collection";
import * as F from "../../src/core/fairy";
import { bboxAround } from "../../src/core/geo";
import * as Items from "../../src/core/items";
import { Rng, seedOf } from "../../src/core/rng";
import { Stats, type Place } from "../../src/core/stats";
import { parseCities, Trips } from "../../src/core/trips";
import { dataFile } from "../support/data";

const T0 = 1_800_000_000;
const DAY = 86_400;
const PARK: Place = { name: "Rose Park", class: "park", subclass: "park", rank: 1, lat: 0, lon: 0 };
const DAWN = F.FAIRY_FROM_H;
/** A time from `t` on at which a ring at `p` takes him, and the gift roll comes out as `gift` says. */
function napTime(p: Place, gift: boolean, t = T0): number {
  for (; ; t += 60) {
    const r = new Rng(seedOf(`fairy${t}${p.name}`));
    if (r.randf() >= F.FAIRY_CHANCE) continue;
    r.randiRange(F.NAP_MIN_MIN, F.NAP_MAX_MIN);
    if (r.randf() < F.GIFT_CHANCE === gift) return t;
  }
}
const at = (t: number) => {
  const s = new Stats();
  s.now = () => t;
  s.arrive("Bigtown, A-land", "AAA", "A-land");
  return s;
};

describe("fairy rings", () => {
  it("grow in real parks and gardens, only at dawn", () => {
    expect(F.isRingPlace(PARK)).toBe(true);
    expect(F.isRingPlace({ ...PARK, class: "garden" })).toBe(true);
    expect(F.isRingPlace({ ...PARK, class: "cafe" })).toBe(false);
    expect(F.isRingPlace({ ...PARK, made: true })).toBe(false);
    expect(F.isDawn(F.FAIRY_FROM_H)).toBe(true);
    expect(F.isDawn(F.FAIRY_TO_H - 1)).toBe(true);
    expect(F.isDawn(F.FAIRY_TO_H)).toBe(false);
    expect(F.isDawn(F.FAIRY_FROM_H - 1)).toBe(false);
    const t = napTime(PARK, true);
    expect(at(t).fairyAt(PARK, 12)).toBe(0);
    expect(at(t).fairyAt({ ...PARK, class: "cafe" }, DAWN)).toBe(0);
  });

  it("take him with FAIRY_CHANCE, never within FAIRY_GAP_DAYS of the last nap", () => {
    const r = new F.Rings();
    expect(r.takes(T0, F.FAIRY_CHANCE)).toBe(false);
    expect(r.takes(T0, 0)).toBe(true);
    r.note(T0, { story: "dance" });
    expect(r.takes(T0 + F.FAIRY_GAP_DAYS * DAY - 60, 0)).toBe(false);
    expect(r.takes(T0 + F.FAIRY_GAP_DAYS * DAY, 0)).toBe(true);
  });

  it("a nap of hours leaves him rested with a Fairy-spun trinket, worn when it beats his own", () => {
    const t = napTime(PARK, true);
    const s = at(t);
    s.meters.energy = 20;
    const min = s.fairyAt(PARK, DAWN);
    expect(min).toBeGreaterThanOrEqual(F.NAP_MIN_MIN);
    expect(min).toBeLessThanOrEqual(F.NAP_MAX_MIN);
    expect(s.meters.energy).toBe(100);
    const gift = s.gear.trinket!;
    expect(gift.name.startsWith("Fairy-spun ")).toBe(true);
    expect(gift.stats.magic).toBe(F.FAIRY_MOD.stats.magic);
    expect(s.rings.gifts).toEqual([Items.KINDS.trinkets.find((b) => gift.name.endsWith(b.base))!.base]);
    const texts = s.history.entries.map((e) => e.text);
    expect(texts).toContain(`🍄 Lay down in a ring of mushrooms in Rose Park at dawn, and woke ${Math.round(min / 60)} hours later, rested`);
    expect(texts.at(-1)).toBe(`🎁 In his hand: a ${gift.rarity} ${gift.name}, a fairy gift`);
    expect(s.chronicle.lines.map((l) => l.text)).toContain(`Napped in a fairy ring in Rose Park and woke ${Math.round(min / 60)} hours later`);
    // Not an upgrade: it goes in his bag.
    const s2 = at(t);
    s2.equip(Items.build(Items.KINDS.trinkets[0]!, Items.MATERIALS.at(-1)!, [Items.SUFFIXES[3]!]));
    s2.fairyAt(PARK, DAWN);
    expect(s2.bag.some((i) => i.name.startsWith("Fairy-spun "))).toBe(true);
  });

  it("or with STORY_MAGIC Magic and a strange story", () => {
    const s = at(napTime(PARK, false));
    s.fairyAt(PARK, DAWN);
    expect(s.magic).toBe(F.STORY_MAGIC);
    expect(s.rings.stories).toHaveLength(1);
    const story = F.STORIES.find((x) => x.id === s.rings.stories[0])!;
    expect(s.history.entries.at(-1)?.text).toBe(`✨ ${story.say} (Magic +${F.STORY_MAGIC})`);
  });

  it("while away he naps too, at real parks, and the time passes", () => {
    const home: AwayCity = { name: "Bigtown, A-land", code: "AAA", center: [0, 0], bounds: bboxAround(0, 0, 3000), places: [{ ...PARK, lat: 0.003 }, { ...PARK, name: "Cafe", class: "cafe", subclass: "cafe", lon: 0.003 }] };
    const deps = { activities: new Activities(JSON.parse(dataFile("actions.json"))), trips: new Trips(parseCities("Bigtown\tAAA\tA-land\t0\t0\t1000\n")), rng: new Rng(7), hourAt: () => DAWN, roll: () => 0.99 };
    const stats = new Stats();
    const s = catchUp(stats, home, [0, 0], 24 * 3600, Date.UTC(2026, 9, 29, 5), deps);
    expect(stats.rings.naps).toBeGreaterThan(0);
    expect(s.lines.some((l) => l.text.startsWith("🍄 Lay down in a ring of mushrooms in Rose Park"))).toBe(true);
    const none = new Stats();
    catchUp(none, { ...home, places: null }, [0, 0], 24 * 3600, Date.UTC(2026, 9, 29, 5), { ...deps, rng: new Rng(7) });
    expect(none.rings.naps).toBe(0);
  });

  it("the Collection has a tile for every gift and story, and the badge counts them", () => {
    const s = new Stats();
    s.rings.note(T0, { gift: "Ring" });
    s.rings.note(T0, { story: "feast" });
    const entries = SETS.find((x) => x.id === "fairy")!.entries(s);
    expect(entries).toHaveLength(Items.KINDS.trinkets.length + F.STORIES.length);
    expect(entries.filter((e) => e.got).map((e) => e.id)).toEqual(["gift:Ring", "story:feast"]);
    expect(FEATS.find((f) => f.id === "fairy")!.count(s)).toBe(2);
    expect(FEATS.find((f) => f.id === "fairy")!.tiers[2]).toBe(entries.length);
  });

  it("the save keeps his naps, an old save starts with none, and the quest bank has a dawn event", () => {
    const s = new Stats();
    s.rings.note(T0, { gift: "Amulet" });
    expect(Stats.fromJSON(JSON.parse(JSON.stringify(s))).rings.toJSON()).toEqual({ last: T0, naps: 1, gifts: ["Amulet"], stories: [] });
    const old = JSON.parse(JSON.stringify(new Stats()));
    delete old.rings;
    expect(Stats.fromJSON(old).rings.toJSON()).toEqual({ last: 0, naps: 0, gifts: [], stories: [] });
    const bank = JSON.parse(dataFile("quests.json")) as { quests: { id: string; reward: { fx?: Record<string, number> } }[]; events: { id: string; time?: string }[] };
    expect(bank.events.find((e) => e.id === "mushroom_circle")?.time).toBe("morning");
    expect(bank.quests.find((q) => q.id === "fairy_ring")?.reward.fx?.magic).toBeGreaterThan(0);
  });
});
