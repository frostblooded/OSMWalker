// His body, wallet and progress: six meters (0-100), four attributes, coins,
// XP and level, timed buffs, gear and a bag of items, speed, his history and
// his keepsakes (landmark cards, Placedex, souvenirs, crawls).
// Time passes in game minutes, which are real minutes while the app is open.
import { addStop, type Stop } from "./day";
import * as F from "./forecast";
import { Care, dayOf } from "./gifts";
import { History } from "./history";
import * as Items from "./items";
import * as CC from "./cityCards";
import { JOKE_CHANCE, jokesFor, type Jokes } from "./jokes";
import * as K from "./keepsakes";
import type { Item, Slot } from "./items";
import type { Rng } from "./rng";
import { euro, signed, toCents } from "./money";
import * as Speeds from "./speeds";
import type { Vehicle } from "./speeds";
import { Week } from "./week";

export const METERS = ["health", "energy", "fullness", "mood", "hygiene", "thirst"] as const;
export const ATTRS = ["str", "cha", "wit", "luck"] as const;
export type Meter = (typeof METERS)[number];
export type Attr = (typeof ATTRS)[number];
/** Effect keys an action's fx may use. */
export const FX_KEYS = [...METERS, ...ATTRS, "xp"] as const;
/** Requirement keys an action's needs may use. */
export const NEED_KEYS = ["str", "cha", "wit", "luck", "level", "time", "below"] as const;
/** Hours that count as each time of day (night wraps past midnight). */
export const TIMES = { morning: [6, 11], day: [10, 18], evening: [17, 23], night: [21, 5] } as const;
export type TimeOfDay = keyof typeof TIMES;

export const FULLNESS_PER_H = 5;
export const THIRST_PER_H = 6;
export const HYGIENE_PER_H = 2;
/** Mood drifts down this much an hour, so fun actions matter. */
export const MOOD_PER_H = 1;
/** Action XP is multiplied by MOOD_XP_MIN at mood 0, up to MOOD_XP_MAX at 100 (1 at 50). */
export const MOOD_XP_MIN = 0.75;
export const MOOD_XP_MAX = 1.25;
/** Below this hygiene he is dirty: Charm counts up to DIRTY_CHARM_CUT less (at 0) and mood drains. */
export const DIRTY_AT = 30;
export const DIRTY_CHARM_CUT = 0.5;
export const DIRTY_MOOD_PER_H = 3;
/** Each Luck point makes mishaps this much rarer, up to LUCK_RISK_CAP. */
export const LUCK_RISK_CUT = 0.03;
export const LUCK_RISK_CAP = 0.5;
export { LUCK_RARITY_CAP, LUCK_RARITY_PER, rarityBoost } from "./items";
/** Chance per Luck point, each minute he walks, to find money on the street, up to FIND_CAP; FIND_MIN-FIND_MAX cents. */
export const FIND_PER_LUCK = 0.002;
export const FIND_CAP = 0.03;
export const FIND_MIN = 10;
export const FIND_MAX = 200;

