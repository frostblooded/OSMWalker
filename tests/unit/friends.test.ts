// The people in his life (src/core/friends.ts): locals and their hearts, meet-ups, a partner, fellow travellers.
import { describe, expect, it } from "vitest";
import * as F from "../../src/core/friends";
import { Rng, seedOf } from "../../src/core/rng";
import * as B from "../../src/core/bond";
import { Stats } from "../../src/core/stats";
import { dataFile } from "../support/data";

const DATA = JSON.parse(dataFile("friends.json")) as F.FriendData;

/** An Rng whose rolls come from `rolls` in turn, and whose picks take the first. */
const fixed = (...rolls: number[]) => ({ randf: () => rolls.shift() ?? 0, pick: <T>(l: readonly T[]) => l[0]! }) as unknown as Rng;
const at = (over: Partial<F.Spot> = {}): F.Spot => ({ city: "Sofia, Bulgaria", place: "Cafe", kind: "cafe", lat: 42.7, lon: 23.3, t: 1000, ...over });
const local = (over: Partial<F.Friend> = {}): F.Friend => ({ id: "x", name: "Ana", icon: "👩", city: "Sofia, Bulgaria", kind: "cafe", place: { name: "Cafe", lat: 42.7, lon: 23.3 }, hearts: 1, met: 0, seen: 0, ...over });

