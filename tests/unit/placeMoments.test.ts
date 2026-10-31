// A choice or mini-game at each kind of place, and what each pick does (src/core/placeMoments.ts, Stats.settleMoment).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RISK_CAP } from "../../src/core/moments";
import { momentFor, type PlaceMoments } from "../../src/core/placeMoments";
import { Stats } from "../../src/core/stats";

const TABLE: PlaceMoments = {
  cafe: {
    id: "cafe", icon: "☕", ask: "The barista at {PLACE} looks rushed.", lean: "cha",
    options: [{ id: "tip", label: "Tip well" }, { id: "chat", label: "Chat" }, { id: "dash", label: "Skip paying" }],
    default: "chat",
    outcomes: {
      tip: { say: "Tipped the barista at {PLACE}", pay: 200, fx: { mood: 5, karma: 2 } },
      chat: { say: "Chatted with the barista at {PLACE}", fx: { mood: 3 } },
      dash: { say: "Walked out of {PLACE} without paying", gain: 500, fx: { karma: -5 } },
    },
    risky: { option: "dash", attr: "luck", miss: { say: "Got caught leaving {PLACE} without paying", pay: 1000, fx: { health: -5 } } },
  },
  "shop/kiosk": {
    id: "kiosk", icon: "🗞", ask: "Kiosk", game: "timing",
    options: [{ id: "bad", label: "Fumbled" }, { id: "ok", label: "Fine" }, { id: "great", label: "Perfect" }],
    default: "ok",
    outcomes: { bad: { say: "a" }, ok: { say: "b" }, great: { say: "c", item: "trinkets" } },
  },
  _generic: { id: "g", icon: "📍", ask: "g", options: [{ id: "x", label: "x" }], default: "x", outcomes: { x: { say: "x" } } },
};

describe("finding a place's moment", () => {
  it("looks up class/subclass, then class, then the generic one", () => {
    expect(momentFor(TABLE, { class: "shop", subclass: "kiosk" })!.id).toBe("kiosk");
    expect(momentFor(TABLE, { class: "cafe", subclass: "x" })!.id).toBe("cafe");
    expect(momentFor(TABLE, { class: "nothing" })!.id).toBe("g");
    expect(momentFor({}, { class: "cafe" })).toBeNull();
  });
});

describe("settling a pick", () => {
  it("pays, applies its effects and says what he did, with the place's name", () => {
    const s = new Stats();
    s.cents = 10000;
    const line = s.settleMoment(TABLE.cafe!, "Café Nero", "tip", true, 0.5);
    expect(line).toBe("☕ Tipped the barista at Café Nero (-€2)");
    expect(s.cents).toBe(9800);
  });

  it("says when he decided by himself", () => {
    expect(new Stats().settleMoment(TABLE.cafe!, "Café Nero", "chat", false, 0.5)).toBe("☕ Decided by himself: Chatted with the barista at Café Nero");
  });

  it("lets a risky pick fail, less often with more of its attribute", () => {
    const s = new Stats();
    s.cents = 10000;
    const health = s.meters.health;
    expect(s.settleMoment(TABLE.cafe!, "Nero", "dash", true, 0.49)).toContain("Walked out of Nero without paying (+€5)");
    expect(s.settleMoment(TABLE.cafe!, "Nero", "dash", true, 0.5)).toContain("Got caught leaving Nero");
    expect(s.meters.health).toBe(health - 5);
    s.attrs.luck = 100;
    expect(s.settleMoment(TABLE.cafe!, "Nero", "dash", true, RISK_CAP - 0.01)).toContain("Walked out");
  });

  it("never pays more than he has", () => {
    const s = new Stats();
    s.cents = 50;
    s.settleMoment(TABLE.cafe!, "Nero", "tip", true, 0.5);
    expect(s.cents).toBe(0);
  });

  it("gives a free item, worn when better", () => {
    const s = new Stats();
    const line = s.settleMoment(TABLE["shop/kiosk"]!, "Kiosk 7", "great", true, 0.5);
    expect(line).toMatch(/and got a free .+/);
    expect(Object.values(s.gear).length + s.bag.length).toBe(1);
  });
});

describe("the bundled moments", () => {
  const actions = JSON.parse(readFileSync("public/data/actions.json", "utf8")) as Record<string, unknown>;
  const moments = JSON.parse(readFileSync("public/data/moments.json", "utf8")) as PlaceMoments;

  it("cover every kind of place that has actions", () => {
    const missing = Object.keys(actions).filter((k) => !k.startsWith("_holiday") && !moments[k]);
    expect(missing).toEqual([]);
  });

  it("are well formed: 2-3 options, an outcome each, a known default and risky option", () => {
    for (const [k, m] of Object.entries(moments)) {
      expect(m.options.length, k).toBeGreaterThanOrEqual(2);
      expect(m.options.length, k).toBeLessThanOrEqual(3);
      for (const o of m.options) expect(m.outcomes[o.id], `${k}.${o.id}`).toBeTruthy();
      expect(m.options.some((o) => o.id === m.default), k).toBe(true);
      if (m.risky) expect(m.outcomes[m.risky.option], k).toBeTruthy();
      // Help: he never picks a shady option himself, and a gamble works by Luck.
      if (m.risky) expect([m.default, m.risky.attr], k).toEqual([expect.not.stringMatching(`^${m.risky.option}$`), "luck"]);
      if (m.risky) expect(m.game, `${k}: a mini-game's score decides, so it has no risky option`).toBeUndefined();
      // His attribute leans him to the first option, so it is neither his default nor a crime.
      if (m.lean) expect([m.default, m.risky?.option], k).not.toContain(m.options[0]!.id);
      if (m.game) expect(m.lean, `${k}: a mini-game has no lean`).toBeUndefined();
    }
  });

  it("never cost karma on a pick he makes himself: default, lean, or a mini-game's best", () => {
    for (const [k, m] of Object.entries(moments)) {
      const his = [m.default, m.lean ? m.options[0]!.id : m.default, m.game ? m.options.at(-1)!.id : m.default];
      for (const id of his) expect(m.outcomes[id]!.fx?.karma ?? 0, `${k}.${id}`).toBeGreaterThanOrEqual(0);
    }
  });

  it("prefer mini-games: at least half the places have one", () => {
    const all = Object.values(moments);
    expect(all.filter((m) => m.game).length * 2).toBeGreaterThanOrEqual(all.length);
  });
});