export const moodXpMult = (mood: number) => MOOD_XP_MIN + ((MOOD_XP_MAX - MOOD_XP_MIN) * mood) / 100;
export const riskMult = (luck: number) => 1 - Math.min(LUCK_RISK_CUT * luck, LUCK_RISK_CAP);
export const findChance = (luck: number) => Math.min(FIND_PER_LUCK * luck, FIND_CAP);
export const ENERGY_PER_KM = 2;
/** Share of the walking effort each way of getting about takes, per km. */
export const EFFORT: Record<Vehicle, number> = { "": 1, bike: 0.3, motorcycle: 0.05, car: 0.05 };
/** Speed added per level above 1, as a share. */
export const SPEED_PER_LEVEL = 0.01;
/** Below this much energy he slows down, to half speed at zero. */
export const TIRED_ENERGY = 30;
/** Health lost per hour for each of hunger and thirst at zero. */
export const STARVING_PER_H = 5;
export const FIRST_VISIT_XP = 50;
/** Cents the hospital charges after he faints, but never more than HOSPITAL_MAX_SHARE of his money. */
export const HOSPITAL_FEE = 6000;
export const HOSPITAL_MAX_SHARE = 0.5;
/** Job pay rises this share per level above 1, and per point of the attribute the job needs. */
export const WAGE_PER_LEVEL = 0.03;
export const WAGE_PER_ATTR = 0.02;
/** Cents he starts with. */
export const START_CENTS = 20000;
export const WAKE_HEALTH = 50;
export const BAG_SIZE = 20;
/** He won't buy gear that leaves him with fewer cents than this. */
export const KEEP_CENTS = 2000;
/** A vehicle dealer shows him this many vehicles, and he takes the best he can afford. */
export const DEALER_OFFERS = 5;
/** Share of an item's price he gets selling it, before his charm. */
export const SELL_SHARE = 0.4;
/** Treasured items (see Items.isTreasured) he won't sell: his most travelled few. */
export const TREASURED_KEEP = 3;
/** At a resale shop with a full bag he sells his cheapest things until this many are left (a selling run). */
export const SELL_RUN_LEFT = BAG_SIZE / 2;

export type Fx = Partial<Record<Meter | Attr | "xp", number>>;
/** A timed effect; `attrs` adds to his attributes while it lasts. */
export type Buff = { name: string; left: number; per_h: Fx; xp_mult: number; attrs?: Partial<Record<Attr, number>> };
export type Action = {
  name: string;
  min: number;
  cost?: number;
  earn?: number | [number, number];
  fx?: Fx;
  needs?: Partial<Record<Attr | "level", number>> & { time?: TimeOfDay; below?: Partial<Record<Meter, number>> };
  risk?: { p: number; text?: string; fx?: Fx; cost?: number };
  buff?: { name: string; min: number; per_h?: Fx; xp_mult?: number; attrs?: Partial<Record<Attr, number>> };
  item?: Items.Kind;
  sell?: boolean;
  /** Buys a pack of city cards (see cityCards.ts). */
  pack?: boolean;
  /** A resale shop's sale: with a full bag he sells a load here (see SELL_RUN_LEFT), and such shops pull him while the bag is full. */
  resale?: boolean;
  flavour?: boolean;
};
export type Place = { name: string; class: string; subclass: string; rank: number; lat: number; lon: number; [k: string]: unknown };

export const xpToNext = (lvl: number) => 100 * lvl;

export class Stats {
  meters: Record<Meter, number> = { health: 100, energy: 100, fullness: 80, mood: 70, hygiene: 100, thirst: 80 };
  attrs: Record<Attr, number> = { str: 1, cha: 1, wit: 1, luck: 1 };
  /** His money, in euro cents. */
  cents = START_CENTS;
  /** Cents a trip he couldn't afford needs; he favours paid work until he has them. */
  savingFor = 0;
  xp = 0;
  level = 1;
  buffs: Buff[] = [];
  history = new History();
  visited = new Set<string>();
  gear: Partial<Record<Slot, Item>> = {};
  bag: Item[] = [];
  keepsakes = new K.Keepsakes();
  /** Where he is now, for keepsakes and item stories; the game and the catch-up set it (see arrive). */
  where = { city: "", code: "", country: "" };
  /** Placedex rarities from data/placedex.json; not saved, the game sets it. */
  dex: K.Dex = {};
  /** The city card pool, from data/cities.tsv; not saved, the game sets it. */
  cityPool: CC.Pool | null = null;
  /** Deadpan jokes from data/jokes.json; not saved, the game sets it. */
  jokes: Jokes = {};
  /** Clovers and the care package on its way to him. */
  care = new Care();
  /** The places he stopped at lately, for the day ribbon. */
  stops: Stop[] = [];
  /** This week in numbers, and last week's recap. */
  week = new Week();
  /** Minutes walked since the last roll for money on the street. */
  walkMin = 0;
  /** Unix seconds, for history entries; tests (and the catch-up) replace it. */
  now = () => Math.floor(Date.now() / 1000);
  /** Hears every feed line as it is said; the catch-up collects them for its summary. */
  onSay: ((line: string, t: number) => void) | null = null;

