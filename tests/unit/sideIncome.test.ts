// Side income (src/core/business.ts, lottery.ts): the businesses he buys
// once he has money to spare and what they bring in, his lottery tickets and
// the draw, shares in his spot, how Stats runs them (also while away), their
// Collection entries and feats, and saving them.
import { describe, expect, it } from "vitest";
import * as Bz from "../../src/core/business";
import * as C from "../../src/core/collection";
import * as Cook from "../../src/core/cooking";
import { stepsTo } from "../../src/core/skills";
import * as Lt from "../../src/core/lottery";
import { euro } from "../../src/core/money";
import { Rng } from "../../src/core/rng";
import { KEEP_CENTS, Stats, type Action } from "../../src/core/stats";
import { dataFile } from "../support/data";

const ACTIONS = JSON.parse(dataFile("actions.json")) as Record<string, Action[]>;
const roundTrip = (s: Stats) => Stats.fromJSON(JSON.parse(JSON.stringify(s)));
/** Local noon on 2026-06-10 by the test machine's clock. */
const NOON = new Date(2026, 5, 10, 12, 0, 0).getTime() / 1000;
const at = (h: number, day = 10) => new Date(2026, 5, day, h, 0, 0).getTime() / 1000;
/** A Stats in Sofia at `t`, with a dragon's worth of nothing to save for unless told. */
const inSofia = (t = NOON) => {
  const s = new Stats();
  s.now = () => t;
  s.arrive("Sofia", "BGR", "Bulgaria");
  return s;
};
/** Lets `h` hours pass a minute at a time from s.now(), moving the clock. */
const live = (s: Stats, h: number) => {
  let t = s.now();
  for (let m = 0; m < h * 60; m++) {
    t += 60;
    s.now = () => t;
    s.passTime(1, 0);
  }
};
const ticket = (key: string) => ACTIONS[key]!.find((a) => a.lottery)!;

describe("businesses", () => {
  it("come cheapest first, each one bringing in more", () => {
    for (let i = 1; i < Bz.BUSINESSES.length; i++) {
      expect(Bz.BUSINESSES[i]!.cents).toBeGreaterThan(Bz.BUSINESSES[i - 1]!.cents);
      expect(Bz.BUSINESSES[i]!.perH).toBeGreaterThan(Bz.BUSINESSES[i - 1]!.perH);
    }
    expect(new Set(Bz.BUSINESSES.map((b) => b.icon)).size).toBe(Bz.BUSINESSES.length);
    const b = new Bz.Business();
    expect(b.next()).toBe(Bz.BUSINESSES[0]);
    b.buy(Bz.BUSINESSES[0]!, "Sofia", NOON);
    expect(b.next()).toBe(Bz.BUSINESSES[1]);
    for (const k of Bz.BUSINESSES.slice(1)) b.buy(k, "Sofia", NOON);
    expect(b.next()).toBeNull();
  });

  it("each pay for themselves in three to five weeks", () => {
    for (const k of Bz.BUSINESSES) {
      const days = k.cents / k.perH / 24;
      expect(days).toBeGreaterThan(21);
      expect(days).toBeLessThan(35);
    }
  });

  it("take in money by the hour, paid out whole cents at a time", () => {
    const b = new Bz.Business();
    b.buy(Bz.BUSINESSES[0]!, "Sofia", NOON);
    b.pass(10);
    const want = Bz.BUSINESSES[0]!.perH * 10;
    expect(b.payout()).toBe(Math.floor(want));
    expect(b.earned).toBe(Math.floor(want));
    expect(b.payout()).toBe(0);
  });

  it("are bought each morning once he has a business's price to spare past what he saves up for", () => {
    const s = inSofia(at(23));
    const cart = Bz.BUSINESSES[0]!;
    const keep = () => Math.max(s.savingTarget(), KEEP_CENTS);
    s.cents = keep() + cart.cents - 1;
    live(s, 2);
    expect(s.business.owned).toHaveLength(0);
    s.now = () => at(23, 11);
    s.cents = keep() + cart.cents;
    const lines: string[] = [];
    s.onSay = (l) => lines.push(l);
    live(s, 0.5);
    expect(s.business.owned).toHaveLength(0);
    live(s, 1);
    expect(s.business.owned.map((o) => o.id)).toEqual([cart.id]);
    expect(s.business.owned[0]!.city).toBe("Sofia");
    expect(lines.some((l) => l.includes(`Bought a ${cart.name} in Sofia`))).toBe(true);
    expect(s.cents).toBe(keep());
  });

  it("are not bought while you whisper to him to save", () => {
    const s = inSofia();
    s.cents = Math.max(s.savingTarget(), KEEP_CENTS) + Bz.BUSINESSES[0]!.cents * 10;
    s.bond.nudge = "save";
    s.bond.nudgeLeft = 60;
    s.now = () => at(23);
    live(s, 2);
    expect(s.business.owned).toHaveLength(0);
  });

  it("pay him once a day, with a line in the feed, also while away", () => {
    const s = inSofia(at(1));
    s.business.buy(Bz.BUSINESSES[1]!, "Sofia", at(1));
    const lines: string[] = [];
    s.onSay = (l) => lines.push(l);
    const before = s.cents;
    live(s, 24);
    const took = lines.find((l) => l.includes("took in"));
    expect(took).toBeDefined();
    expect(s.cents).toBeGreaterThan(before);
    expect(s.business.earned).toBe(s.cents - before);
  });

  it("are saved, and an old save has none", () => {
    const s = inSofia();
    s.business.buy(Bz.BUSINESSES[0]!, "Sofia", NOON);
    s.business.pass(3.5);
    const back = roundTrip(s);
    expect(back.business.owned).toEqual(s.business.owned);
    expect(back.business.pending).toBeCloseTo(s.business.pending);
    const old = JSON.parse(JSON.stringify(s));
    delete old.business;
    expect(Stats.fromJSON(old).business.owned).toEqual([]);
    expect(Bz.Business.fromJSON({ owned: [{ id: "nope", city: "X", since: 1 }, { id: Bz.BUSINESSES[0]!.id, city: "Sofia", since: 2 }] }).owned.map((o) => o.id)).toEqual([Bz.BUSINESSES[0]!.id]);
  });
});

