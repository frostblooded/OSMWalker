// His body, wallet and progress: six meters (0-100), four attributes, coins,
// XP and level, timed buffs, gear and a bag of items, speed, and his history.
// Time passes in game minutes, which are real minutes while the app is open.
import { History } from "./history";
import * as Items from "./items";
import type { Item, Slot } from "./items";
import type { Rng } from "./rng";
import * as Speeds from "./speeds";
import type { Vehicle } from "./speeds";

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
export const ENERGY_PER_KM = 2;
/** Share of the walking effort each way of getting about takes, per km. */
const EFFORT: Record<Vehicle, number> = { "": 1, bike: 0.3, motorcycle: 0.05, car: 0.05 };
/** Speed added per level above 1, as a share. */
const SPEED_PER_LEVEL = 0.01;
/** Below this much energy he slows down, to half speed at zero. */
const TIRED_ENERGY = 30;
/** Health lost per hour for each of hunger and thirst at zero. */
const STARVING_PER_H = 5;
export const FIRST_VISIT_XP = 50;
export const HOSPITAL_FEE = 30;
export const WAKE_HEALTH = 50;
export const BAG_SIZE = 20;
/** He won't buy gear that leaves him with fewer coins than this. */
export const KEEP_COINS = 20;
/** Share of an item's price he gets selling it, before his charm. */
const SELL_SHARE = 0.4;

export type Fx = Partial<Record<Meter | Attr | "xp", number>>;
export type Buff = { name: string; left: number; per_h: Fx; xp_mult: number };
export type Action = {
  name: string;
  min: number;
  cost?: number;
  earn?: number | [number, number];
  fx?: Fx;
  needs?: Partial<Record<Attr | "level", number>> & { time?: TimeOfDay; below?: Partial<Record<Meter, number>> };
  risk?: { p: number; text?: string; fx?: Fx; cost?: number };
  buff?: { name: string; min: number; per_h?: Fx; xp_mult?: number };
  item?: Items.Kind;
  sell?: boolean;
  flavour?: boolean;
};
export type Place = { name: string; class: string; subclass: string; rank: number; lat: number; lon: number; [k: string]: unknown };

export const xpToNext = (lvl: number) => 100 * lvl;

export class Stats {
  meters: Record<Meter, number> = { health: 100, energy: 100, fullness: 80, mood: 70, hygiene: 100, thirst: 80 };
  attrs: Record<Attr, number> = { str: 1, cha: 1, wit: 1, luck: 1 };
  coins = 50;
  /** Coins a trip he couldn't afford needs; he favours paid work until he has them. */
  savingFor = 0;
  xp = 0;
  level = 1;
  buffs: Buff[] = [];
  history = new History();
  visited = new Set<string>();
  gear: Partial<Record<Slot, Item>> = {};
  bag: Item[] = [];
  /** Unix seconds, for history entries; tests replace it. */
  now = () => Math.floor(Date.now() / 1000);

  /** An attribute with his gear's bonuses. */
  attr(name: Attr): number {
    let v = this.attrs[name];
    for (const item of Object.values(this.gear)) v += item?.stats[name] ?? 0;
    return v;
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
    if (!this.isUpgrade(item) || this.coins - item.price < KEEP_COINS)
      return this.say(`Looked at a ${item.rarity} ${item.name}${at} but didn't buy it (${item.price}c)`);
    this.coins -= item.price;
    this.equip(item);
    return this.say(`Bought a ${item.rarity} ${item.name}${at} (-${item.price}c)`);
  }

  /** Sells the cheapest thing in his bag; returns the feed line. */
  sellLoot(where: string): string {
    const at = where ? ` at ${where}` : "";
    if (!this.bag.length) return this.say(`Had nothing to sell${at}`);
    const item = this.sellCheapest();
    return this.say(`Sold his ${item.name}${at} (+${this.sellPrice(item)}c)`);
  }

  sellPrice(item: Item): number {
    return Math.round(item.price * SELL_SHARE * (1 + 0.05 * this.attr("cha")));
  }

  private sellCheapest(): Item {
    let i = 0;
    this.bag.forEach((it, j) => {
      if (it.price < this.bag[i]!.price) i = j;
    });
    const [item] = this.bag.splice(i, 1);
    this.coins += this.sellPrice(item!);
    return item!;
  }

  private bagAdd(item: Item): void {
    if (this.bag.length >= BAG_SIZE) {
      const sold = this.sellCheapest();
      if (sold.price > item.price) {
        this.bag.push(sold); // keep the better one
        this.coins += this.sellPrice(item) - this.sellPrice(sold);
        return;
      }
    }
    this.bag.push(item);
  }

  buffNames(): string[] {
    return this.buffs.map((b) => b.name);
  }