  /** An attribute with his gear's and buffs' bonuses; Charm counts less while he is dirty. */
  attr(name: Attr): number {
    let v = this.attrs[name];
    for (const item of Object.values(this.gear)) v += item?.stats[name] ?? 0;
    for (const b of this.buffs) v += b.attrs?.[name] ?? 0;
    if (name === "cha" && this.where.code && this.keepsakes.sets.includes(this.where.code)) v += CC.SET_CHARM;
    if (name === "cha" && this.meters.hygiene < DIRTY_AT) v *= 1 - (DIRTY_CHARM_CUT * (DIRTY_AT - this.meters.hygiene)) / DIRTY_AT;
    return v;
  }

  /** Today's forecast, by his clock. */
  forecast(): F.Forecast {
    return F.forecastAt(this.now());
  }

  /** The kind of vehicle he rides, or "" on foot. */
  vehicle(): Vehicle {
    return this.gear.vehicle?.vehicle ?? "";
  }

  /** Speed percent from his gear. */
  speedBonus(): number {
    let v = 0;
    for (const item of Object.values(this.gear)) v += item?.stats.speed ?? 0;
    return v;
  }

  /** Meters per second: walking or his vehicle, +1% a level above 1 and gear's speed percent, slower when tired. */
  speedMps(): number {
    const v = this.vehicle();
    const base = v ? Speeds.FOR_VEHICLE[v] : Speeds.WALK;
    const tired = 0.5 + 0.5 * Math.min(this.meters.energy / TIRED_ENERGY, 1);
    return base * (1 + SPEED_PER_LEVEL * (this.level - 1) + this.speedBonus() / 100) * tired;
  }

  /** The next vehicle he saves up for, or null once he has a car. */
  vehicleGoal(): Items.VehicleGoal | null {
    return Items.nextVehicle(this.vehicle());
  }

  /** Cents he saves up to: a trip fare, or his next vehicle plus his reserve, whichever is more. */
  savingTarget(): number {
    const goal = this.vehicleGoal();
    return Math.max(this.savingFor, goal ? goal.cents + KEEP_CENTS : 0);
  }

  /** True while he has less than he saves up to. */
  saving(): boolean {
    return this.cents < this.savingTarget();
  }

  /** What a job pays, as a multiple of its listed wage: 1, plus WAGE_PER_LEVEL a level and WAGE_PER_ATTR per point of the attributes it needs. */
  wageMult(action: Action): number {
    let m = 1 + WAGE_PER_LEVEL * (this.level - 1);
    for (const a of ATTRS) if (action.needs?.[a] !== undefined) m += WAGE_PER_ATTR * this.attr(a);
    return m * F.mult(this.forecast(), "wage");
  }

  /** Wears `item`; whatever was in its slot goes in the bag. */
  equip(item: Item): void {
    const old = this.gear[item.slot];
    this.gear[item.slot] = item;
    if (old) this.bagAdd(old);
  }

  unequip(slot: Slot): void {
    const old = this.gear[slot];
    if (old) {
      this.bagAdd(old);
      delete this.gear[slot];
    }
  }

  /** True when `item` beats what he wears in its slot. */
  isUpgrade(item: Item): boolean {
    return Items.power(item) > Items.power(this.gear[item.slot]);
  }