describe("lottery", () => {
  it("draws at 20:00 by his clock: today before then, else tomorrow", () => {
    expect(Lt.nextDraw(at(12))).toBe(at(Lt.DRAW_HOUR));
    expect(Lt.nextDraw(at(Lt.DRAW_HOUR))).toBe(at(Lt.DRAW_HOUR, 11));
    expect(Lt.nextDraw(at(23))).toBe(at(Lt.DRAW_HOUR, 11));
  });

  it("has realistic odds, each prize rarer and bigger, that Luck nudges up", () => {
    for (let i = 1; i < Lt.PRIZES.length; i++) {
      expect(Lt.PRIZES[i]!.odds).toBeGreaterThan(Lt.PRIZES[i - 1]!.odds);
      expect(Lt.PRIZES[i]!.cents).toBeGreaterThan(Lt.PRIZES[i - 1]!.cents);
    }
    // Like a real lottery, a ticket pays back well under its price on average.
    const back = Lt.PRIZES.reduce((sum, p) => sum + p.cents / p.odds, 0);
    expect(back).toBeLessThan(Lt.TICKET / 2);
    expect(Lt.oddsMult(1)).toBeCloseTo(1 + Lt.LUCK_NUDGE);
    expect(Lt.oddsMult(5)).toBeGreaterThan(Lt.oddsMult(1));
    expect(Lt.oddsMult(1000)).toBe(Lt.LUCK_MULT_MAX);
  });

  it("roll: a low die wins the top prize it reaches, else nothing", () => {
    const jackpot = Lt.PRIZES.at(-1)!;
    expect(Lt.roll(0, 1)).toBe(jackpot);
    expect(Lt.roll(0.999999, 1)).toBeNull();
    const small = Lt.PRIZES[0]!;
    const total = Lt.PRIZES.reduce((s, p) => s + 1 / p.odds, 0);
    expect(Lt.roll(total - 1e-9, 0)).toBe(small);
    expect(Lt.roll(total + 1e-9, 0)).toBeNull();
    // Luck makes the same die win.
    expect(Lt.roll(total * 1.05, 0)).toBeNull();
    expect(Lt.roll(total * 1.05, 1)).toBe(small);
  });

  it("wins about as often as the odds say over many draws", () => {
    const rng = new Rng(7);
    let wins = 0;
    const n = 20_000;
    for (let i = 0; i < n; i++) if (Lt.roll(rng.randf(), 0)) wins++;
    const p = Lt.PRIZES.reduce((s, x) => s + 1 / x.odds, 0);
    expect(wins / n).toBeGreaterThan(p * 0.7);
    expect(wins / n).toBeLessThan(p * 1.3);
  });

  it("replaces the old lottery ticket at kiosks, corner shops and newsagents", () => {
    for (const key of ["shop/kiosk", "shop/convenience", "shop/newsagent"]) {
      const a = ticket(key);
      expect(a.cost).toBe(Lt.TICKET / 100);
      expect(a.risk).toBeUndefined();
      expect(a.earn).toBeUndefined();
    }
    expect(Object.values(ACTIONS).flat().filter((a) => a.name === "Lottery ticket" && !a.lottery)).toEqual([]);
  });

  it("one ticket a draw: bought for tonight, drawn at 20:00, then he may buy again", () => {
    const s = inSofia(at(12));
    const a = ticket("shop/kiosk");
    expect(s.canDo(a, 12)).toBe(true);
    const before = s.cents;
    const line = s.do(a, "Kiosk", new Rng(1));
    expect(line).toContain("for tonight's draw");
    expect(s.cents).toBe(before - Lt.TICKET);
    expect(s.lottery.ticket).toBe(at(Lt.DRAW_HOUR));
    expect(s.canDo(a, 12)).toBe(false);
    const lines: string[] = [];
    s.onSay = (l) => lines.push(l);
    live(s, 7.5);
    expect(lines.filter((l) => l.startsWith("🎟"))).toHaveLength(0);
    live(s, 1);
    expect(lines.filter((l) => l.startsWith("🎟"))).toHaveLength(1);
    expect(s.lottery.ticket).toBe(0);
    expect(s.lottery.tickets).toBe(1);
    expect(s.canDo(a, 21)).toBe(true);
    expect(s.do(a, "Kiosk", new Rng(1))).toContain("for tomorrow's draw");
  });

  it("pays a prize, says so and remembers his best", () => {
    const s = inSofia(at(12));
    const prize = Lt.PRIZES[1]!;
    const before = s.cents;
    const line = s.lotteryDraw(prize);
    expect(line).toContain(euro(prize.cents));
    expect(s.cents).toBe(before + prize.cents);
    expect(s.lottery.won).toBe(prize.cents);
    expect(s.lottery.prizes).toBe(1);
    expect(s.lottery.best).toBe(prize.cents);
    s.lotteryDraw(Lt.PRIZES[0]!);
    expect(s.lottery.best).toBe(prize.cents);
    expect(s.lotteryDraw(null)).toContain("no luck");
  });

  it("a big win goes in his life story", () => {
    const s = inSofia(at(12));
    s.lotteryDraw(Lt.PRIZES[2]!);
    expect(s.chronicle.lines.some((e) => e.text.includes("lottery"))).toBe(true);
  });

  it("is saved, and an old save holds no ticket", () => {
    const s = inSofia(at(12));
    s.do(ticket("shop/kiosk"), "Kiosk", new Rng(1));
    s.lotteryDraw(Lt.PRIZES[0]!);
    const back = roundTrip(s);
    expect(back.lottery.toJSON()).toEqual(s.lottery.toJSON());
    const old = JSON.parse(JSON.stringify(s));
    delete old.lottery;
    expect(Stats.fromJSON(old).lottery.ticket).toBe(0);
  });
});

