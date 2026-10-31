// Giants seen from afar: where they show, how rarely, what he gets.
import { describe, expect, it } from "vitest";
import { FEATS, SETS } from "../../src/core/collection";
import * as G from "../../src/core/giants";
import { Rng, seedOf } from "../../src/core/rng";
import { Stats, type Place } from "../../src/core/stats";
import { dataFile } from "../support/data";

const T0 = 1_800_000_000;
const DAY = 86_400;
const place = (name: string, cls: string, sub: string, lat = 0, lon = 0): Place => ({ name, class: cls, subclass: sub, rank: 1, lat, lon });
const VIEW = place("Hill View", "attraction", "viewpoint");
/** A time from `t` on at which `p`'s own dice show its giant. */
function showTime(p: Place, t = T0): number {
  while (new Rng(seedOf(`giant${t}${p.name}`)).randf() >= G.GIANT_CHANCE) t += 60;
  return t;
}
const at = (t: number) => {
  const s = new Stats();
  s.now = () => t;
  s.arrive("Bigtown, A-land", "AAA", "A-land");
  return s;
};

describe("giants seen from afar", () => {
  it("show from real ferry piers, swimming lakes, harbours and viewpoints", () => {
    expect(G.giantAt(place("Pier", "ferry_terminal", "ferry_terminal"))?.id).toBe("serpent");
    expect(G.giantAt(place("Lake", "swimming", "swimming_area"))?.id).toBe("serpent");
    expect(G.giantAt(place("Pool hall", "swimming", "swimming"))).toBeUndefined();
    expect(G.giantAt(place("Marina", "harbor", "marina"))?.id).toBe("kraken");
    expect(G.giantAt(VIEW)?.id).toBe("giant");
    expect(G.giantAt(place("Fair", "attraction", "attraction"))).toBeUndefined();
    expect(G.giantAt({ ...VIEW, made: true })).toBeUndefined();
    const actions = JSON.parse(dataFile("actions.json")) as Record<string, unknown>;
    for (const g of G.GIANTS) for (const k of g.at) expect(actions[k.split("/")[0]!], k).toBeDefined();
  });

  it("show with GIANT_CHANCE, at most once a day", () => {
    const s = new G.Sightings();
    expect(s.roll(VIEW, "d1", G.GIANT_CHANCE)).toBeNull();
    expect(s.roll(VIEW, "d1", 0)?.id).toBe("giant");
    expect(s.roll(VIEW, "d1", 0)).toBeNull();
    expect(s.roll(VIEW, "d2", 0)?.id).toBe("giant");
  });

  it("he stops to watch, takes a photo, and his first sighting of each goes in his life story", () => {
    const t = showTime(VIEW);
    const s = at(t);
    s.meters.mood = 50;
    const xp = s.xp;
    s.giantAt(VIEW);
    expect(s.meters.mood).toBe(50 + G.GIANT_FX.mood!);
    expect(s.xp).toBe(xp + G.GIANT_FX.xp!);
    expect(s.history.entries.at(-1)?.text).toBe("⛰ From Hill View he saw a giant asleep on the far hills, breathing as slowly as the clouds. He stopped to watch and took a photo");
    expect(s.giants.photos).toEqual({ giant: { place: "Hill View", city: "Bigtown, A-land", t } });
    expect(s.chronicle.lines.map((l) => l.text)).toContain("Saw a sleeping giant from Hill View, Bigtown, A-land");
    // A second sighting another day keeps the first photo and adds no life-story line.
    const t2 = showTime({ ...VIEW, name: "Other View" }, t + DAY);
    s.now = () => t2;
    const lines = s.chronicle.lines.length;
    s.giantAt({ ...VIEW, name: "Other View" });
    expect(s.giants.seen).toEqual({ giant: 2 });
    expect(s.giants.photos.giant?.place).toBe("Hill View");
    expect(s.chronicle.lines).toHaveLength(lines);
  });

  it("the Collection shows each as a Legendary tile with its photo, and the badge counts kinds", () => {
    const s = at(T0);
    s.giants.note(G.GIANTS[1]!, "Old Port", "Bigtown, A-land", T0);
    const entries = SETS.find((x) => x.id === "giants")!.entries(s);
    expect(entries.map((e) => e.id)).toEqual(G.GIANTS.map((g) => g.id));
    expect(entries.every((e) => e.rarity === "Legendary")).toBe(true);
    expect(entries.find((e) => e.id === "kraken")).toMatchObject({ got: true, info: "Photo from Old Port, Bigtown, A-land" });
    expect(entries.find((e) => e.id === "serpent")).toMatchObject({ got: false, info: "Seen from a ferry terminal or a swimming lake, very rarely" });
    expect(FEATS.find((f) => f.id === "giants")!.count(s)).toBe(1);
  });

  it("the save keeps them, and an old save starts with none", () => {
    const s = at(T0);
    s.giants.note(G.GIANTS[0]!, "Pier", "Bigtown, A-land", T0);
    expect(Stats.fromJSON(JSON.parse(JSON.stringify(s))).giants.toJSON()).toEqual(s.giants.toJSON());
    const old = JSON.parse(JSON.stringify(new Stats()));
    delete old.giants;
    expect(Stats.fromJSON(old).giants.toJSON()).toEqual({ seen: {}, photos: {}, day: "" });
  });

  it("the quest bank has a giant quest and event", () => {
    const bank = JSON.parse(dataFile("quests.json")) as { quests: { id: string; fantasy?: boolean }[]; events: { id: string; at: string[] }[] };
    expect(bank.quests.find((q) => q.id === "giants_footprints")?.fantasy).toBe(true);
    expect(bank.events.find((e) => e.id === "shadow_under_the_water")?.at).toEqual(["harbor", "ferry_terminal"]);
  });
});