  /** Buys and wears `item` if it is an upgrade he can afford; returns the feed line. */
  buy(item: Item, where: string): string {
    const at = where ? ` at ${where}` : "";
    if (!this.isUpgrade(item) || this.cents - item.price < KEEP_CENTS)
      return this.say(`Looked at a ${item.rarity} ${item.name}${at} but didn't buy it (${euro(item.price)})`);
    this.cents -= item.price;
    item.story = { from: this.where.city, t: this.now(), countries: this.where.code ? [this.where.code] : [], km: 0 };
    this.equip(item);
    return this.say(`Bought a ${item.rarity} ${item.name}${at} (${signed(-item.price)})`);
  }

  /** Sells the cheapest thing in his bag; returns the feed line. */
  sellLoot(where: string): string {
    const at = where ? ` at ${where}` : "";
    if (!this.bag.length) return this.say(`Had nothing to sell${at}`);
    const item = this.sellCheapest();
    return this.say(`Sold his ${item.name}${at} (${signed(this.sellPrice(item))})`);
  }

  /** True when his bag is full, so resale shops pull him for a selling run. */
  bagFull(): boolean {
    return this.bag.length >= BAG_SIZE;
  }

  /** Sells his cheapest things until SELL_RUN_LEFT are left, a feed line each; returns the last. */
  sellRun(where: string): string {
    const at = where ? ` at ${where}` : "";
    let line = "";
    while (this.bag.length > SELL_RUN_LEFT) {
      const item = this.sellCheapest();
      line = this.say(`Sold his ${item.name}${at} (${signed(this.sellPrice(item))})`);
    }
    return line;
  }

  sellPrice(item: Item): number {
    return Math.round(item.price * SELL_SHARE * (1 + 0.05 * this.attr("cha")) * F.mult(this.forecast(), "sell"));
  }

  /** His TREASURED_KEEP most travelled treasured items in the bag: the ones he won't sell. */
  keptTreasures(): Set<Item> {
    return new Set(
      this.bag
        .filter(Items.isTreasured)
        .sort((a, b) => b.story!.countries.length - a.story!.countries.length)
        .slice(0, TREASURED_KEEP),
    );
  }

  /** Sells the cheapest item in his bag that isn't one of his kept treasures. */
  private sellCheapest(): Item {
    const kept = this.keptTreasures();
    const can = (it: Item) => !kept.has(it) || kept.size === this.bag.length;
    let i = this.bag.findIndex(can);
    this.bag.forEach((it, j) => {
      if (can(it) && it.price < this.bag[i]!.price) i = j;
    });
    const [item] = this.bag.splice(i, 1);
    this.cents += this.sellPrice(item!);
    return item!;
  }

  /** Puts an item in the bag; when that overfills it, sells the cheapest he may sell, which can be the new item. */
  private bagAdd(item: Item): void {
    this.bag.push(item);
    while (this.bag.length > BAG_SIZE) this.sellCheapest();
  }

  /** Starts a timed effect, replacing one of the same name. */
  addBuff(buff: NonNullable<Action["buff"]>): void {
    this.buffs = this.buffs.filter((b) => b.name !== buff.name);
    this.buffs.push({ name: buff.name, left: buff.min, per_h: buff.per_h ?? {}, xp_mult: buff.xp_mult ?? 1, ...(buff.attrs ? { attrs: buff.attrs } : {}) });
  }

  buffNames(): string[] {
    return this.buffs.map((b) => b.name);
  }