describe("shares in his spot", () => {
  const cafe = { name: "Cafe Rila", class: "cafe", subclass: "cafe", rank: 1, lat: 42.69, lon: 23.32 };
  /** In Sofia with Cafe Rila as his spot. */
  const regular = (t = at(23)) => {
    const s = inSofia(t);
    for (let i = 0; i < 3; i++) s.visit(cafe);
    expect(s.spots.isSpot("Sofia", cafe)).toBe(true);
    return s;
  };

  it("pay a little a day, more for each visit since, up to a few", () => {
    const b = new Bz.Business();
    b.buyShare("Sofia", "Cafe Rila", NOON);
    expect(b.payout()).toBe(Bz.SHARE_BASE);
    b.visited("Sofia", "Cafe Rila");
    b.visited("Sofia", "Somewhere else");
    expect(b.payout()).toBe(Bz.SHARE_BASE + Bz.SHARE_PER_VISIT);
    for (let i = 0; i < 10; i++) b.visited("Sofia", "Cafe Rila");
    expect(b.payout()).toBe(Bz.SHARE_BASE + Bz.SHARE_PER_VISIT * Bz.SHARE_VISITS_MAX);
    expect(b.payout()).toBe(Bz.SHARE_BASE);
  });

  it("are bought each morning in the city where he has a spot, one share a city", () => {
    const s = regular();
    s.cents = Math.max(s.savingTarget(), KEEP_CENTS) + Bz.SHARE_PRICE;
    const lines: string[] = [];
    s.onSay = (l) => lines.push(l);
    live(s, 2);
    expect(s.business.shares).toEqual([expect.objectContaining({ city: "Sofia", place: "Cafe Rila" })]);
    expect(lines.some((l) => l.includes("Bought a share in Cafe Rila"))).toBe(true);
    s.cents = Math.max(s.savingTarget(), KEEP_CENTS) + Bz.SHARE_PRICE;
    s.now = () => at(23, 11);
    live(s, 2);
    expect(s.business.shares).toHaveLength(1);
  });

  it("are not bought without a spot", () => {
    const s = inSofia(at(23));
    s.cents = Math.max(s.savingTarget(), KEEP_CENTS) + Bz.SHARE_PRICE;
    live(s, 2);
    expect(s.business.shares).toHaveLength(0);
  });

  it("count his visits to the place, and pay with the businesses' takings", () => {
    const s = regular(at(1));
    // The day's first minute, so the next payout is at midnight.
    s.passTime(1, 0);
    s.business.buyShare("Sofia", "Cafe Rila", at(1));
    s.visit(cafe);
    const lines: string[] = [];
    s.onSay = (l) => lines.push(l);
    const before = s.cents;
    live(s, 24);
    expect(s.cents - before).toBe(Bz.SHARE_BASE + Bz.SHARE_PER_VISIT);
    expect(lines.some((l) => l.includes("share in Cafe Rila") && l.includes("took in"))).toBe(true);
  });

  it("are saved", () => {
    const s = regular();
    s.business.buyShare("Sofia", "Cafe Rila", NOON);
    s.business.visited("Sofia", "Cafe Rila");
    expect(roundTrip(s).business.shares).toEqual(s.business.shares);
  });
});

