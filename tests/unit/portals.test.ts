// Portals: which places open, how rarely, where they lead.
import { describe, expect, it } from "vitest";
import { FEATS } from "../../src/core/collection";
import * as P from "../../src/core/portals";
import { Rng, seedOf } from "../../src/core/rng";
import { Stats, type Place } from "../../src/core/stats";
import { fare, MODES, parseCities, rideS, Trips } from "../../src/core/trips";
import { dataFile } from "../support/data";

const DAY = 86_400;
const T0 = 1_800_000_000;
const CITIES = "Bigtown\tAAA\tA-land\t0.0\t0.0\t1000000\nNexttown\tAAA\tA-land\t1.0\t0.0\t500000\nFarcity\tBBB\tB-land\t10.0\t10.0\t3000\nNeartown\tAAA\tA-land\t0.05\t0.0\t9000000\n";
const TRIPS = new Trips(parseCities(CITIES));
const place = (name: string, cls: string, sub: string, lat = 0, lon = 0): Place => ({ name, class: cls, subclass: sub, rank: 1, lat, lon });
const ARCH = place("Old Arch", "monument", "monument");
/** A time from `t` on at which `p`'s own dice open a portal. */
function openTime(p: Place, t = T0): number {
  while (new Rng(seedOf(`portal${t}${p.name}`)).randf() >= P.PORTAL_CHANCE) t += 60;
  return t;
}
const at = (t: number) => {
  const s = new Stats();
  s.now = () => t;
  return s;
};

describe("portals", () => {
  it("are real monuments and castle ruins", () => {
    expect(P.isPortalPlace(ARCH)).toBe(true);
    expect(P.isPortalPlace(place("Ruin", "castle", "ruins"))).toBe(true);
    expect(P.isPortalPlace(place("Castle", "castle", "castle"))).toBe(false);
    expect(P.isPortalPlace(place("Cafe", "cafe", "cafe"))).toBe(false);
    expect(P.isPortalPlace({ ...ARCH, made: true })).toBe(false);
  });

  it("open with PORTAL_CHANCE, never within PORTAL_GAP_DAYS of the last one", () => {
    const p = new P.Portals();
    expect(p.opens(T0, P.PORTAL_CHANCE - 0.01)).toBe(true);
    expect(p.opens(T0, P.PORTAL_CHANCE)).toBe(false);
    p.note(T0, "Farcity, B-land");
    expect(p.opens(T0 + (P.PORTAL_GAP_DAYS * DAY - 60), 0)).toBe(false);
    expect(p.opens(T0 + P.PORTAL_GAP_DAYS * DAY, 0)).toBe(true);
  });

  it("take him free and at once to a city he has never been to, says so and writes his first in his life story", () => {
    expect(rideS("portal", 5_000_000)).toBe(0);
    expect(fare("portal", 5_000_000)).toBe(0);
    expect(MODES.portal.how).toBe("through a portal");
    const t = openTime(ARCH);
    const s = at(t);
    s.arrive("Bigtown, A-land", "AAA", "A-land");
    s.arrive("Nexttown, A-land", "AAA", "A-land");
    const to = s.portalAt(ARCH, TRIPS);
    // Bigtown and Nexttown are known, Neartown is closer than SAME_CITY_M.
    expect(to?.name).toBe("Farcity");
    expect(to?.bounds).toBeDefined();
    expect(s.portals.toJSON()).toEqual({ last: t, went: ["Farcity, B-land"] });
    expect(s.history.entries.at(-1)?.text).toBe("🌀 The old stones of Old Arch shimmered like a door, and he stepped through");
    expect(s.chronicle.lines.map((l) => l.text)).toContain("Stepped through a portal at Old Arch and came out in Farcity, B-land");
    expect(s.landRide("portal", 0, "Farcity, B-land")).toBe("🌀 Stepped out in Farcity, B-land, blinking. Nobody saw him arrive");
  });

  it("stay shut on the wrong dice, within the gap, on a quest, at other places, or with nowhere new to go", () => {
    const t = openTime(ARCH);
    let closed = t + 60;
    while (new Rng(seedOf(`portal${closed}${ARCH.name}`)).randf() < P.PORTAL_CHANCE) closed += 60;
    expect(at(closed).portalAt(ARCH, TRIPS)).toBeNull();
    const gap = at(t);
    gap.portals.note(t - DAY, "Farcity, B-land");
    expect(gap.portalAt(ARCH, TRIPS)).toBeNull();
    const quest = at(t);
    quest.quests.active = { id: "x" } as unknown as Stats["quests"]["active"];
    expect(quest.portalAt(ARCH, TRIPS)).toBeNull();
    expect(at(t).portalAt({ ...ARCH, class: "cafe" }, TRIPS)).toBeNull();
    const everywhere = at(t);
    for (const [c, k, n] of [["Bigtown", "AAA", "A-land"], ["Nexttown", "AAA", "A-land"], ["Farcity", "BBB", "B-land"]]) everywhere.arrive(`${c}, ${n}`, k!, n!);
    expect(everywhere.portalAt(ARCH, TRIPS)).toBeNull();
    expect(everywhere.portals.went).toEqual([]);
  });

  it("the save keeps them, an old save starts with none, and the Collection badge counts them", () => {
    const s = new Stats();
    s.portals.note(T0, "Farcity, B-land");
    expect(Stats.fromJSON(JSON.parse(JSON.stringify(s))).portals.toJSON()).toEqual({ last: T0, went: ["Farcity, B-land"] });
    const old = JSON.parse(JSON.stringify(new Stats()));
    delete old.portals;
    expect(Stats.fromJSON(old).portals.toJSON()).toEqual({ last: 0, went: [] });
    expect(FEATS.find((f) => f.id === "portals")!.count(s)).toBe(1);
  });

  it("the quest bank has a portal quest and event at monuments and castles that give Magic", () => {
    const bank = JSON.parse(dataFile("quests.json")) as { quests: { id: string; fantasy?: boolean; reward: { fx?: Record<string, number> } }[]; events: { id: string; at: string[]; win: { fx?: Record<string, number> } }[] };
    const q = bank.quests.find((x) => x.id === "shimmering_arch")!;
    expect(q.fantasy).toBe(true);
    expect(q.reward.fx?.magic).toBeGreaterThan(0);
    const e = bank.events.find((x) => x.id === "shimmer_in_the_stones")!;
    expect(e.at).toEqual(["monument", "castle"]);
    expect(e.win.fx?.magic).toBeGreaterThan(0);
  });
});