  /** Lets `minutes` pass, `walkedM` of them on the move. */
  passTime(minutes: number, walkedM: number): void {
    const t = this.now();
    this.week.roll(t, this.cents, this.level, -new Date(t * 1000).getTimezoneOffset());
    this.week.walked(walkedM);
    const h = minutes / 60;
    const fx: Fx = {
      fullness: -FULLNESS_PER_H * h,
      thirst: -THIRST_PER_H * h,
      hygiene: -HYGIENE_PER_H * h,
      mood: -(MOOD_PER_H + (this.meters.hygiene < DIRTY_AT ? DIRTY_MOOD_PER_H : 0)) * h,
      energy: (-ENERGY_PER_KM * EFFORT[this.vehicle()] * F.mult(this.forecast(), "effort") * walkedM) / 1000,
    };
    for (const m of ["fullness", "thirst"] as const) if (this.meters[m] <= 0) fx.health = (fx.health ?? 0) - STARVING_PER_H * h;
    for (const b of this.buffs) {
      const t = Math.min(minutes, b.left) / 60;
      for (const [m, rate] of Object.entries(b.per_h) as [keyof Fx, number][]) fx[m] = (fx[m] ?? 0) + rate * t;
      b.left -= minutes;
    }
    this.buffs = this.buffs.filter((b) => b.left > 0);
    this.applyFx(fx);
    if (walkedM) for (const item of Object.values(this.gear)) if (item?.story) item.story.km += walkedM / 1000;
  }

  /** Counts `minutes` of walking; each full minute Luck may find him money. Returns the feed line, or "". */
  walkFor(minutes: number, rng: Rng): string {
    this.walkMin += minutes;
    let line = "";
    while (this.walkMin >= 1) {
      this.walkMin -= 1;
      if (rng.randf() >= findChance(this.attr("luck")) * F.mult(this.forecast(), "find")) continue;
      const n = rng.randiRange(FIND_MIN, FIND_MAX);
      this.cents += n;
      line = this.say(`Found ${euro(n)} on the street (${signed(n)})`);
    }
    return line;
  }

  /** Adds meter and attribute changes; meters stay within 0-100. */
  applyFx(fx: Fx): void {
    for (const [k, v] of Object.entries(fx) as [keyof Fx, number][]) {
      if (k === "xp") this.addXp(Math.trunc(v));
      else if (k in this.meters) this.meters[k as Meter] = Math.min(Math.max(this.meters[k as Meter] + v, 0), 100);
      else if (k in this.attrs) this.attrs[k as Attr] = Math.max(this.attrs[k as Attr] + v, 0);
    }
  }

  addXp(n: number): void {
    this.xp += n;
    while (this.xp >= xpToNext(this.level)) {
      this.xp -= xpToNext(this.level);
      this.level++;
      let best: Attr = ATTRS[0];
      for (const a of ATTRS) if (this.attrs[a] > this.attrs[best]) best = a;
      this.attrs[best] += 1;
      this.say(`Reached level ${this.level}! ${best[0]!.toUpperCase()}${best.slice(1)} +1`);
      this.keepsakes.freePacks++;
    }
  }

  xpMult(): number {
    return this.buffs.reduce((m, b) => m * b.xp_mult, 1);
  }

  /** Sets the city card pool (none when it is empty) and works out his finished sets from it again, as the city list can change between versions. */
  setCityPool(pool: CC.Pool): void {
    this.cityPool = pool.cards.length ? pool : null;
    const k = this.keepsakes;
    k.sets = [...pool.byCountry.keys()].filter((code) => CC.hasSet(pool, k.cityCards, code));
  }

  /** True when he has the coins, skills, level and timing for `action`. */
  canDo(action: Action, hour: number): boolean {
    if (action.pack && !this.cityPool) return false;
    if (toCents(action.cost ?? 0) > this.cents) return false;
    if (action.item && this.cents <= KEEP_CENTS) return false;
    if (action.sell && !this.bag.length) return false;
    for (const [k, need] of Object.entries(action.needs ?? {})) {
      if (k === "level") {
        if (this.level < (need as number)) return false;
      } else if (k === "time") {
        if (!inTime(need as TimeOfDay, hour)) return false;
      } else if (k === "below") {
        for (const [m, v] of Object.entries(need as object)) if (this.meters[m as Meter] >= v) return false;
      } else if (this.attr(k as Attr) < (need as number)) return false;
    }
    return true;
  }