  /** Lets `minutes` pass, `walkedM` of them on the move. */
  passTime(minutes: number, walkedM: number): void {
    const h = minutes / 60;
    const fx: Fx = {
      fullness: -FULLNESS_PER_H * h,
      thirst: -THIRST_PER_H * h,
      hygiene: -HYGIENE_PER_H * h,
      energy: (-ENERGY_PER_KM * EFFORT[this.vehicle()] * walkedM) / 1000,
    };
    for (const m of ["fullness", "thirst"] as const) if (this.meters[m] <= 0) fx.health = (fx.health ?? 0) - STARVING_PER_H * h;
    for (const b of this.buffs) {
      const t = Math.min(minutes, b.left) / 60;
      for (const [m, rate] of Object.entries(b.per_h) as [keyof Fx, number][]) fx[m] = (fx[m] ?? 0) + rate * t;
      b.left -= minutes;
    }
    this.buffs = this.buffs.filter((b) => b.left > 0);
    this.applyFx(fx);
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
    }
  }

  xpMult(): number {
    return this.buffs.reduce((m, b) => m * b.xp_mult, 1);
  }

  /** True when he has the coins, skills, level and timing for `action`. */
  canDo(action: Action, hour: number): boolean {
    if ((action.cost ?? 0) > this.coins) return false;
    if (action.item && this.coins <= KEEP_COINS) return false;
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

  /** Does `action` at `where` and returns the feed line it adds. */
  do(action: Action, where: string, rng: Rng): string {
    if (action.item) {
      this.applyFx(action.fx ?? {});
      return this.buy(Items.make(action.item, this.level, rng), where);
    }
    if (action.sell) {
      this.applyFx(action.fx ?? {});
      return this.sellLoot(where);
    }
    let spent = action.cost ?? 0;
    const fx: Fx = { ...action.fx };
    let text = action.name;
    const risk = action.risk;
    if (risk && rng.randf() < risk.p) {
      spent += risk.cost ?? 0;
      for (const [k, v] of Object.entries(risk.fx ?? {}) as [keyof Fx, number][]) fx[k] = (fx[k] ?? 0) + v;
      text += `, ${risk.text ?? "it went wrong"}`;
    }
    const earn = action.earn ?? 0;
    const earned = Array.isArray(earn) ? rng.randiRange(earn[0], earn[1]) : earn;
    this.coins = Math.max(this.coins - spent + earned, 0);
    if (fx.xp !== undefined) fx.xp = Math.round(fx.xp * this.xpMult());
    this.applyFx(fx);
    const buff = action.buff;
    if (buff) {
      this.buffs = this.buffs.filter((b) => b.name !== buff.name);
      this.buffs.push({ name: buff.name, left: buff.min, per_h: buff.per_h ?? {}, xp_mult: buff.xp_mult ?? 1 });
    }
    const net = earned - spent;
    const money = net ? ` (${net > 0 ? "+" : ""}${net}c)` : "";
    return this.say(text + (where ? ` at ${where}` : "") + money);
  }

  /** First visit to a named place gives bonus XP; returns the XP given. */
  visit(place: Pick<Place, "name" | "lat" | "lon">): number {
    const key = `${place.name}@${place.lat.toFixed(4)},${place.lon.toFixed(4)}`;
    if (this.visited.has(key)) return 0;
    this.visited.add(key);
    this.addXp(FIRST_VISIT_XP);
    return FIRST_VISIT_XP;
  }

  fainted(): boolean {
    return this.meters.health <= 0;
  }

  /** After fainting: patched up at a hospital for a fee. */
  wakeInHospital(hospital: string): string {
    this.coins = Math.max(this.coins - HOSPITAL_FEE, 0);
    this.meters.health = WAKE_HEALTH;
    this.meters.energy = Math.max(this.meters.energy, 30);
    this.meters.fullness = Math.max(this.meters.fullness, 30);
    this.meters.thirst = Math.max(this.meters.thirst, 30);
    return this.say(`Fainted! Woke up at ${hospital || "the hospital"} (-${HOSPITAL_FEE}c)`);
  }

  say(line: string): string {
    this.history.add(line, this.now());
    return line;
  }

  toJSON() {
    return {
      meters: this.meters, attrs: this.attrs, coins: this.coins, savingFor: this.savingFor, xp: this.xp, level: this.level,
      buffs: this.buffs, history: this.history.toJSON(), visited: [...this.visited], gear: this.gear, bag: this.bag,
    };
  }

  static fromJSON(d: ReturnType<Stats["toJSON"]>): Stats {
    const s = new Stats();
    Object.assign(s.meters, d.meters);
    Object.assign(s.attrs, d.attrs);
    s.coins = d.coins;
    s.savingFor = d.savingFor ?? 0;
    s.xp = d.xp;
    s.level = d.level;
    s.buffs = d.buffs ?? [];
    s.history = History.fromJSON(d.history);
    s.visited = new Set(d.visited);
    s.gear = d.gear ?? {};
    s.bag = d.bag ?? [];
    return s;
  }
}

export function inTime(time: TimeOfDay, hour: number): boolean {
  const [a, b] = TIMES[time];
  return a <= b ? hour >= a && hour < b : hour >= a || hour < b;
}