describe("friends", () => {
  it("has sound data in data/friends.json", () => {
    expect(DATA.names.length).toBeGreaterThanOrEqual(20);
    expect(new Set(DATA.names).size).toBe(DATA.names.length);
    expect(DATA.icons.length).toBeGreaterThan(0);
    expect(DATA.companions.length).toBeGreaterThanOrEqual(4);
    for (const c of DATA.companions) expect(c.lines.length, c.who).toBeGreaterThan(0);
  });

  it("meets a new local now and then where he knows no one who hangs out there", () => {
    const f = new F.Friends();
    expect(f.stop(at(), DATA, fixed(F.NEW_CHANCE))).toBe("");
    expect(f.stop(at(), DATA, fixed(0))).toBe(`🧑 Got talking with Ana at Cafe (♥)`);
    expect(f.list[0]).toMatchObject({ name: "Ana", city: "Sofia, Bulgaria", kind: "cafe", hearts: 1, met: 1000, place: { name: "Cafe", lat: 42.7, lon: 23.3 } });
    expect(f.list[0]!.id).toBe("Sofia, Bulgaria|Cafe|1000");
  });

  it("runs into a local again at the kind of place they hang out at, a heart each time", () => {
    const f = new F.Friends();
    f.list = [local()];
    expect(f.stop(at({ t: 2000 }), DATA, fixed(F.SEE_CHANCE))).toBe("");
    expect(f.stop(at({ place: "Other Cafe", t: 2000 }), DATA, fixed(0))).toBe("👩 Ran into Ana again at Other Cafe (♥♥)");
    expect(f.list[0]).toMatchObject({ hearts: 2, seen: 2000 });
    // Not in another city.
    expect(f.stop(at({ city: "Plovdiv, Bulgaria" }), DATA, fixed(1))).toBe("");
  });

  it(`meets up on purpose anywhere in their city from ${F.MEET_UP_AT} hearts`, () => {
    const f = new F.Friends();
    f.list = [local({ hearts: F.MEET_UP_AT - 1 })];
    expect(f.stop(at({ place: "Park", kind: "park" }), DATA, fixed(1))).toBe("");
    f.list[0]!.hearts = F.MEET_UP_AT;
    expect(f.stop(at({ place: "Park", kind: "park" }), DATA, fixed(0))).toBe(`👩 Met up with Ana on purpose at Park (${F.hearts(F.MEET_UP_AT + 1)})`);
  });

  it(`becomes his partner at ${F.HEARTS_MAX} hearts, only one, and hearts stop there`, () => {
    const f = new F.Friends();
    f.list = [local({ hearts: F.HEARTS_MAX - 1 }), local({ id: "y", name: "Ben", hearts: F.HEARTS_MAX - 1 })];
    expect(f.stop(at(), DATA, fixed(0))).toMatch(/Ana and he are a couple now$/);
    expect(f.partnerOf()?.name).toBe("Ana");
    f.stop(at(), DATA, fixed(0));
    expect(f.list[0]!.hearts).toBe(F.HEARTS_MAX);
    f.list = f.list.reverse();
    expect(f.stop(at(), DATA, fixed(0))).not.toMatch(/couple/);
    expect(f.partner).toBe("x");
  });

  it(`keeps ${F.PER_CITY} locals a city; the one with fewest hearts makes room, never his partner`, () => {
    const f = new F.Friends();
    f.list = Array.from({ length: F.PER_CITY }, (_, i) => local({ id: `${i}`, kind: `k${i}`, hearts: i === 0 ? 0 : 3 }));
    f.partner = "0";
    f.list.push(local({ id: "far", city: "Plovdiv, Bulgaria", hearts: 0 }));
    f.stop(at({ kind: "new" }), DATA, fixed(0));
    expect(f.list.map((g) => g.id)).not.toContain("1");
    expect(f.list.map((g) => g.id)).toEqual(expect.arrayContaining(["0", "far"]));
    expect(f.list.filter((g) => g.city === "Sofia, Bulgaria")).toHaveLength(F.PER_CITY);
  });

  it(`takes along a fellow traveller now and then, who splits the fare and chats for ${F.COMPANION_STOPS} stops`, () => {
    const f = new F.Friends();
    expect(f.board(1000, DATA, fixed(F.COMPANION_CHANCE))).toEqual({ back: 0, with: "" });
    const c = DATA.companions[0]!;
    expect(f.board(1000, DATA, fixed(0))).toEqual({ back: 1000 * F.SPLIT, with: `; a ${c.who} ${c.icon} joins him and they split the fare` });
    for (let i = 0; i < F.COMPANION_STOPS; i++) expect(f.stop(at(), DATA, fixed(0))).toBe(`${c.icon} The ${c.who} at Cafe: "${c.lines[0]}"`);
    expect(f.stop(at(), DATA, fixed(0))).toBe(`${c.icon} The ${c.who} goes their own way at Cafe.`);
    expect(f.companion).toBeNull();
  });

  it("keeps a fellow traveller still along through the next trip, with no second one", () => {
    const f = new F.Friends();
    f.board(1000, DATA, fixed(0));
    f.stop(at(), DATA, fixed(0));
    const along = f.companion;
    expect(f.board(1000, { ...DATA, companions: [DATA.companions[1]!] }, fixed(0))).toEqual({ back: 0, with: "" });
    expect(f.companion).toBe(along);
    expect(f.companion!.left).toBe(F.COMPANION_STOPS);
  });

  it("brings his partner on every trip, and then no stranger joins", () => {
    const f = new F.Friends();
    f.list = [local()];
    f.partner = "x";
    expect(f.board(1000, DATA, fixed(0))).toEqual({ back: 0, with: ", with Ana 👩" });
    expect(f.companion).toBeNull();
  });

  it("survives the save, and repairs a broken one", () => {
    const f = new F.Friends();
    f.list = [local({ hearts: 4 })];
    f.partner = "x";
    f.board(0, { ...DATA }, fixed(0, 0));
    const back = F.Friends.fromJSON(JSON.parse(JSON.stringify(f)));
    expect(back).toEqual(f);
    expect(F.Friends.fromJSON(undefined)).toEqual(new F.Friends());
    const bad = F.Friends.fromJSON({ list: [local({ hearts: 99 }), null, { id: 1 }, { id: "y", name: "Ben" }], partner: "gone", companion: { who: "x", lines: [] } });
    expect(bad.list).toHaveLength(1);
    expect(bad.list[0]!.hearts).toBe(F.HEARTS_MAX);
    expect(bad).toMatchObject({ partner: "", companion: null });
    for (const companion of [{ who: "x", icon: "🎒", lines: ["Hi"] }, { who: "x", lines: ["Hi"], left: 2 }, { who: "x", icon: "🎒", lines: ["Hi"], left: 0 }])
      expect(F.Friends.fromJSON({ companion }).companion, JSON.stringify(companion)).toBeNull();
  });
});