  /** What a shop of `kind` shows him: a random item, or at a vehicle dealer the best of DEALER_OFFERS he can afford (else the first). */
  offer(kind: Items.Kind, rng: Rng): Item {
    const first = Items.make(kind, this.level, rng, this.attr("luck"));
    if (!first.vehicle) return first;
    let best: Item | null = null;
    for (let i = 0; i < DEALER_OFFERS; i++) {
      const item = i ? Items.make(kind, this.level, rng, this.attr("luck")) : first;
      if (this.cents - item.price >= KEEP_CENTS && (!best || Items.power(item) > Items.power(best))) best = item;
    }
    return best ?? first;
  }

  /** Does `action` at `where`, a place of class `kind`, and returns the feed line it adds. */
  do(action: Action, where: string, rng: Rng, kind = ""): string {
    if (action.item) {
      this.applyFx(action.fx ?? {});
      return this.buy(this.offer(action.item, rng), where);
    }
    if (action.sell) {
      this.applyFx(action.fx ?? {});
      return action.resale && this.bagFull() ? this.sellRun(where) : this.sellLoot(where);
    }
    if (action.pack) {
      this.cents -= toCents(action.cost ?? 0);
      this.applyFx(action.fx ?? {});
      return this.openPack(rng, `Bought a card pack${where ? ` at ${where}` : ""} (${signed(-toCents(action.cost ?? 0))})`);
    }
    let spent = toCents(action.cost ?? 0);
    const fx: Fx = { ...action.fx };
    if (fx.mood !== undefined && fx.mood > 0) fx.mood *= F.mult(this.forecast(), "mood", kind);
    let text = action.name;
    const risk = action.risk;
    if (risk && rng.randf() < risk.p * riskMult(this.attr("luck"))) {
      spent += toCents(risk.cost ?? 0);
      for (const [k, v] of Object.entries(risk.fx ?? {}) as [keyof Fx, number][]) fx[k] = (fx[k] ?? 0) + v;
      text += `, ${risk.text ?? "it went wrong"}`;
    }
    const earn = action.earn ?? 0;
    const listed = Array.isArray(earn) ? rng.randiRange(toCents(earn[0]), toCents(earn[1])) : toCents(earn);
    const earned = listed ? Math.round(listed * this.wageMult(action)) : 0;
    this.cents = Math.max(this.cents - spent + earned, 0);
    if (fx.xp !== undefined) fx.xp = Math.round(fx.xp * this.xpMult() * moodXpMult(this.meters.mood));
    this.applyFx(fx);
    if (action.buff) this.addBuff(action.buff);
    const net = earned - spent;
    const money = net ? ` (${signed(net)})` : "";
    const jokes = jokesFor(this.jokes, kind);
    const joke = rng.randf() < JOKE_CHANCE && jokes.length ? ` ${rng.pick(jokes)}` : "";
    return this.say(text + (where ? ` at ${where}` : "") + money + joke);
  }

  /** First visit to a named place gives bonus XP; returns the XP given. */
  visit(place: Pick<Place, "name" | "lat" | "lon">): number {
    const key = visitKey(place);
    if (this.visited.has(key)) return 0;
    this.visited.add(key);
    this.week.newPlace();
    const xp = Math.round(FIRST_VISIT_XP * F.mult(this.forecast(), "visit"));
    this.addXp(xp);
    return xp;
  }

  /** He is now in `city` (`code`, `country`): worn items count the country in their story. */
  arrive(city: string, code: string, country: string): void {
    this.where = { city, code, country };
    if (!code) return;
    const seen = this.keepsakes.seen;
    for (const s of [code, `${code}:${city}`]) {
      if (seen.includes(s)) continue;
      seen.push(s);
      this.keepsakes.freePacks++;
    }
    for (const item of Object.values(this.gear)) if (item?.story && !item.story.countries.includes(code)) item.story.countries.push(code);
  }

  /** Cents off a fare for his souvenirs: FARE_CUT for every SOUVENIRS_PER_CUT, up to FARE_CUT_MAX. */
  fareMult(): number {
    return (1 - K.fareCut(this.keepsakes.souvenirs.size)) * F.mult(this.forecast(), "fare");
  }

