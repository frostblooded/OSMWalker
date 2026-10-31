// Place creatures: who lives where, how often they show up, and what each pick does.
import { describe, expect, it, vi } from "vitest";
import { FEATS, SETS } from "../../src/core/collection";
import { CREATURE_CHANCE, Creatures, creatureOf as kindAt, type Creature } from "../../src/core/creatures";
import { RISK_CAP, riskOdds } from "../../src/core/moments";
import { signed } from "../../src/core/money";
import { BRIDGE } from "../../src/core/ofm";
import { ODD_KINDS } from "../../src/core/poiGen";
import { dataFile } from "../support/data";
import { optionFor } from "../../src/core/moments";
import { Stats } from "../../src/core/stats";

const T0 = 1_800_000_000;
const DAY = 86_400;
const CREATURES = JSON.parse(dataFile("creatures.json")) as Creature[];
const kind = (id: string) => CREATURES.find((c) => c.id === id)!;
const creatureOf = (cls: string) => kindAt(CREATURES, cls);
const TOLL = kind("troll").outcomes.pay!.pay!;
const COIN = kind("sprite").outcomes.coin!.pay!;
/** Stats that know the creatures, as the game sets them. */
const stats = () => Object.assign(new Stats(), { creatureKinds: CREATURES });
const at = (cls: string, name = "Somewhere") => ({ class: cls, name });
const roundTrip = (s: Stats) => Stats.fromJSON(JSON.parse(JSON.stringify(s)));
/** The first time from `t` on at which a creature shows up at `place` for `s`, minute by minute. */
function firstMeeting(s: Stats, place: { class: string; name: string }, t = T0): number {
  for (let m = 0; m < 2000; m++) {
    s.now = () => t + m * 60;
    const probe = Creatures.fromJSON(s.creatures.toJSON());
    const was = s.creatures;
    s.creatures = probe;
    const c = s.creatureAt(place);
    s.creatures = was;
    if (c) return t + m * 60;
  }
  throw new Error("no meeting");
}