describe("friends in his stats", () => {
  it("brings a friend at a stop with no incident or Viktor, only while the deck is loaded", () => {
    const s = new Stats();
    s.where.city = "Sofia, Bulgaria";
    s.now = () => 1000;
    s.friendData = DATA;
    const cafe = { name: "Cafe", class: "cafe", lat: 42.7, lon: 23.3 };
    expect(s.happen(cafe, 12, fixed(0.5, 0.99, 0))).toBe("");
    s.incidents = [{ id: "t", tone: "good", text: "x", options: [] } as never];
    // The storyteller's roll (nothing), Viktor not in town, then a new local.
    const line = s.happen(cafe, 12, fixed(0.5, 0.99, 0));
    expect(line).toBe("🧑 Got talking with Ana at Cafe (♥)");
    expect(s.incidentLatest()).toBe(true);
    expect(s.friends.list).toHaveLength(1);
  });

  it("splits the fare with a fellow traveller and names his partner on the ride", () => {
    const s = new Stats();
    s.cents = 5000;
    s.friendData = { ...DATA, companions: [] };
    expect(s.ride(1000, "train", "Central", "Plovdiv, Bulgaria")).toBe("Took the train to Plovdiv, Bulgaria from Central (-€10)");
    s.friends.list = [local()];
    s.friends.partner = "x";
    expect(s.ride(1000, "train", "Central", "Plovdiv, Bulgaria")).toBe("Took the train to Plovdiv, Bulgaria from Central, with Ana 👩 (-€10)");
    expect(s.cents).toBe(3000);
  });

  it("gets half the fare back from a fellow traveller, but never half a fine", () => {
    const s = new Stats();
    s.cents = 5000;
    s.friendData = { ...DATA, companions: [DATA.companions[0]!] };
    // Dice where a companion joins this ride.
    const joins = (n: number) => new Rng(seedOf(`Plovdiv, BulgariaCentral${n}`)).randf() < F.COMPANION_CHANCE;
    let t = 0;
    while (!joins(t)) t++;
    s.now = () => t;
    const c = DATA.companions[0]!;
    expect(s.ride(1000, "train", "Central", "Plovdiv, Bulgaria")).toBe(`Took the train to Plovdiv, Bulgaria from Central; a ${c.who} ${c.icon} joins him and they split the fare (-€5)`);
    expect(s.cents).toBe(4500);
    expect(s.friends.companion).not.toBeNull();
    // A rascal caught without a ticket pays all of his fine, whoever joins.
    const r = new Stats();
    r.cents = 5000;
    r.friendData = s.friendData;
    r.now = () => t;
    r.bond.lean = -100;
    const caught = Array.from({ length: 2000 }, (_, i) => i).find((i) => {
      const d = new Rng(seedOf(`Central${i}`));
      return d.randf() < B.DODGE_CHANCE && d.randf() < B.CAUGHT_CHANCE && joins(i);
    })!;
    r.now = () => caught;
    expect(r.ride(1000, "bus", "Central", "Plovdiv, Bulgaria")).toMatch(/got caught and was fined; a .* joins him \(-€20\)$/);
    expect(r.cents).toBe(5000 - 1000 * B.FINE_MULT);
  });

  it("keeps his friends in the save; an old save has met no one", () => {
    const s = new Stats();
    s.friends.list = [local()];
    expect(Stats.fromJSON(JSON.parse(JSON.stringify(s))).friends.list).toEqual(s.friends.list);
    const old = JSON.parse(JSON.stringify(s));
    delete old.friends;
    expect(Stats.fromJSON(old).friends).toEqual(new F.Friends());
  });
});