  /**
   * Right after reaching a real place (after visit()): a landmark card the
   * first time (a revisit gives nothing) and maybe the country's souvenir,
   * a new Placedex kind, the perks of crawls he finished, and progress on the rest.
   */
  collect(place: Place, rng: Rng): void {
    const k = this.keepsakes;
    const key = visitKey(place);
    const kind = K.kindOf(place);
    if (K.isLandmark(place) && !k.cards.has(key)) {
      const card: K.Card = { name: place.name, kind, city: this.where.city, rarity: K.cardRarity(place.rank), finish: K.rollFinish(rng.randf()), t: this.now() };
      k.cards.set(key, card);
      this.say(`New card: ${place.name} (${[card.rarity, K.FINISH_NAME[card.finish]].filter(Boolean).join(", ")})`);
    }
    if (K.isLandmark(place) && this.where.code && !k.souvenirs.has(this.where.code) && rng.randf() < K.SOUVENIR_CHANCE) this.gotSouvenir(place.name);
    if (!k.dex.has(kind)) {
      const rarity = K.dexRarity(this.dex, kind);
      k.dex.set(kind, { t: this.now(), city: this.where.city });
      this.addXp(K.DEX_XP[rarity]);
      this.say(`New in the Placedex: ${K.kindLabel(kind)} (${rarity}, +${K.DEX_XP[rarity]} XP)`);
    }
    if (kind in CC.CARD_SHOPS && k.spares.length) {
      const cents = k.spares.reduce((n, s) => n + CC.spareCents(s), 0);
      this.say(`Sold ${k.spares.length} spare city card${k.spares.length > 1 ? "s" : ""} at ${place.name} (${signed(cents)})`);
      this.cents += cents;
      k.spares = [];
    }
    while (this.cityPool && k.freePacks > 0) {
      k.freePacks--;
      this.openPack(rng, "Opened a free card pack");
    }
    k.roll(dayOf(this.now() * 1000), this.where.city);
    for (const c of K.CRAWLS) {
      if (!K.crawlMatches(c, place)) continue;
      if (k.done.has(c.id)) {
        this.applyFx(c.perk);
        continue;
      }
      const seen = (k.progress[c.id] ??= []);
      if (seen.includes(key)) continue;
      seen.push(key);
      if (seen.length < c.need) continue;
      k.done.set(c.id, this.now());
      delete k.progress[c.id];
      this.say(`Finished the ${c.name}! From now on ${K.perkText(c.perk)} at each such place`);
    }
  }

  /** Pulls PACK_SIZE city cards: new ones go in his binder (a better finish replaces a worse one), the rest are spares. Returns the feed line. */
  private openPack(rng: Rng, opening: string): string {
    const k = this.keepsakes;
    const pool = this.cityPool;
    if (!pool) return this.say(opening);
    const got: string[] = [];
    const touched = new Set<string>();
    let spares = 0;
    for (let i = 0; i < CC.PACK_SIZE; i++) {
      const { card, finish } = CC.pull(pool, rng);
      const had = k.cityCards.get(card.key);
      const name = `${card.name} (${[card.rarity, K.FINISH_NAME[finish]].filter(Boolean).join(", ")})`;
      if (!had) {
        k.cityCards.set(card.key, { finish, t: this.now() });
        got.push(name);
        touched.add(card.code);
        continue;
      }
      spares++;
      if (K.FINISH_RANK[finish] > K.FINISH_RANK[had.finish]) {
        k.spares.push({ rarity: card.rarity, finish: had.finish });
        had.finish = finish;
        got.push(name);
      } else k.spares.push({ rarity: card.rarity, finish });
    }
    const line = this.say(`${opening}: ${got.length ? `new ${got.join(", ")}` : "nothing new"}${spares ? `; ${spares} spare${spares > 1 ? "s" : ""}` : ""}`);
    for (const code of touched) {
      if (k.sets.includes(code) || !CC.hasSet(pool, k.cityCards, code)) continue;
      k.sets.push(code);
      const { country } = pool.byCountry.get(code)![0]!;
      this.say(`Completed the ${country} city card set! Charm +${CC.SET_CHARM} while in ${country}`);
    }
    return line;
  }