describe("place creatures", () => {
  it("live at the places of their kind: a troll at bridges, a sprite in fountains and wells, a dryad in parks", () => {
    expect(creatureOf("bridge")?.id).toBe("troll");
    for (const cls of ["fountain", "old_well", "drinking_water"]) expect(creatureOf(cls)?.id).toBe("sprite");
    for (const cls of ["park", "garden"]) expect(creatureOf(cls)?.id).toBe("dryad");
    expect(creatureOf("cafe")).toBeUndefined();
  });

  it("lives only at place classes the game still has: bridges from the streets, made-up wells, and kinds with actions", () => {
    const actions = JSON.parse(dataFile("actions.json")) as Record<string, unknown>;
    for (const c of CREATURES) for (const cls of c.at) expect(actions[cls], `${c.id} at ${cls}`).toBeDefined();
    expect(creatureOf(BRIDGE)?.id).toBe("troll");
    expect(creatureOf("old_well")).toBeDefined();
    expect(ODD_KINDS).toContain("old_well");
  });

  it("are three, as the Folklore feat's Gold tier counts", () => {
    expect(CREATURES).toHaveLength(FEATS.find((f) => f.id === "creatures")!.tiers[2]);
  });

  it("each asks a choice of three, with an outcome for each and a default among them", () => {
    for (const c of CREATURES) {
      expect(c.moment.options).toHaveLength(3);
      expect(() => optionFor(c.moment, c.moment.default)).not.toThrow();
      for (const o of c.moment.options) expect(c.outcomes[o.id], `${c.id} ${o.id}`).toBeDefined();
    }
  });

  it("shows up with CREATURE_CHANCE, at most once a day: the meeting marks the day", () => {
    const cr = new Creatures();
    expect(cr.roll(CREATURES, "park", "d1", CREATURE_CHANCE)).toBeNull();
    expect(cr.roll(CREATURES, "cafe", "d1", 0)).toBeNull();
    const dryad = cr.roll(CREATURES, "park", "d1", 0)!;
    expect(dryad.id).toBe("dryad");
    // Shown but not yet answered (a save while you are asked), the day is still free.
    expect(cr.day).toBe("");
    cr.outcome(dryad, "listen", () => 1, 0, "d1");
    expect(cr.roll(CREATURES, "bridge", "d1", 0)).toBeNull();
    expect(cr.roll(CREATURES, "bridge", "d2", 0)?.id).toBe("troll");
  });

  it("the troll's riddle works more often with more Wits, and a miss costs double the toll", () => {
    expect(riskOdds(1)).toBe(0.5);
    expect(riskOdds(5)).toBeCloseTo(0.7);
    expect(riskOdds(50)).toBe(RISK_CAP);
    const cr = new Creatures();
    const troll = kind("troll");
    expect(cr.outcome(troll, "riddle", () => 1, 0.49, "d1").say).toMatch(/^Answered/);
    const miss = cr.outcome(troll, "riddle", () => 1, 0.5, "d1");
    expect(miss.pay).toBe(2 * TOLL);
    expect(cr.outcome(troll, "pay", () => 1, 0.99, "d1").pay).toBe(TOLL);
    expect(cr.met.troll).toBe(3);
    expect(() => cr.outcome(troll, "dance", () => 1, 0, "d1")).toThrow();
  });

  it("a meeting pays, buffs and says what happened, with the creature's icon", () => {
    const s = stats();
    s.now = () => T0;
    const cents = s.cents;
    const line = s.meet(kind("sprite"), "Trevi Fountain", "coin");
    expect(line).toBe(`🧚 Tossed the water sprite a coin at Trevi Fountain (${signed(-COIN)})`);
    expect(s.cents).toBe(cents - COIN);
    expect(s.buffNames()).toContain("Sprite's luck");
    expect(s.attr("luck")).toBe(3);
    expect(s.history.entries.at(-1)?.text).toBe(line);
  });

  it("says when he picked himself, and rolls the dice of the time he was asked", () => {
    const s = stats();
    s.now = () => T0;
    expect(s.meet(kind("dryad"), "Park", "listen", { you: false, t: T0, attr: () => 1 })).toBe("🌳 Decided by himself: Listened to a dryad's stories in Park");
    // A tap a few seconds later rolls the troll's riddle on the dice of when it asked (the dice of later times give both results).
    const lines = Array.from({ length: 20 }, (_, late) => {
      const x = Object.assign(stats(), { cents: 10_000 });
      x.now = () => T0 + late;
      return x.meet(kind("troll"), "Old Bridge", "riddle", { you: true, t: T0, attr: () => 1 });
    });
    expect(new Set(lines).size).toBe(1);
    // And on the Wits he had then, which the caller passes.
    const then = vi.fn(() => 1);
    stats().meet(kind("troll"), "Old Bridge", "riddle", { you: true, t: T0, attr: then });
    expect(then).toHaveBeenCalledWith("wit");
  });

  it("he pays only what he has", () => {
    const s = stats();
    s.cents = 100;
    const line = s.meet(kind("troll"), "Old Bridge", "pay");
    expect(s.cents).toBe(0);
    expect(line).toContain("Old Bridge");
    s.meet(kind("troll"), "Old Bridge", "pay");
    expect(s.cents).toBe(0);
  });

  it("meetAt meets the creature once that day, with his own pick, and leaves other days free", () => {
    const s = stats();
    const t = firstMeeting(s, at("park", "Borisova Gradina"));
    s.now = () => t;
    const xp = s.xp;
    s.meetAt(at("park", "Borisova Gradina"));
    expect(s.creatures.met.dryad).toBe(1);
    // The dryad's default: her stories.
    expect(s.xp).toBe(xp + 15);
    s.meetAt(at("park", "Borisova Gradina"));
    s.meetAt(at("bridge", "Lavov most"));
    expect(s.creatures.met).toEqual({ dryad: 1 });
    const next = firstMeeting(s, at("bridge", "Lavov most"), t + DAY);
    s.now = () => next;
    s.meetAt(at("bridge", "Lavov most"));
    expect(s.creatures.met.troll).toBe(1);
  });

  it("the save keeps whom he met, and an old save starts with none", () => {
    const s = new Stats();
    s.creatures.met = { troll: 2 };
    s.creatures.day = "2026-10-30";
    expect(roundTrip(s).creatures.toJSON()).toEqual({ met: { troll: 2 }, day: "2026-10-30" });
    const old = JSON.parse(JSON.stringify(new Stats()));
    delete old.creatures;
    expect(Stats.fromJSON(old).creatures.toJSON()).toEqual({ met: {}, day: "" });
  });

  it("the Collection lists every creature, with a hint until he meets it", () => {
    const set = SETS.find((x) => x.id === "creatures")!;
    const s = stats();
    s.creatures.met = { sprite: 2 };
    const entries = set.entries(s);
    expect(entries.map((e) => e.id)).toEqual(CREATURES.map((c: Creature) => c.id));
    expect(entries.find((e) => e.id === "sprite")).toMatchObject({ got: true, info: "Met 2 times" });
    expect(entries.find((e) => e.id === "troll")).toMatchObject({ got: false, info: "Lives under a bridge" });
  });
});
