// The game loop with real Sofia streets, fake servers and fixed dice: walking, needs, stories, keepsakes and saves.
import { describe, expect, it, vi } from "vitest";
import { distanceM } from "../../src/core/geo";
import { cellKey } from "../../src/core/graph";
import { CREATURE_CHANCE, meetingDice } from "../../src/core/creatures";
import { decode, encode } from "../../src/core/postcard";
import type { Forecast } from "../../src/core/forecast";
import { EXPLORE_PULL } from "../../src/core/activities";
import { FAIRY_CHANCE, FAIRY_FROM_H } from "../../src/core/fairy";
import { PORTAL_CHANCE } from "../../src/core/portals";
import { Rng, seedOf } from "../../src/core/rng";
import { type Place, Stats, visitKey } from "../../src/core/stats";
import { MOMENT_S } from "../../src/core/moments";
import * as R from "../../src/core/repute";
import { Game, RIVAL_OFFSET_DEG, SAVE_KEY, type GameDeps } from "../../src/game/game";
import { look } from "../../src/game/hud";
import { Api } from "../../src/net/api";
import { dataFile } from "../support/data";
import { WEST, START, CAFE, BUS, game, run, tick } from "../support/game";

describe("game", () => {
  it("starts walking in a city once the streets there load", async () => {
    const { g } = game();
    expect(await g.startCity("Sofia, Bulgaria", ...START, null)).toBe("");
    expect(g.walker).not.toBeNull();
    expect(g.country).toBe("BGR");
    expect(g.walker!.graph.cells.has(cellKey(WEST))).toBe(true);
    await tick();
    run(g, 30);
    expect(g.walker!.totalM).toBeCloseTo(30 * (5 / 3.6), 3); // 5 km/h on foot
  });

  it("opens a care package at the place he reaches next", async () => {
    const { g } = game({ places: [CAFE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.care.clovers = 2;
    g.sendGift("guide");
    expect(g.stats.care.clovers).toBe(0);
    run(g, 400);
    const texts = g.stats.history.entries.map((e) => e.text);
    const reached = texts.findIndex((t) => t.startsWith("Reached Cafe Near"));
    expect(texts[reached + 1]).toBe("Opened your care package: 📖 City guide! Thank you! (+2 Wits for 4 h)");
    expect(g.stats.buffNames()).toContain("City guide");
  });

  it("writes a postcard of where he is, signed with a name that is remembered", async () => {
    const { g, storage } = game({ places: [CAFE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    run(g, 400);
    g.setPostcardName("Ivan");
    const card = g.postcard();
    expect(card).toMatchObject({ from: "Ivan", city: "Sofia, Bulgaria", level: g.stats.level, line: g.stats.history.latest() });
    expect(card.place).toBe(g.walker!.place?.name ?? g.walker!.streetName());
    expect(decode(encode(card))).toEqual(card);
    const again = new Game({ ...(g as unknown as { deps: GameDeps }).deps, storage });
    expect(again.postcardName).toBe("Ivan");
  });

  it("says when the streets can't load", async () => {
    const { g } = game({ fail: true });
    expect(await g.startCity("Sofia, Bulgaria", ...START, null)).toBe("Couldn't load streets. Check your connection and try again.");
    expect(g.problems.warnings.map((w) => w.text)).toContain("Couldn't load the streets where he starts in Sofia, Bulgaria");
  });

  it("a strong need picks his goal and the feed says so", async () => {
    const { g } = game({ places: [CAFE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.meters.thirst = 5;
    g.walker!.forceNewGoal();
    expect(g.stats.history.entries.some((e) => e.text === "Thirsty, heading for Cafe Near")).toBe(true);
  });

  it("hands his stats the jokes and forecasts, and jokes fit the kind of place", async () => {
    const { g } = game({ places: [CAFE] });
    const forecasts: Forecast[] = [{ id: "cafe", icon: "☕", text: "Cafés feel {n} as good today", effect: "mood", kind: "cafe", mult: 2 }];
    Object.assign(g.data, { jokes: { cafe: ["Cafe joke."], _generic: ["Other joke."] }, forecasts });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    expect(g.stats.forecast().id).toBe("cafe");
    // Every line he says, not only the feed's last ones: a joke comes on one in eight.
    const texts: string[] = [];
    g.stats.onSay = (l) => texts.push(l);
    // An hour at a time until a joke comes, at most half a day.
    for (let h = 0; h < 12 && !texts.some((t) => t.endsWith(" joke.")); h++) run(g, 3600);
    expect(texts.some((t) => / at Cafe Near.* Cafe joke\.$/.test(t))).toBe(true);
    expect(texts.some((t) => / at Cafe Near.* Other joke\.$/.test(t))).toBe(false);
  });

  it("hands his stats the incident deck, and the storyteller brings one at a place he reaches, on its own dice", async () => {
    const plain = game({ places: [CAFE] }).g;
    await plain.startCity("Sofia, Bulgaria", ...START, null);
    const { g } = game({ places: [CAFE] });
    Object.assign(g.data, { incidents: [{ id: "dog", icon: "🐕", tone: "good", text: "A dog at {PLACE}.", say: "It wags." }, { id: "mime", icon: "🤡", tone: "odd", text: "A mime at {PLACE}.", say: "He copies him." }] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    expect(g.stats.incidents).toHaveLength(2);
    plain.stats.story.tension = g.stats.story.tension = 100;
    // One clock for both, so the dice seeded from the time (a local word, a spell, his wants, …) roll the same.
    plain.stats.now = g.stats.now = () => 1_800_000_000;
    run(plain, 3 * 3600);
    run(g, 3 * 3600);
    const texts = g.stats.history.entries.map((e) => e.text);
    expect(texts.some((t) => /^(🐕 A dog|🤡 A mime) at Cafe Near/.test(t))).toBe(true);
    // His walk is the same as without incidents.
    expect(g.walker!.totalM).toBeCloseTo(plain.walker!.totalM, 6);
  });

  it("rolls the city's quest board, shows it on the map, takes a quest on and walks its steps", async () => {
    const cafes = Array.from({ length: 20 }, (_, i): Place => ({ ...CAFE, name: `Cafe ${i}`, lat: CAFE.lat + (i % 5) * 0.0004, lon: CAFE.lon - Math.floor(i / 5) * 0.0005 }));
    const { g, storage } = game({ places: [...cafes, BUS] });
    const quest = { id: "q", icon: "🧪", title: "Test quest", items: ["a box"], lean: "wit", twists: [], good: ["Good."], worse: ["Worse."], reward: { eur: 10 }, steps: [{ at: ["cafe"], say: ["{GIVER} at {PLACE} has {ITEM}."] }, { at: ["bus"], say: ["He takes {ITEM} to {PLACE}."] }] };
    Object.assign(g.data, { quests: { names: ["Ana"], quests: [quest], events: [] } });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    run(g, 2 * 3600);
    const texts = g.stats.history.entries.map((e) => e.text);
    expect(texts).toContain("❗ New quest: Test quest, for Ana at " + texts.find((t) => t.startsWith("❗ New quest"))!.split(" at ").at(-1));
    expect(texts.some((t) => t === "🧪 He takes a box to Central Bus.")).toBe(true);
    expect(g.stats.quests.log.at(-1)?.title).toBe("Test quest");
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).stats.quests.done).toContain("q:Ana:0");
  });

  it("deals the listed city's own quests first, however the search spelled the start city", async () => {
    const cafes = Array.from({ length: 20 }, (_, i): Place => ({ ...CAFE, name: `Cafe ${i}`, lat: CAFE.lat + (i % 5) * 0.0004, lon: CAFE.lon - Math.floor(i / 5) * 0.0005 }));
    const { g } = game({ places: [...cafes, BUS] });
    const q = (id: string, city?: string) => ({ id, city, icon: "🧪", title: `Quest ${id}`, items: ["a box"], lean: "wit", twists: [], good: ["Good."], worse: ["Worse."], reward: {}, steps: [{ at: ["cafe"], say: ["{GIVER} at {PLACE} has {ITEM}."] }, { at: ["bus"], say: ["At {PLACE}."] }] });
    Object.assign(g.data, { quests: { names: ["Ana"], quests: [q("a"), q("sofia", "Sofia, Bulgaria"), q("paris", "Paris, France")], events: [] } });
    await g.startCity("Sofia, Sofia City, Bulgaria", ...START, null);
    run(g, 60);
    g.walker!.forceNewGoal();
    expect(g.stats.quests.board[0]?.key).toBe("sofia");
    expect(g.stats.quests.board.some((o) => o.key === "paris")).toBe(false);
  });

  it("a tapped quest icon tells its story, and Go help sends him to it next", async () => {
    const cafes = Array.from({ length: 20 }, (_, i): Place => ({ ...CAFE, name: `Cafe ${i}`, lat: CAFE.lat + (i % 5) * 0.0004, lon: CAFE.lon - Math.floor(i / 5) * 0.0005 }));
    const { g } = game({ places: [...cafes, BUS] });
    const q = (id: string) => ({ id, icon: "🧪", title: `Quest ${id}`, items: ["a box"], lean: "wit", twists: [], good: ["Good."], worse: ["Worse."], reward: {}, steps: [{ at: ["cafe"], say: ["{GIVER} at {PLACE} has {ITEM}."] }, { at: ["bus"], say: ["At {PLACE}."] }] });
    Object.assign(g.data, { quests: { names: ["Ana"], quests: [q("a"), q("b")], events: [] } });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    run(g, 60);
    g.walker!.forceNewGoal();
    expect(g.stats.quests.board.length).toBe(2);
    const icon = g.questIcons().find((i) => i.icon === "quest")!;
    expect(g.placeIcons()).toContainEqual(icon);
    const card = g.storyCard(icon.id)!;
    expect(card.text).toMatch(/^Ana at Cafe \d+ has a box\.$/);
    expect(card.state).toBe("open");
    g.nudge(icon.id);
    expect(g.storyCard(icon.id)!.state).toBe("nudged");
    g.walker!.forceNewGoal();
    expect(`quest:${g.stats.quests.active?.key}`).toBe(icon.id);
    expect(g.questIcons().some((i) => i.pulse)).toBe(true);
    const on = g.storyCard(icon.id)!;
    expect(on.state).toBe("on");
    expect(on.rows[0]).toEqual(["👣 Step", `1 / 2`]);
  });

  it("hands his stats the contests, and gives Viktor his chance at each stop with no incident", async () => {
    const { g } = game({ places: [CAFE] });
    Object.assign(g.data, { incidents: [{ id: "dog", icon: "🐕", tone: "good", text: "A dog at {PLACE}.", say: "It wags." }], contests: JSON.parse(dataFile("rival.json")) });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    expect(g.stats.contests.length).toBeGreaterThan(0);
    const meet = vi.spyOn(g.stats.rival, "meet");
    run(g, 400);
    // He reached the cafe with no incident (no tension yet), so Viktor got his chance there, with the contests.
    expect(meet).toHaveBeenCalledWith(g.stats, g.stats.contests, "Cafe Near", "cafe", [CAFE.lat, CAFE.lon], expect.anything());
  });

  it("hands his stats the friends data and their news, and gives a friend a chance at each stop with no incident or Viktor", async () => {
    const { g } = game({ places: [CAFE] });
    Object.assign(g.data, { incidents: [{ id: "dog", icon: "🐕", tone: "good", text: "A dog at {PLACE}.", say: "It wags." }], friends: JSON.parse(dataFile("friends.json")) });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    expect(g.stats.friendData.names.length).toBeGreaterThan(0);
    expect(g.stats.townNews).toEqual(g.stats.friendData.news);
    expect(g.stats.townNews.length).toBeGreaterThan(0);
    const stop = vi.spyOn(g.stats.friends, "stop");
    run(g, 400);
    expect(stop).toHaveBeenCalledWith(expect.objectContaining({ city: g.stats.where.city, place: "Cafe Near", kind: "cafe" }), g.stats.friendData, expect.anything());
  });

  it("shows Viktor beside him for a while after they meet, only in that city", async () => {
    const { g } = game({ places: [CAFE], clock: () => 2_000_000_000_000 });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    expect(g.rivalAt()).toBeNull();
    const r = g.stats.rival;
    Object.assign(r, { town: g.stats.where.city, inTown: true, seenUntil: 2_000_000_000 + 60, seenAt: [42.7, 23.3] });
    expect(g.rivalAt()).toEqual([42.7, 23.3 + RIVAL_OFFSET_DEG]);
    r.seenUntil = 2_000_000_000;
    expect(g.rivalAt()).toBeNull();
  });

  it("in a police chase the car follows the streets he ran, catching up, until the chase ends by his own pick", async () => {
    let now = 2_000_000_000_000;
    const { g } = game({ places: [CAFE], clock: () => now });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.law.addHeat(R.HEAT_MAX);
    g.stats.bond.lean = 100;
    const spot = vi.spyOn(g.stats, "reputeAt").mockImplementationOnce(() => true);
    for (let i = 0; i < 400 && !g.chase; i++) {
      now += 1000;
      g.step(1);
    }
    expect(spot).toHaveBeenCalled();
    const start = g.policeAt()!;
    expect(start).not.toBeNull();
    for (let i = 0; i < R.CHASE_S - 1; i++) {
      now += 1000;
      g.step(1);
    }
    // The car drives his own trail: it set off where he was spotted and is now between his last two spots.
    const trail = g.chase!.trail;
    expect(start).toEqual(trail[0]);
    const near = g.policeAt()!;
    const [a, b] = [trail.at(-2)!, trail.at(-1)!];
    for (const k of [0, 1]) {
      expect(near[k]!).toBeGreaterThanOrEqual(Math.min(a[k]!, b[k]!) - 1e-9);
      expect(near[k]!).toBeLessThanOrEqual(Math.max(a[k]!, b[k]!) + 1e-9);
    }
    now += 2000;
    g.step(1);
    // Caught up with: the timed choice asks how it ends, and the car waits by him.
    expect(g.moment?.m.id).toBe("police_chase");
    expect(g.policeAt()).not.toBeNull();
    for (let i = 0; i <= g.momentS && g.moment; i++) {
      now += 1000;
      g.step(1);
    }
    await Promise.resolve();
    expect(g.chase).toBeNull();
    expect(g.policeAt()).toBeNull();
    expect(g.stats.law.chases).toBe(1);
    // Left to himself, a saint gives himself up and pays.
    expect(g.stats.law.caught).toBe(1);
    expect(g.stats.law.heat).toBe(0);
    expect(g.stats.history.entries.some((e) => e.text.startsWith("🚓 Decided by himself: Gave himself up"))).toBe(true);
  });

  it("you pick how a police chase ends when the car catches up", async () => {
    let now = 2_000_000_000_000;
    const { g } = game({ places: [CAFE], clock: () => now });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.law.addHeat(R.HEAT_MAX);
    g.stats.bond.lean = 100;
    g.chase = { place: "Cafe", ends: now + 1000, trail: [g.walker!.position()] };
    now += 2000;
    g.step(1);
    expect(g.moment?.m.options.map((o) => o.id)).toContain("run");
    // The saint would give himself up; you make him run.
    g.settleMoment("run");
    await Promise.resolve();
    expect(g.chase).toBeNull();
    expect(g.stats.law.chases).toBe(1);
    expect(g.stats.law.caught + g.stats.law.escapes).toBe(1);
    const line = g.stats.history.entries.find((e) => e.text.startsWith("🚓 "))!.text;
    expect(line).toMatch(/^🚓 (Ran for it|Tried to run)/);
  });

  it("the police give up a chase once the heat is gone, and praise counts towards his best karma", async () => {
    let now = 2_000_000_000_000;
    const { g } = game({ places: [CAFE], clock: () => now });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.law.addHeat(R.HEAT_MAX);
    vi.spyOn(g.stats, "reputeAt").mockImplementationOnce(() => true);
    for (let i = 0; i < 400 && !g.chase; i++) {
      now += 1000;
      g.step(1);
    }
    expect(g.chase).not.toBeNull();
    // He runs on instead of stopping.
    expect(g.walker!.isResting()).toBe(false);
    g.stats.law.payOff();
    now += 1000;
    g.step(1);
    expect(g.chase).toBeNull();
    expect(g.stats.law.chases).toBe(0);
    expect(g.stats.history.latest()).toBe("🚓 The police gave up the chase");
    // Heading for a ride out loses them too, so jail never lands mid-trip.
    g.stats.law.addHeat(R.HEAT_MAX);
    g.chase = { place: "Cafe", ends: now + R.CHASE_S * 1000, trail: [g.walker!.position()] };
    g.walker!.departing = {} as never;
    now += 1000;
    g.step(1);
    expect(g.chase).toBeNull();
    expect(g.stats.history.latest()).toBe("🚓 He hurried off to catch his ride, and the police lost him");
    g.walker!.departing = null;
    for (let i = 0; i < 10; i++) {
      g.stats.say(`Did a thing ${i}`);
      now += 1000;
      g.stats.now = () => Math.floor(now / 1000);
      g.judge(1);
    }
    expect(g.stats.law.bestKarma).toBe(g.stats.bond.lean);
    expect(g.stats.law.bestKarma).toBeGreaterThan(0);
  });

  it("switches the storyteller from the menu and keeps it in the save", async () => {
    const { g, storage } = game({ places: [CAFE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    expect(g.stats.story.style).toBe("classic");
    g.nextStoryteller();
    expect(g.stats.story.style).toBe("chaotic");
    g.nextStoryteller();
    expect(g.stats.story.style).toBe("calm");
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).stats.story.style).toBe("calm");
  });

  it("an Explore whisper pulls each place he has never been to, not its whole kind", async () => {
    const OLD: Place = { ...CAFE, name: "Cafe Old", lat: 42.6875, lon: 23.3205 };
    const { g } = game({ places: [OLD, CAFE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.visit(OLD);
    const w = g.walker!;
    const ratio = () => w.weigh(CAFE).weight / w.weigh(OLD).weight;
    const before = ratio();
    [g.stats.bond.nudge, g.stats.bond.nudgeLeft] = ["explore", 600];
    expect(ratio()).toBeCloseTo(before * EXPLORE_PULL);
  });

  it("builds his bench at the park he reaches with enough golden bricks, and marks it on the map", async () => {
    const PARK: Place = { ...CAFE, name: "Park Near", class: "park", subclass: "park" };
    const { g } = game({ places: [PARK] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.stats.bricks.count = 100;
    run(g, 400);
    expect(g.stats.bricks.built).toMatchObject([{ kind: 0, park: "Park Near", city: "Sofia, Bulgaria" }]);
    expect(g.stats.chronicle.lines.map((l) => l.text)).toContain("Built a bench with his name in Park Near, Sofia, Bulgaria");
    expect(g.placeIcons().some((i) => i.icon === "plaque")).toBe(true);
  });

  it("meets the dryad at a park he reaches, once that day, and the feed says what he picked", async () => {
    const PARK: Place = { ...CAFE, name: "Park Near", class: "park", subclass: "park" };
    const { g } = game({ places: [PARK] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    // A time at which the dryad's own dice say she shows up at this park.
    let t = 1_800_000_000;
    while (meetingDice(t, PARK.name).randf() >= CREATURE_CHANCE) t += 60;
    g.stats.now = () => t;
    run(g, 400);
    await tick();
    expect(g.stats.creatures.met).toEqual({ dryad: 1 });
    // Untouched, the timed choice runs out and he takes her stories himself.
    expect(g.stats.history.entries.map((e) => e.text)).toContain("🌳 Decided by himself: Listened to a dryad's stories in Park Near");
  });

  it("asks you about a creature as a timed choice, and that stop asks nothing else", async () => {
    const PARK: Place = { ...CAFE, name: "Park Near", class: "park", subclass: "park" };
    const { g } = game({ places: [PARK], moments: true });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    let t = 1_800_000_000;
    while (meetingDice(t, PARK.name).randf() >= CREATURE_CHANCE) t += 60;
    g.stats.now = () => t;
    // The park's own moment skips this visit, not even settled by himself, so he walks on without another question.
    const places: string[] = [];
    const settle = g.stats.settleMoment.bind(g.stats);
    g.stats.settleMoment = (m, ...rest) => {
      places.push(m.id);
      return settle(m, ...rest);
    };
    for (let i = 0; i < 400 && !g.moment; i++) g.step(1);
    expect(g.moment!.m.id).toBe("dryad");
    expect(g.moment!.m.ask).not.toContain("{PLACE}");
    g.settleMoment("acorn");
    await tick();
    expect(g.stats.history.entries.at(-1)!.text).toBe("🌳 Got an acorn from a dryad in Park Near");
    for (let i = 0; i < 400 && g.walker!.isResting(); i++) {
      g.step(1);
      if (g.moment) places.push(g.moment.m.id);
    }
    await tick();
    expect(places).toEqual([]);
  });

  it("an untouched creature goes by his pick and Wits of when it asked, as away", async () => {
    const BRIDGE: Place = { ...CAFE, name: "Old Bridge", class: "bridge", subclass: "bridge" };
    // Several meeting times, so a pick or riddle worked out later, on his new Wits or the dice of a later time, would differ for some.
    const lines: string[] = [];
    for (let n = 0, t = 1_800_000_000; n < 24; t += 60) {
      if (meetingDice(t, BRIDGE.name).randf() >= CREATURE_CHANCE) continue;
      n++;
      const { g } = game({ places: [BRIDGE], moments: true });
      await g.startCity("Sofia, Bulgaria", ...START, null);
      g.stats.cents = 100_000;
      // Clever enough that he sometimes tries the riddle himself.
      g.stats.addBuff({ name: "Sharp", min: 600, attrs: { wit: 4 } });
      let now = t;
      g.stats.now = () => now;
      for (let i = 0; i < 400 && !g.moment; i++) g.step(1);
      expect(g.moment!.m.id).toBe("troll");
      // Away, he would settle it at once on what he is now.
      const away = Object.assign(Stats.fromJSON(JSON.parse(JSON.stringify(g.stats.toJSON()))), { creatureKinds: g.stats.creatureKinds });
      const troll = g.stats.creatureKinds.find((c) => c.id === "troll")!;
      const line = away.meet(troll, BRIDGE.name, away.creaturePick(troll, BRIDGE.name, t), { you: false, t, attr: (a) => away.attr(a) });
      // Watched, his Wits fall away while the sheet is open (a riddle tried on them works only at the base odds), then the bar runs out.
      g.stats.addBuff({ name: "Muddled", min: 600, attrs: { wit: -100 } });
      now += MOMENT_S;
      run(g, MOMENT_S);
      await tick();
      expect(g.stats.history.entries.map((e) => e.text)).toContain(line);
      lines.push(line);
    }
    expect(lines.some((l) => l.includes("riddle"))).toBe(true);
  });

  it("a police chase that starts at a creature's stop answers the creature himself, so he runs on", async () => {
    const PARK: Place = { ...CAFE, name: "Park Near", class: "park", subclass: "park" };
    const { g } = game({ places: [PARK], moments: true });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    let t = 1_800_000_000;
    while (meetingDice(t, PARK.name).randf() >= CREATURE_CHANCE) t += 60;
    g.stats.now = () => t;
    let chased = 0;
    g.stats.reputeAt = () => ++chased > 0;
    for (let i = 0; i < 400 && !chased; i++) g.step(1);
    expect(chased).toBe(1);
    // No sheet holds him still: the dryad got his own pick as the chase began.
    expect(g.moment).toBeNull();
    await tick();
    expect(g.stats.history.entries.map((e) => e.text)).toContain("🌳 Decided by himself: Listened to a dryad's stories in Park Near");
  });

  it("works out the ley lines from the loaded places and fills Magic as he walks along one", async () => {
    const CHURCH: Place = { ...CAFE, name: "Church Near", class: "place_of_worship", subclass: "christian" };
    const STONE: Place = { ...BUS, name: "Old Monument", class: "monument", subclass: "monument" };
    const { g } = game({ places: [CHURCH, STONE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    // The monument stays a monument: no portal so soon after one.
    g.stats.portals.last = g.stats.now();
    const walked: number[] = [];
    const leyWalk = g.stats.leyWalk.bind(g.stats);
    g.stats.leyWalk = (m) => {
      walked.push(m);
      leyWalk(m);
    };
    run(g, 1200);
    expect(g.leys).toEqual([
      [
        [STONE.lat, STONE.lon],
        [CHURCH.lat, CHURCH.lon],
      ],
    ]);
    expect(walked.length).toBeGreaterThan(0);
    expect(walked.every((m) => m > 0 && m < 10)).toBe(true);
    expect(g.stats.magic).toBeGreaterThan(0);
    expect(g.stats.buffNames()).toContain("Ley-charmed");
    // Reaching them gives the burst too.
    expect(g.stats.lore.tapped.length).toBeGreaterThan(0);
  });

  it("a portal at a monument he reaches takes him at once to a city he has never been to, and the streets there load", async () => {
    const STONE: Place = { ...CAFE, name: "Old Monument", class: "monument", subclass: "monument" };
    const { g } = game({ places: [STONE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    // A time at which the monument's own dice open a portal.
    let t = 1_800_000_000;
    while (new Rng(seedOf(`portal${t}${STONE.name}`)).randf() >= PORTAL_CHANCE) t += 60;
    g.stats.now = () => t;
    run(g, 400);
    expect(g.stats.portals.went).toHaveLength(1);
    const to = g.stats.portals.went[0]!;
    expect(to).not.toBe("Sofia, Bulgaria");
    expect(g.city).toBe(to);
    const texts = g.stats.history.entries.map((e) => e.text);
    expect(texts).toContain("🌀 The old stones of Old Monument shimmered like a door, and he stepped through");
    expect(texts).toContain(`🌀 Stepped out in ${to}, blinking. Nobody saw him arrive`);
    expect(g.walker!.isTraveling()).toBe(false);
    // The jump marks no squares on the way: 400 s on foot crosses only a few.
    expect(g.stats.explored.size).toBeLessThan(10);
  });

  it("at dawn a fairy ring in a park he reaches may take him for a nap in place of an action, and he wakes with a gift or a story", async () => {
    const PARK: Place = { ...CAFE, name: "Park Near", class: "park", subclass: "park" };
    const { g } = game({ places: [PARK], hour: () => FAIRY_FROM_H });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    // A time at which the park's own dice take him.
    let t = 1_800_000_000;
    while (new Rng(seedOf(`fairy${t}${PARK.name}`)).randf() >= FAIRY_CHANCE) t += 60;
    g.stats.now = () => t;
    const napped: string[] = [];
    const doIt = g.stats.do.bind(g.stats);
    g.stats.do = (...a) => {
      napped.push(a[0].name);
      return doIt(...a);
    };
    for (let i = 0; i < 400 && !g.stats.rings.naps; i++) g.step(1);
    expect(g.stats.rings.naps).toBe(1);
    expect(g.doing?.name).toBe("Asleep in a fairy ring");
    expect(napped).toEqual([]);
    expect(g.stats.rings.gifts.length + g.stats.rings.stories.length).toBe(1);
    expect(g.stats.history.entries.some((e) => e.text.startsWith("🍄 Lay down in a ring of mushrooms in Park Near at dawn"))).toBe(true);
  });

  it("takes whispers and praise from you without touching his walk dice", async () => {
    const { g } = game({ places: [CAFE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    run(g, 400);
    expect(g.lastDeed()).not.toBeNull();
    const walkDice = (g as unknown as { rng: Rng }).rng;
    const next = new Rng(0);
    Object.assign(next, walkDice);
    for (let i = 0; i < 4; i++) g.whisper("eat");
    const whispers = g.stats.history.entries.filter((e) => e.text.startsWith("Heard a whisper"));
    expect(whispers).toHaveLength(3);
    expect(walkDice.randf()).toBe(next.randf());
    g.judge(1);
    g.judge(1);
    expect(g.stats.bond.lean).toBe(10);
  });

  it("walks to a place, does something there and rests", async () => {
    const { g } = game({ places: [CAFE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    run(g, 400);
    expect(g.stats.visited.size).toBeGreaterThan(0);
    expect(g.stats.history.entries.some((e) => e.text.startsWith("Reached Cafe Near"))).toBe(true);
    expect(g.debugLog.entries.some((e) => e.place === "Cafe Near")).toBe(true);
  });

  it("collects keepsakes where he is: a card and a Placedex entry at a landmark", async () => {
    const MUSEUM: Place = { ...CAFE, name: "Museum Near", class: "museum", subclass: "museum", rank: 1 };
    const { g } = game({ places: [MUSEUM] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    expect(g.stats.where).toEqual({ city: "Sofia, Bulgaria", code: "BGR", country: "Bulgaria" });
    run(g, 400);
    expect([...g.stats.keepsakes.cards.values()]).toMatchObject([{ name: "Museum Near", rarity: "Rare", city: "Sofia, Bulgaria" }]);
    expect(g.stats.keepsakes.dex.has("museum/museum")).toBe(true);
  });

  it("strikes a pose for what he does at a place", async () => {
    const { g } = game({ places: [CAFE] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    for (let i = 0; i < 400 && !g.walker!.isResting(); i++) run(g, 1);
    expect(g.walker!.isResting()).toBe(true);
    expect(g.doing).not.toBeNull();
    expect(look(g).pose).not.toBeNull();
  });

  it("notices a public holiday once, closes day businesses, fetches each country's list once a year, and keeps it on the device", async () => {
    const asked: string[] = [];
    const day = Date.UTC(2026, 2, 3, 10); // Liberation Day in Bulgaria
    const api = new Api(async (url) => {
      if (!url.includes("nager")) return new Response("", { status: 503 });
      asked.push(url);
      return new Response(JSON.stringify([{ date: "2026-03-03", name: "Liberation Day", localName: "Освобождение", global: true, types: ["Public"] }]));
    });
    const { g, storage } = game({ api, places: [CAFE], clock: () => day });
    // The code table and the list both arrive in the background.
    const settle = async (x: Game) => {
      for (let i = 0; i < 100 && !x.holiday; i++) {
        run(x, 1);
        await new Promise((r) => setTimeout(r, 5));
      }
    };
    await g.startCity("Sofia, Bulgaria", ...START, null);
    await settle(g);
    expect(g.holiday?.name).toBe("Liberation Day");
    expect(g.stats.sky?.holiday).toBe(true);
    const said = () => g.stats.history.entries.filter((e) => e.text.includes("Liberation Day")).map((e) => e.text);
    expect(said()).toEqual(["It's Liberation Day (Освобождение) here, a public holiday"]);
    run(g, 400);
    expect(said()).toHaveLength(1);
    expect(asked).toEqual(["https://date.nager.at/api/v3/PublicHolidays/2026/BG"]);
    const again = new Game({ ...(g as unknown as { deps: GameDeps }).deps, storage });
    again.load();
    await settle(again);
    expect(again.holiday?.name).toBe("Liberation Day");
    expect(asked).toHaveLength(1);
  });

  it("reads up on a big sight once, English Wikipedia first and then the country's, and tries again after a failed request", async () => {
    const MUSEUM: Place = { name: "Национален исторически музей", class: "museum", subclass: "museum", rank: 1, lat: 42.6885, lon: 23.3215 };
    const asked: string[] = [];
    let down = true;
    const api = new Api(async (url) => {
      if (!url.includes("wikipedia.org")) return new Response("", { status: 503 });
      asked.push(url.split(".wikipedia")[0]!.slice(8));
      if (down) return new Response("", { status: 503 });
      const title = url.startsWith("https://en.") ? "National History Museum (Bulgaria)" : "Национален исторически музей";
      return new Response(JSON.stringify({ query: { pages: { "1": { title, extract: "Най-големият музей (основан 1973) в България.", index: 1 } } } }));
    });
    let now = Date.UTC(2026, 9, 31, 10);
    const { g, storage } = game({ api, places: [MUSEUM], clock: () => now });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    const read = () => g.stats.history.entries.filter((e) => e.text.startsWith("📖")).map((e) => e.text);
    // Walks a minute at a time until `done`, at most 10 hours.
    const walk = async (done: () => boolean) => {
      for (let i = 0; i < 600 && !done(); i++) {
        run(g, 60);
        now += 60_000;
        await tick();
      }
    };
    // While Wikipedia is down he asks again at a later visit.
    await walk(() => asked.length > 1);
    expect(asked.length).toBeGreaterThan(1);
    expect(read()).toEqual([]);
    expect(new Set(asked)).toEqual(new Set(["en"]));
    expect(g.stats.sightNotes.knows(visitKey(MUSEUM))).toBe(false);
    down = false;
    // The English article has another name, so the Bulgarian one is read.
    await walk(() => read().length > 0);
    expect(read()).toEqual(["📖 Read up on Национален исторически музей: Най-големият музей в България."]);
    expect(asked.slice(-2)).toEqual(["en", "bg"]);
    // Two more visits ask nothing more.
    const n = asked.length;
    const visits = () => g.stats.history.entries.filter((e) => e.text.startsWith("Reached")).length;
    const was = visits();
    await walk(() => visits() >= was + 2);
    expect(visits()).toBeGreaterThanOrEqual(was + 2);
    expect(asked).toHaveLength(n);
    g.save();
    const again = new Game({ ...(g as unknown as { deps: GameDeps }).deps, storage });
    again.load();
    expect(again.stats.sightNotes.read).toEqual([visitKey(MUSEUM)]);
  });

  it("collects the named streets he walks in his city, each once, and keeps them in the save", async () => {
    // The streets by the café and the bus station have no names in these tiles, so he heads for a corner of a named one.
    const probe = game().g;
    await probe.startCity("Sofia, Bulgaria", ...START, null);
    const graph = probe.walker!.graph;
    const corner = [...graph.nodes.keys()].find((id) => graph.neighbors(id).some((n) => graph.edgeName(id, n)) && distanceM(...graph.nodes.get(id)!, ...START) > 300)!;
    const [lat, lon] = graph.nodes.get(corner)!;
    const { g, storage } = game({ places: [CAFE, { name: "Corner Shop", class: "shop", subclass: "convenience", rank: 1, lat, lon }] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    run(g, 2 * 3600);
    const walked = g.stats.streets.cities["Sofia, Bulgaria"] ?? [];
    expect(walked.length).toBeGreaterThan(0);
    expect(new Set(walked).size).toBe(walked.length);
    expect(walked.every((n) => n.length > 0)).toBe(true);
    g.save();
    const again = new Game({ ...(g as unknown as { deps: GameDeps }).deps, storage });
    again.load();
    expect(again.stats.streets.cities["Sofia, Bulgaria"]).toEqual(walked);
  });

  it("drops a sight note that comes back after a new city was started", async () => {
    const MUSEUM: Place = { name: "National Gallery", class: "museum", subclass: "museum", rank: 1, lat: 42.6885, lon: 23.3215 };
    let answer = (_: Response) => {};
    const api = new Api(async (url) => {
      if (!url.includes("wikipedia.org")) return new Response("", { status: 503 });
      return new Promise<Response>((r) => (answer = r));
    });
    const { g } = game({ api, places: [MUSEUM] });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    for (let i = 0; i < 120 && g.stats.history.entries.length < 2; i++) run(g, 60);
    const old = g.stats;
    await g.startCity("Sofia, Bulgaria", ...START, null);
    expect(g.stats).not.toBe(old);
    answer(new Response(JSON.stringify({ query: { pages: { "1": { title: "National Gallery", extract: "A gallery.", index: 1 } } } })));
    await tick();
    await tick();
    expect(g.stats.history.entries.some((e) => e.text.startsWith("📖"))).toBe(false);
    expect(g.stats.sightNotes.read).toEqual([]);
  });

  it("keeps the walk across a save", async () => {
    const { g, storage } = game();
    await g.startCity("Sofia, Bulgaria", ...START, null);
    run(g, 20);
    g.save();
    const again = new Game({ ...(g as unknown as { deps: GameDeps }).deps, storage });
    again.problems.quiet = true;
    expect(again.load()).toBe(true);
    expect(again.city).toBe("Sofia, Bulgaria");
    expect(again.walker!.totalM).toBeCloseTo(g.walker!.totalM, 6);
    expect(again.walker!.position()[0]).toBeCloseTo(g.walker!.position()[0], 9);
    expect(again.stats.history.entries.length).toBe(g.stats.history.entries.length);
  });

  it("marks the squares he walks, keeps them across a save, and not those under a ride", async () => {
    const { g, storage } = game({ roll: 0.1 });
    await g.startCity("Sofia, Bulgaria", ...START, null);
    expect(g.stats.explored.size).toBe(0);
    await tick();
    run(g, 300);
    const walked = g.stats.explored.size;
    expect(walked).toBeGreaterThan(0);
    g.save();
    const again = new Game({ ...(g as unknown as { deps: GameDeps }).deps, storage });
    again.problems.quiet = true;
    expect(again.load()).toBe(true);
    expect(again.stats.explored.size).toBe(walked);
    // The bus to Plovdiv crosses 150 km of squares; none of them count.
    g.stats.cents = 50_000;
    g.stats.meters.fullness = g.stats.meters.thirst = 100;
    g.skipRoll = false;
    g.debugNewGoal();
    for (let i = 0; i < 600 && !g.walker!.isTraveling(); i++) g.step(1);
    const boarded = g.stats.explored.size;
    for (let i = 0; i < 3600 && g.walker!.isTraveling(); i++) g.step(1);
    expect(g.walker!.isTraveling()).toBe(false);
    expect(g.stats.explored.size).toBeLessThanOrEqual(boarded + 1);
  });

  it("starts with the route line off and remembers the switch", () => {
    const { g, storage } = game();
    expect(g.showRoute).toBe(false);
    g.setShowRoute(true);
    const again = new Game({ ...(g as unknown as { deps: GameDeps }).deps, storage });
    expect(again.showRoute).toBe(true);
  });

  it("starts with the camera following him and remembers the switch", () => {
    const { g, storage } = game();
    expect(g.cameraFollows).toBe(true);
    g.setCameraFollows(false);
    const again = new Game({ ...(g as unknown as { deps: GameDeps }).deps, storage });
    expect(again.cameraFollows).toBe(false);
  });

  it("starts over on reset but keeps the problem log", async () => {
    const { g, storage } = game();
    await g.startCity("Sofia, Bulgaria", ...START, null);
    g.problems.warn("kept");
    g.save();
    g.reset();
    expect(g.walker).toBeNull();
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    const again = new Game({ ...(g as unknown as { deps: GameDeps }).deps, storage });
    expect(again.load()).toBe(false);
    expect(again.problems.warnings.map((w) => w.text)).toContain("kept");
  });
});