  /** This country's souvenir, found at `where`; every SOUVENIRS_PER_CUT make fares cheaper. */
  private gotSouvenir(where: string): void {
    const { code, country, city } = this.where;
    const name = K.souvenirName(code, country);
    this.keepsakes.souvenirs.set(code, { name, country, city, t: this.now() });
    this.say(`Found a souvenir from ${country || city} at ${where}: a ${name}`);
    const n = this.keepsakes.souvenirs.size;
    if (n % K.SOUVENIRS_PER_CUT === 0 && K.fareCut(n) > K.fareCut(n - 1)) this.say(`Seasoned traveller: fares are now ${Math.round(K.fareCut(n) * 100)}% cheaper`);
  }

  /** Notes a stop at a place, for the day ribbon. */
  stop(place: { class: string; subclass: string }): void {
    addStop(this.stops, place, this.now());
    this.week.stop(place.class);
  }

  fainted(): boolean {
    return this.meters.health <= 0;
  }

  /** After fainting: patched up at a hospital for a fee. */
  wakeInHospital(hospital: string): string {
    const fee = Math.min(HOSPITAL_FEE, Math.floor(this.cents * HOSPITAL_MAX_SHARE));
    this.cents -= fee;
    this.meters.health = WAKE_HEALTH;
    this.meters.energy = Math.max(this.meters.energy, 30);
    this.meters.fullness = Math.max(this.meters.fullness, 30);
    this.meters.thirst = Math.max(this.meters.thirst, 30);
    return this.say(`Fainted! Woke up at ${hospital || "the hospital"} (${signed(-fee)})`);
  }

  say(line: string): string {
    const t = this.now();
    this.history.add(line, t);
    this.onSay?.(line, t);
    return line;
  }

  toJSON() {
    return {
      meters: this.meters, attrs: this.attrs, cents: this.cents, savingFor: this.savingFor, xp: this.xp, level: this.level,
      buffs: this.buffs, walkMin: this.walkMin, history: this.history.toJSON(), visited: [...this.visited], gear: this.gear, bag: this.bag,
      care: this.care.toJSON(), keepsakes: this.keepsakes.toJSON(), where: this.where, stops: this.stops, week: this.week.toJSON(),
    };
  }

  static fromJSON(d: ReturnType<Stats["toJSON"]>): Stats {
    const s = new Stats();
    Object.assign(s.meters, d.meters);
    Object.assign(s.attrs, d.attrs);
    s.cents = d.cents;
    s.savingFor = d.savingFor ?? 0;
    s.xp = d.xp;
    s.level = d.level;
    s.buffs = d.buffs ?? [];
    s.walkMin = d.walkMin ?? 0;
    s.history = History.fromJSON(d.history);
    s.visited = new Set(d.visited);
    s.gear = d.gear ?? {};
    s.bag = d.bag ?? [];
    s.keepsakes = K.Keepsakes.fromJSON(d.keepsakes);
    s.where = d.where ?? s.where;
    s.care = Care.fromJSON(d.care);
    s.stops = d.stops ?? [];
    s.week = Week.fromJSON(d.week);
    return s;
  }
}

/** The key a place is remembered by: its name and where it is. */
export const visitKey = (place: Pick<Place, "name" | "lat" | "lon">) => `${place.name}@${place.lat.toFixed(4)},${place.lon.toFixed(4)}`;

export function inTime(time: TimeOfDay, hour: number): boolean {
  const [a, b] = TIMES[time];
  return a <= b ? hour >= a && hour < b : hour >= a || hour < b;
}