describe("in the Collection", () => {
  const set = (id: string) => C.SETS.find((x) => x.id === id)!;
  const feat = (id: string) => C.FEATS.find((x) => x.id === id)!;

  it("recipes: cooking one notes the dish and counts the meal", () => {
    const s = inSofia();
    s.pantry.items = ["bread", "cheese", "tomato"];
    const picnic = Cook.RECIPES.find((r) => r.id === "picnic")!;
    s.pantry.use(picnic);
    s.pantry.items = ["bread", "cheese", "tomato"];
    s.pantry.use(picnic);
    expect(s.pantry.dishes).toEqual(["picnic"]);
    expect(s.pantry.cooked).toBe(2);
    const entries = set("recipes").entries(s);
    expect(entries).toHaveLength(Cook.RECIPES.length);
    expect(entries.filter((e) => e.got).map((e) => e.id)).toEqual(["picnic"]);
    expect(feat("cooked").count(s)).toBe(2);
  });

  it("businesses, shares and lottery prizes each count", () => {
    const s = inSofia();
    s.business.buy(Bz.BUSINESSES[0]!, "Sofia", NOON);
    s.business.buyShare("Sofia", "Cafe Rila", NOON);
    s.lotteryDraw(Lt.PRIZES[0]!);
    const got = set("businesses").entries(s).filter((e) => e.got);
    expect(got.map((e) => e.id)).toEqual([Bz.BUSINESSES[0]!.id]);
    expect(got[0]!.info).toContain("In Sofia");
    expect(feat("tycoon").count(s)).toBe(1);
    expect(feat("shares").count(s)).toBe(1);
    expect(feat("lottery").count(s)).toBe(1);
  });

  it("skills at level 5 and languages learned to basic count, not his own or English", () => {
    const s = inSofia();
    s.passTime(1, 0);
    expect(feat("languages").count(s)).toBe(0);
    s.languages.add("French", 6);
    expect(feat("languages").count(s)).toBe(1);
    s.skills.steps.music = stepsTo(5);
    s.skills.steps.art = stepsTo(4);
    expect(feat("skills").count(s)).toBe(1);
  });
});
