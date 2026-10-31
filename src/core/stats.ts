// His body, wallet and progress: six meters (0-100), four attributes, coins,
// XP and level, timed buffs, gear and a bag of items, speed, his history and
// his keepsakes (landmark cards, Placedex, souvenirs, crawls), the
// storyteller that paces the incidents that happen to him, his quests, and
// the people in his life: friends, their clubs and news, and his anniversaries,
// what he has learned (skills, cooking and languages), and his life stages
// and family (life.ts): retire() hands over to an heir.
// Time passes in game minutes, which are real minutes while the app is open.
import { Anniversaries } from "./anniversaries";
import * as Bl from "./bills";
import * as Bk from "./bucket";
import * as Bz from "./business";
import * as B from "./bond";
import { crossing, type Borders } from "./border";
import * as Br from "./bricks";
import * as Ca from "./careers";
import { Clubs } from "./clubs";
import * as Cook from "./cooking";
import { Chronicle, COUNTRY_MARKS, LEVEL_MARKS } from "./chronicle";
import * as Cr from "./creatures";
import * as PM from "./placeMoments";
import * as Mg from "./magic";
import { Mind, noun, WANT_XP } from "./mind";
import * as Qk from "./quirks";
import { Diary, type DiaryData } from "./diary";
import { Mailbox, type MailData } from "./mail";
import { SPOT_DISCOUNT, Spots } from "./spot";
import * as Mn from "./midnight";
import * as Pt from "./pet";
import * as Po from "./portals";
import * as Gi from "./giants";
import * as Fa from "./fairy";
import * as F from "./forecast";
import { Fame, cityKey, greeting, tierOf, FAME_NAMES, FAME_PER_H, PAPER } from "./fame";
import { Care, dayOf } from "./gifts";
import { History } from "./history";
import * as Hm from "./home";
import * as Inc from "./incidents";
import * as Items from "./items";
import * as L from "./life";
import * as CC from "./cityCards";
import { JOKE_CHANCE, jokesFor, type Jokes } from "./jokes";
import * as K from "./keepsakes";
import * as Lang from "./languages";
import * as Lt from "./lottery";
import * as M from "./moments";
import type { Item, Slot } from "./items";
import { Records } from "./records";
import * as R from "./repute";
import { Rng, seedOf } from "./rng";
import { euro, signed, toCents } from "./money";
import { meets, speedShare, weatherPerH, type Season, type Sky, type WeatherNeed } from "./sky";
import * as Speeds from "./speeds";
import { Quests } from "./quests";
import { Rival, type Contest } from "./rival";
import { isSkill, PHOTO_SHINE, SKILLS, Skills, type Skill } from "./skills";
import { Friends, type FriendData } from "./friends";
import { Storyteller } from "./storyteller";
import { Townies, type News } from "./townies";
import * as Kit from "./travelKit";
import * as T from "./trips";
import type { Vehicle } from "./speeds";
import * as V from "./visas";
import { Week } from "./week";
import { WORD_WIT, WORD_XP, Words, type WordBook } from "./words";
import * as Work from "./workCards";

export const METERS = ["health", "energy", "fullness", "mood", "hygiene", "thirst"] as const;
export const ATTRS = ["str", "cha", "wit", "luck"] as const;
export type Meter = (typeof METERS)[number];
export type Attr = (typeof ATTRS)[number];
/** Effect keys an action's fx may use. */
export const FX_KEYS = [...METERS, ...ATTRS, "xp", "karma"] as const;
/** Requirement keys an action's needs may use: a skill's key needs that skill's level, `lang` that level of the local language. */
export const NEED_KEYS = ["str", "cha", "wit", "luck", "level", "rank", "time", "below", "season", "weather", ...SKILLS, "lang"] as const;
/** Sun hours (sunrise 6, sunset 18, see sky.ts) that count as each time of day (night wraps past midnight). */
export const TIMES = { morning: [6, 11], day: [10, 18], evening: [17, 23], night: [21, 5], midnight: [0, 3] } as const;
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
/** The buff that keeps him fed and clean on a long walk (hostels on the way). */
export const ON_THE_TRAIL = "On the trail";
export const ENERGY_PER_KM = 2;
/** Share of the walking effort each way of getting about takes, per km. */
export const EFFORT: Record<Vehicle, number> = { "": 1, bike: 0.3, motorcycle: 0.05, car: 0.05, tortoise: 0, broom: 0.2, carpet: 0.05, dragon: 0.05 };
/** Cents of gold his dragon eats each day. Unfed, it sulks and won't fly, so he walks until he can pay. */
export const DRAGON_UPKEEP = 10000;
/** On a day it is fed, his dragon brings back treasure this often, worth DRAGON_TREASURE_MIN-DRAGON_TREASURE_MAX cents. */
export const DRAGON_TREASURE_CHANCE = 0.1;
export const DRAGON_TREASURE_MIN = 5000;
export const DRAGON_TREASURE_MAX = 50000;
/** Ways of getting about on which his pet walks at his side, so the km count for its level. */
export const PET_PACE: ReadonlySet<Vehicle> = new Set<Vehicle>(["", "bike"]);
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
/** Job pay rises this share per point of the attribute the job needs (and per career rank, see careers.ts). */
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
/** Each point of charm adds this share to what a shop pays. */
export const SELL_PER_CHA = 0.05;
/** Treasured items (see Items.isTreasured) he won't sell: his most travelled few. */
export const TREASURED_KEEP = 3;
/** At a resale shop with a full bag he sells his cheapest things until this many are left (a selling run). */
export const SELL_RUN_LEFT = BAG_SIZE / 2;

/** Meter, attribute, XP, Magic and karma changes; Magic stays within 0 to Mg.MAGIC_MAX, karma within ±B.LEAN_MAX (a bad deed is a crime: see Stats.karma). */
export type Fx = Partial<Record<Meter | Attr | "xp" | "magic" | "karma", number>>;
/** A timed effect; `attrs` adds to his attributes while it lasts. */
export type Buff = { name: string; left: number; per_h: Fx; xp_mult: number; attrs?: Partial<Record<Attr, number>> };
export type Action = {
  name: string;
  min: number;
  cost?: number;
  earn?: number | [number, number];
  fx?: Fx;
  needs?: Partial<Record<Attr | Skill | "level" | "lang" | "rank", number>> & { time?: TimeOfDay; below?: Partial<Record<Meter, number>>; season?: Season; weather?: WeatherNeed };
  risk?: { p: number; text?: string; fx?: Fx; cost?: number };
  buff?: { name: string; min: number; per_h?: Fx; xp_mult?: number; attrs?: Partial<Record<Attr, number>> };
  item?: Items.Kind;
  sell?: boolean;
  /** Knocks at the shop after midnight (see midnight.ts). */
  midnight?: boolean;
  /** Buys a pack of city cards (see cityCards.ts). */
  pack?: boolean;
  /** A resale shop's sale: with a full bag he sells a load here (see SELL_RUN_LEFT), and such shops pull him while the bag is full. */
  resale?: boolean;
  flavour?: boolean;
  /** A nap or a night's sleep: he may dream (see diary.ts). */
  sleep?: boolean;
  /** The career (see careers.ts) this job counts for; a `rank` need is a rank in it. */
  career?: string;
  /** A kind (1) or rascal (-1) deed: doing it leans him that way (see bond.ts). */
  deed?: number;
  /** Shoplifting, rascals only: he takes the shop's `item` for free, marked stolen (see repute.ts). */
  steal?: boolean;
  /** Pays off the police heat, at a police station (see repute.ts PAYOFF_STARS). */
  bounty?: boolean;
  /** The skill it trains, and whose level makes its gains and pay bigger (see skills.ts). */
  skill?: Skill;
  /** Ingredients sold here: he buys one for his pantry (see cooking.ts). */
  groceries?: Cook.Ingredient[];
  /** Cooks the best meal his pantry and cooking level allow; its fx stand for a typical meal while he picks (see cooking.ts). */
  cook?: boolean;
  /** A chat with the locals, which counts towards the local language (see languages.ts). */
  lang?: boolean;
  /** A ticket for the next lottery draw, one a draw (see lottery.ts). */
  lottery?: boolean;
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
  /** The day (see gifts.ts dayOf) his dragon last ate, and the day he last said it sulks. */
  dragonFed = "";
  dragonSulked = "";
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
  /** Border words and quips from data/borders.json; not saved, the game sets it. */
  borders: Borders | null = null;
  /** Everyday words by language from data/words.json; not saved, the game sets it once loaded. */
  wordBook: WordBook | null = null;
  /** The local words he has learned. */
  words = new Words();
  /** The daily forecasts from data/forecasts.json; not saved, the game sets it. */
  forecasts: readonly F.Forecast[] = [];
  /** His shifts and ranks in each career. */
  careers = new Ca.Careers();
  /** Clovers and the care package on its way to him. */
  care = new Care();
  /** His trust in you, his lean (his karma) and your whispers. */
  bond = new B.Bond();
  /** How well each city knows him. */
  fame = new Fame();
  /** The police heat on him, and his record. */
  law = new R.Law();
  /** His letters to you from data/letters.json; not saved, the game sets it. */
  letters: B.Letters | null = null;
  /** His diary (saved), and its templates from data/diary.json (not saved, the game sets them). */
  diary = new Diary();
  diaryData: DiaryData | null = null;
  /** Letters and gifts from his friends (saved), and their lines from data/mail.json (not saved, the game sets them). */
  mail = new Mailbox();
  mailData: MailData | null = null;
  /** Golden bricks and the monuments they paid for. */
  bricks = new Br.Bricks();
  /** His life, one sentence per milestone. */
  chronicle = new Chronicle();
  /** His life stage, his care in it, and his family (life.ts). */
  life = new L.Life();
  /** The place creatures he has met. */
  creatures = new Cr.Creatures();
  /** Who the place creatures are, from data/creatures.json; not saved, the game sets it. */
  creatureKinds: readonly Cr.Creature[] = [];
  /** The choice or mini-game at each kind of place (data/moments.json). */
  placeMoments: PM.PlaceMoments = {};
  /** His Magic meter, 0 to Mg.MAGIC_MAX: ley lines fill it, spells spend it (magic.ts). */
  magic = 0;
  /** The spells he knows and the ley places he drew from today. */
  lore = new Mg.Lore();
  /** What the spells are, from data/spells.json; not saved, the game sets it. */
  spellKinds: readonly Mg.Spell[] = [];
  /** The enchantments and trinkets he found at the shop after midnight. */
  finds = new Mn.Finds();
  portals = new Po.Portals();
  giants = new Gi.Sightings();
  rings = new Fa.Rings();
  /** This week in numbers, and last week's recap. */
  week = new Week();
  /** His bests and lifetime totals. */
  records = new Records();
  /** Paces the incidents. */
  story = new Storyteller();
  /** His quests, the city's quest board and the world events near him. */
  quests = new Quests();
  /** His moodlets, wants and fears. */
  mind = new Mind();
  /** His quirks from habits, and his spot in each city. */
  quirks = new Qk.Quirks();
  spots = new Spots();
  /** Viktor, his rival. */
  rival = new Rival();
  /** What he and Viktor compete for, from data/rival.json; not saved, the game sets it. */
  contests: readonly Contest[] = [];
  /** The locals he knows, his partner, and a fellow traveller on a trip. */
  friends = new Friends();
  /** Names, faces and fellow travellers from data/friends.json; not saved, the game sets it. */
  friendData: FriendData = { names: [], icons: [], companions: [] };
  /** The clubs his friends brought him into. */
  clubs = new Clubs();
  /** What his friends got up to, and the day it was last rolled. */
  townies = new Townies();
  /** The news his friends may have, from data/friends.json; not saved, the game sets it. */
  townNews: readonly News[] = [];
  /** His birthday (the day he set out) and month marks. */
  anniversaries = new Anniversaries();
  /** His six skills. */
  skills = new Skills();
  /** The ingredients he carries for cooking. */
  pantry = new Cook.Pantry();
  /** The languages he speaks, and how well. */
  languages = new Lang.Languages();
  /** The businesses he owns, and what they bring in. */
  business = new Bz.Business();
  /** His lottery ticket and wins. */
  lottery = new Lt.Lottery();
  /** His bucket list (see bucket.ts). */
  bucket = new Bk.Bucket();
  /** Days in each country, and his visas there. */
  visas = new V.Visas();
  /** His pet, and the pets he had. */
  pets = new Pt.Pets();
  /** His flat, rented then bought (see home.ts). */
  home = new Hm.Home();
  /** The incident deck from data/incidents.json; not saved, the game sets it. */
  incidents: readonly Inc.Incident[] = [];
  /** The feed line of the last incident, so the screen can make it stand out; not saved. */
  incidentLine = "";
  /** Minutes walked since the last roll for money on the street. */
  walkMin = 0;
  /** Unix seconds, for history entries; tests (and the catch-up) replace it. */
  now = () => Math.floor(Date.now() / 1000);
  /** The sky over him (season, sun, weather); the game and the catch-up set it, null when unknown. */
  sky: Sky | null = null;
  /** Hears every feed line as it is said; the catch-up collects them for its summary. */
  onSay: ((line: string, t: number) => void) | null = null;

  /** An attribute with his gear's and buffs' bonuses, and for Charm a finished city card set and the local language; Charm counts less while he is dirty. */
  attr(name: Attr): number {
    let v = this.attrs[name];
    for (const item of Object.values(this.gear)) v += item?.stats[name] ?? 0;
    for (const b of this.buffs) v += b.attrs?.[name] ?? 0;
    if (name === "cha" && this.where.code && this.keepsakes.sets.includes(this.where.code)) v += CC.SET_CHARM;
    if (name === "cha") v += this.languages.charm(this.lang());
    if (name === "cha" && this.meters.hygiene < DIRTY_AT) v *= 1 - (DIRTY_CHARM_CUT * (DIRTY_AT - this.meters.hygiene)) / DIRTY_AT;
    return v;
  }

  /** The language spoken where he is, or "" when the country is unknown. */
  lang(): string {
    return Lang.languageOf(this.borders?.languages, this.where.code, this.where.country);
  }

  /** Today's forecast, by his clock. */
  forecast(): F.Forecast {
    return F.forecastAt(this.forecasts, this.now());
  }

  /** The kind of vehicle he rides, or "" on foot. */
  vehicle(): Vehicle {
    return this.gear.vehicle?.vehicle ?? "";
  }

  /** True while his dragon has not eaten today, so it won't fly. */
  sulking(): boolean {
    return this.vehicle() === "dragon" && this.dragonFed !== dayOf(this.now() * 1000);
  }

  /** How he gets about right now: his vehicle, or on foot while his dragon sulks. */
  getsAbout(): Vehicle {
    return this.sulking() ? "" : this.vehicle();
  }

  /** Feeds his dragon its gold once a day, if he can, and now and then it brings back treasure. Returns the feed line, or "". */
  feedDragon(rng: Rng): string {
    if (!this.sulking()) return "";
    const today = dayOf(this.now() * 1000);
    if (this.cents < DRAGON_UPKEEP) {
      if (this.dragonSulked === today) return "";
      this.dragonSulked = today;
      return this.say(`His dragon sulks: no gold for it today (${euro(DRAGON_UPKEEP)}), so he walks`);
    }
    this.cents -= DRAGON_UPKEEP;
    this.dragonFed = today;
    let line = this.say(`Fed his dragon its daily gold (${signed(-DRAGON_UPKEEP)})`);
    if (rng.randf() < DRAGON_TREASURE_CHANCE) {
      const n = rng.randiRange(DRAGON_TREASURE_MIN, DRAGON_TREASURE_MAX);
      this.cents += n;
      line = this.say(`His dragon flew off and came back with treasure (${signed(n)})`);
    }
    return line;
  }

  /** Speed percent from his gear; his vehicle's doesn't count while he is `afoot` or his dragon sulks. */
  speedBonus(afoot = false): number {
    let v = 0;
    const noRide = afoot || this.sulking();
    for (const [slot, item] of Object.entries(this.gear)) if (!(noRide && slot === "vehicle")) v += item?.stats.speed ?? 0;
    return v;
  }

  /** Meters per second: walking (`afoot`, as after a flyer lands) or his vehicle (see getsAbout), +1% a level above 1 and gear's speed percent, slower when tired or on foot in snow. */
  speedMps(afoot = false): number {
    const v = afoot ? "" : this.getsAbout();
    const base = v ? Speeds.FOR_VEHICLE[v] : Speeds.WALK;
    const tired = 0.5 + 0.5 * Math.min(this.meters.energy / TIRED_ENERGY, 1);
    return base * (1 + SPEED_PER_LEVEL * (this.level - 1) + this.speedBonus(afoot) / 100) * tired * speedShare(this.sky, v) * this.life.info().speed;
  }

  /** The next vehicle he saves up for, or null once he has a dragon. */
  vehicleGoal(): Items.VehicleGoal | null {
    return Items.nextVehicle(this.vehicle());
  }

  /** Cents he saves up to: a trip fare, or his next vehicle plus his reserve, whichever is more. */
  savingTarget(): number {
    return Math.max(this.savingFor, this.vehicleSaving());
  }

  /** Cents he saves up for his vehicle: the next one plus his reserve (and a dragon's first day of gold), or while his dragon is unfed today, its gold plus his reserve. */
  vehicleSaving(): number {
    const goal = this.vehicleGoal();
    if (goal) return this.priced(goal.cents) + KEEP_CENTS + (goal.kind === "dragons" ? DRAGON_UPKEEP : 0);
    return this.sulking() ? DRAGON_UPKEEP + KEEP_CENTS : 0;
  }

  /** True while he has less than he saves up to. */
  saving(): boolean {
    return this.cents < this.savingTarget() || this.bond.nudge === "save";
  }

  /** How full meter `m` feels when he picks what to do: empty while he follows a whisper to eat (fullness, thirst) or rest (energy). */
  felt(m: Meter): number {
    const n = this.bond.nudge;
    if ((n === "eat" && (m === "fullness" || m === "thirst")) || (n === "rest" && m === "energy")) return 0;
    return this.meters[m];
  }

  /** What a job pays, as a multiple of its listed wage: 1, plus WAGE_PER_RANK a rank above 1 in its career and WAGE_PER_ATTR per point of the attributes it needs, times its skill's (see skills.ts). */
  wageMult(action: Action): number {
    let m = 1 + (action.career ? Ca.WAGE_PER_RANK * (this.careers.rank(action.career) - 1) : 0);
    for (const a of ATTRS) if (action.needs?.[a] !== undefined) m += WAGE_PER_ATTR * this.attr(a);
    if (action.skill) m *= this.skills.mult(action.skill);
    return m * F.mult(this.forecast(), "wage") * this.visas.payMult(this.where.code) * this.life.info().wage;
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
    const price = this.priced(item.price);
    if (!this.isUpgrade(item) || this.cents - price < KEEP_CENTS)
      return this.say(`Looked at a ${item.rarity} ${item.name}${at} but didn't buy it (${euro(price)})`);
    this.cents -= price;
    item.story = { from: this.where.city, t: this.now(), countries: this.where.code ? [this.where.code] : [], km: 0 };
    this.equip(item);
    return this.say(`Bought a ${item.rarity} ${item.name}${at} (${signed(-price)})`);
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
    const rascal = this.bond.leaning() === "rascal" ? B.RASCAL_SELL : 1;
    return Math.round(item.price * SELL_SHARE * (1 + SELL_PER_CHA * this.attr("cha")) * F.mult(this.forecast(), "sell") * rascal);
  }

  /**
   * Pays `fare` for a ride by `mode` from `station` to `to` ("Plovdiv,
   * Bulgaria") and returns its History line, the same while he plays and in
   * the catch-up. A rascal on a bus may dodge the fare (DODGE_CHANCE) and, if
   * caught (CAUGHT_CHANCE), is fined FINE_MULT times the fare, as much as he
   * has. His partner comes along, or maybe a fellow traveller who pays back
   * part of what he paid (never of a fine). Rolls its own dice from the
   * station and time, so the walk's stay the same.
   */
  ride(fare: number, mode: string, station: string, to: string): string {
    let paid = fare;
    let how = "";
    if (mode === "bus" && this.bond.leaning() === "rascal") {
      const rng = new Rng(seedOf(`${station}${this.now()}`));
      if (rng.randf() < B.DODGE_CHANCE) {
        const caught = rng.randf() < B.CAUGHT_CHANCE;
        paid = caught ? Math.min(fare * B.FINE_MULT, this.cents) : 0;
        how = caught ? " without a ticket, got caught and was fined" : " without a ticket";
        this.deed(-1);
      }
    } else if ((mode === "bus" || mode === "train") && this.bond.leaning() === "kind" && new Rng(seedOf(`free${station}${this.now()}`)).randf() < R.FREE_RIDE_CHANCE) {
      paid = 0;
      how = ", and the conductor waved him on for free, as he's known for being kind";
    }
    // His partner comes along, or maybe a fellow traveller who splits the fare he paid (not a fine); own dice, so the dodge's stay the same.
    const { back, with: company } = this.friends.board(how ? 0 : paid, this.friendData, new Rng(seedOf(`${to}${station}${this.now()}`)));
    paid -= back;
    this.cents -= paid;
    if (mode === "bike") return `Cycled off to ${to}${company}`;
    if (mode === "walk") {
      // Hostel meals and showers on the way keep him fed and clean.
      this.addBuff({ name: ON_THE_TRAIL, min: T.LONG_WALK_MAX_S / 60, per_h: { fullness: FULLNESS_PER_H, thirst: THIRST_PER_H, hygiene: HYGIENE_PER_H } });
      return `Walked out of town towards ${to}${company}${paid ? ` (${signed(-paid)} for hostels)` : ""}`;
    }
    if (mode === "hitch") return `Hitchhiked to ${to}${company}`;
    return `${mode === "car" ? "Filled up and drove" : `Took the ${mode}`} to ${to} from ${station}${how}${company}${paid ? ` (${signed(-paid)})` : ""}`;
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

  /** Boards a ride (see ride) to `to`, in country `code`, and packs for it (see packForTrip): the feed lines, the same watched and in the catch-up. */
  board(fare: number, mode: T.Mode, station: string, to: string, code: string): string[] {
    return [this.ride(fare, mode, station, to), this.packForTrip(code)].filter(Boolean);
  }

  /** Lands in `to` after `distM` of road by `mode` from longitude `fromLon` to `toLon` (see landFlight, landRide): the feed lines, the same watched and in the catch-up. */
  land(mode: T.Mode, fromLon: number, toLon: number, distM: number, to: string): string[] {
    return [mode === "plane" ? this.landFlight(fromLon, toLon) : "", this.landRide(mode, distM, to)].filter(Boolean);
  }

  /** As he boards for a city in country `code`: buys the travel kit he needs and starts its buffs; the feed line, or "" when he packs nothing. */
  packForTrip(code: string): string {
    const abroad = this.where.code !== "" && code !== this.where.code;
    const kit = Kit.choose(this.meters, this.cents, abroad, KEEP_CENTS);
    if (!kit.length) return "";
    let cost = 0;
    for (const k of kit) {
      cost += k.cents;
      this.addBuff(k.buff);
    }
    this.cents -= cost;
    return `Packed ${Kit.list(kit.map((k) => k.name))} for the trip (${signed(-cost)})`;
  }

  /** Landed after flying from longitude `fromLon` to `toLon`: jet lag for the time zones crossed; the feed line, or "". */
  landFlight(fromLon: number, toLon: number): string {
    const zones = T.timeZones(fromLon, toLon);
    const lag = T.jetLag(zones);
    if (!lag) return "";
    this.addBuff(lag);
    return `Jet-lagged after flying across ${zones} time zone${zones === 1 ? "" : "s"}`;
  }

  /**
   * Landed in `to` after `distM` by `mode`: a night train leaves him rested,
   * cycling tires him, a long walk ends his hostel buff with XP and mood, a portal puzzles him, and a hitched lift may go badly or be a great story
   * (its own dice from the town and time, so the walk's stay the same). The
   * feed line, or "".
   */
  landRide(mode: T.Mode, distM: number, to: string): string {
    if (mode === "train" && distM >= T.SLEEPER_FROM_M) {
      this.meters.energy = 100;
      return "Slept in a berth on the night train and woke up rested";
    }
    if (mode === "bike") {
      const km = distM / 1000;
      this.applyFx({ energy: -ENERGY_PER_KM * EFFORT.bike * km });
      return `Tired legs after cycling ${Math.round(km)} km`;
    }
    if (mode === "walk") {
      const km = Math.round(distM / 1000);
      this.buffs = this.buffs.filter((b) => b.name !== ON_THE_TRAIL);
      this.applyFx({ xp: T.LONG_WALK_XP_PER_KM * km, mood: T.LONG_WALK_MOOD });
      const n = T.hostelNights(distM);
      return `Walked ${km} km to ${to}${n ? `, sleeping in ${n} hostel${n === 1 ? "" : "s"} on the way` : ""}`;
    }
    if (mode === "portal") return `🌀 Stepped out in ${to}, blinking. Nobody saw him arrive`;
    if (mode !== "hitch") return "";
    const r = new Rng(seedOf(`hitch${to}${this.now()}`)).randf();
    if (r < T.HITCH_BAD) {
      this.applyFx(T.HITCH_BAD_FX);
      return "The driver let him off miles short, and he walked the last stretch";
    }
    if (r < T.HITCH_BAD + T.HITCH_GOOD) {
      this.applyFx(T.HITCH_GOOD_FX);
      return "The driver told stories the whole way: a ride to remember";
    }
    return "A quiet lift with a friendly driver";
  }

  /** Starts a timed effect, replacing one of the same name. */
  addBuff(buff: NonNullable<Action["buff"]>): void {
    this.buffs = this.buffs.filter((b) => b.name !== buff.name);
    this.buffs.push({ name: buff.name, left: buff.min, per_h: buff.per_h ?? {}, xp_mult: buff.xp_mult ?? 1, ...(buff.attrs ? { attrs: buff.attrs } : {}) });
  }

  buffNames(): string[] {
    return this.buffs.map((b) => b.name);
  }

  /** Lets `minutes` pass, `walkedM` of them on the move (on foot when `afoot`, else as he gets about). */
  passTime(minutes: number, walkedM: number, afoot = false): void {
    const t = this.now();
    if (this.week.roll(t, this.cents, this.level, -new Date(t * 1000).getTimezoneOffset())) this.payBills();
    const date = dayOf(t * 1000);
    if (date !== this.anniversaries.day) this.newDay(date, t);
    if (this.lottery.ticket && t >= this.lottery.ticket) this.lotteryDraw(Lt.roll(new Rng(seedOf(`lottery${this.lottery.ticket}:${this.lottery.tickets}:${this.cents}`)).randf(), this.attr("luck")));
    this.week.walked(walkedM);
    const h = minutes / 60;
    const sky = weatherPerH(this.sky);
    const fx: Fx = {
      fullness: -FULLNESS_PER_H * h,
      thirst: -THIRST_PER_H * sky.thirstMult * h,
      hygiene: -HYGIENE_PER_H * h,
      mood: (sky.mood - MOOD_PER_H - (this.meters.hygiene < DIRTY_AT ? DIRTY_MOOD_PER_H : 0) + this.pets.moodPerH(date)) * h,
      energy: (-ENERGY_PER_KM * EFFORT[afoot ? "" : this.getsAbout()] * F.mult(this.forecast(), "effort") * walkedM) / 1000 + sky.energy * h,
    };
    for (const m of ["fullness", "thirst"] as const) if (this.meters[m] <= 0) fx.health = (fx.health ?? 0) - STARVING_PER_H * h;
    this.age(minutes, t, walkedM, fx.health !== undefined);
    for (const b of this.buffs) {
      const t = Math.min(minutes, b.left) / 60;
      for (const [m, rate] of Object.entries(b.per_h) as [keyof Fx, number][]) fx[m] = (fx[m] ?? 0) + rate * t;
      b.left -= minutes;
    }
    this.buffs = this.buffs.filter((b) => b.left > 0);
    this.bond.pass(minutes);
    this.law.pass(minutes);
    this.addFame(FAME_PER_H * h);
    this.story.pass(minutes, this.cents);
    // Time in a country teaches its language; the first country he is in is his own.
    const lang = this.lang();
    this.languages.setNative(lang);
    this.sayIf(this.languages.add(lang, minutes / 60));
    fx.mood = (fx.mood ?? 0) + this.mind.pass(minutes);
    this.mind.refill(t, () => new Rng(seedOf(`want${t}`)));
    // Enchanted gear gathers Magic as he walks.
    fx.magic = (fx.magic ?? 0) + (this.gearMagic() * walkedM) / 1000;
    this.applyFx(fx);
    this.business.pass(h);
    this.castIfNeeded();
    if (walkedM) for (const item of Object.values(this.gear)) if (item?.story) item.story.km += walkedM / 1000;
    // His pet walks at his side on foot or by bike, and rides along otherwise.
    const pet = walkedM && PET_PACE.has(afoot ? "" : this.getsAbout()) ? this.pets.walked(walkedM) : 0;
    if (pet) this.say(`${this.pets.title()} reached level ${pet} (${Math.round(this.pets.pet!.km)} km walked together)`);
    this.sayIf(this.records.walked(walkedM, this.cents, t, dayOf(t * 1000)));
  }

  /** Lets `minutes` of his life pass at `t`: a new stage gets a feed line, a chronicle line and its care nudge; the end of elder, one line that he is ready to retire. */
  private age(minutes: number, t: number, walkedM: number, starving: boolean): void {
    const due = this.life.retireDue;
    for (const stage of this.life.pass(minutes, t, this.where.city, walkedM, starving)) {
      const st = L.STAGES[stage]!;
      const nudge = L.TIERS[this.life.tier(stage)].nudge;
      const title = L.withArticle(this.life.title(stage));
      if (nudge && st.attr) this.attrs[st.attr] = Math.max(this.attrs[st.attr] + nudge, 0);
      const name = st.attr && Inc.ATTR_NAMES[st.attr];
      this.say(`${st.icon} Now ${title}${nudge && name ? ` (${name} ${nudge > 0 ? "+" : "−"}${Math.abs(nudge)})` : ""}`);
      this.milestone(`stage${stage}`, `Became ${title}`);
    }
    if (this.life.retireDue && !due) this.say(`🌅 Ready to retire in ${this.homeCity().split(",")[0]}`);
  }

  /**
   * He retires (`by` age, or by you from the menu): the family tree keeps him
   * with his letter and life story, and an heir one generation on starts
   * with the family perk, his best worn item that isn't a vehicle, the
   * family's keepsakes (the card binder, Placedex, souvenirs, badges, creatures,
   * giants, fairy finds, midnight finds, portals) and monuments, his pet, your clovers and your storyteller. He stops in `home`,
   * his favourite city unless its streets won't load (see game.ts retire). Changes
   * nothing of his, so the game can try again; the heir says hello once he is out.
   */
  retire(by: L.Ancestor["by"], home = this.homeCity()): { heir: Stats; ancestor: L.Ancestor } {
    const t = this.now();
    const heirloom = Object.values(this.gear)
      .filter((it): it is Item => !!it && !it.vehicle)
      .sort((a, b) => Items.power(b) - Items.power(a))[0];
    const me = { gen: this.life.gen, born: this.life.born || t, retired: t, by, title: this.life.title(), level: this.level, km: this.life.km, cities: this.records.cities.length || 1, home, heirloom: heirloom?.name ?? "" };
    // The retirement line goes only in his copy, so a retirement that can't start yet (see game.ts) leaves his life story as it was.
    const ancestor: L.Ancestor = { ...me, letter: L.letter(me), chronicle: [...this.chronicle.lines, { t, text: `Retired in ${home.split(",")[0]}` }] };
    const heir = new Stats();
    heir.now = this.now;
    heir.onSay = this.onSay;
    heir.life = this.life.heir(ancestor);
    heir.cents = START_CENTS + heir.life.perkCents();
    // A new walker owes the police nothing: what the old one stole is his heir's by right.
    if (heirloom) heir.gear[heirloom.slot] = { ...heirloom, stolen: undefined };
    heir.keepsakes = this.keepsakes;
    heir.bricks = this.bricks;
    heir.care = this.care;
    heir.pets = this.pets;
    // The Collection's other finds stay with the family too.
    heir.creatures = this.creatures;
    heir.giants = this.giants;
    heir.rings = this.rings;
    heir.finds = this.finds;
    heir.portals = this.portals;
    heir.home = this.home;
    heir.story.style = this.story.style;
    heir.milestone("heir", `Took over from ${L.walkerName(this.life.gen)}, who retired in ${home.split(",")[0]}`);
    return { heir, ancestor };
  }

  /** The first minute of local day `date`: maybe news from a friend, and his birthday or a month mark. Own dice, from the date. */
  private newDay(date: string, t: number): void {
    this.dreams(t, true);
    if (this.diary.close(date, this.where.city, this.diaryData, new Rng(seedOf(`diary${date}`)))) this.say("📔 He wrote in his diary");
    this.petDay(date, t);
    this.takings();
    this.settle(t);
    this.invest(t);
    this.visaDay();
    const f = this.friends;
    this.townies.prune(f.list);
    this.sayIf(this.townies.roll(date, f.list, f.partner, this.townNews, this.records.cities, new Rng(seedOf(`townies${date}`))));
    // Big news comes as a letter: it goes in his mailbox too, and is the day's only letter.
    const news = this.townies.letter;
    if (news) this.mail.add({ from: news.friend.name, icon: news.friend.icon, city: news.city, text: news.text, t });
    const spots = Object.keys(this.spots.cities).filter((c) => this.spots.spot(c));
    for (const line of this.mail.day(t, this.where.city, f.list, f.partner, spots, this.mailData, new Rng(seedOf(`mail${date}`)), !!news)) this.say(line);
    const mark = this.anniversaries.check(date, t, this.meters.mood, this.where.city, f.list, f.partner, new Rng(seedOf(`party${date}`)));
    if (!mark) return;
    this.applyFx(mark.fx);
    if (mark.buff) this.addBuff(mark.buff);
    this.say(mark.line);
  }

  /** A new day in the country he is in: it counts for his visa there (see visas.ts), and he says when it gets better or his stay is nearly up. */
  private visaDay(): void {
    const { code, country } = this.where;
    const up = this.visas.day(code);
    const where = country || code;
    if (up) this.say(`His visa in ${where} is now ${up.name}: ${up.stay === Infinity ? "no limit on his stay" : `stays of up to ${up.stay} days`}, ${Math.round(up.pay * 100)}% more pay at work there`);
    else if (code && this.visas.left() === 0) this.say(`Last day on his visa in ${where}: he'll be moving on soon`);
  }

  /** His businesses pay out what they took in since the last day. */
  private takings(): void {
    const c = this.business.payout();
    if (!c) return;
    this.cents += c;
    const b = this.business;
    const icons = b.owned.map((o) => Bz.kindOf(o.id)!.icon).join("") + (b.shares.length ? "🏠" : "");
    this.say(`${icons} His ${Bz.namesOf(b.owned, b.shares)} took in ${signed(c)}`);
  }

  /** Where he settles and retires: his home's city, or else the one he spent most time in. */
  homeCity(): string {
    return this.home.city || this.life.favourite(this.where.city);
  }

  /** True when `action` at a place of map class `kind` is a night in his own bed: a hostel or hotel night in his home city, free, and it cheers him. */
  nightAtHome(action: Action, kind: string): boolean {
    return !!action.sleep && kind === "lodging" && this.atHome();
  }

  /** True in his home's city. */
  atHome(): boolean {
    return this.isHome(this.where.city);
  }

  /** True when `city` (by name, as `where.city` and an item's story keep it) is his home's city: the same name, or a city whose middle is near his flat. */
  isHome(city: string): boolean {
    const h = this.home;
    return h.has() && (city === h.city || h.near(this.life.cityAt[city]));
  }

  /**
   * Each morning (see home.ts): with no home yet, he rents a flat where he is
   * once the city knows him as a Regular; renting, he buys it with its price
   * to spare past what he saves up for (not while you whisper to save); and
   * in a home he owns he puts up a thing from his travels.
   */
  private settle(t: number): void {
    const h = this.home;
    const town = this.where.city.split(",")[0];
    if (!h.has()) {
      const spot = this.spots.spot(this.where.city);
      const at = spot ? ([spot.lat, spot.lon] as T.LatLon) : this.life.cityAt[this.where.city];
      if (!at || this.fame.tier(this.here()) < Hm.RENT_TIER) return;
      h.rent(this.where.city, this.where.code, at, t);
      this.milestone("home_rent", `Rented a flat in ${town}`);
      this.say(`🏡 Rented a flat in ${town}${spot ? ` near ${spot.name}` : ""}: ${euro(h.rentAt(this.level))} a week with his bills`);
      return;
    }
    if (!h.bought) {
      if (this.bond.nudge === "save" || this.cents - Math.max(this.savingTarget(), KEEP_CENTS) < Hm.HOME_PRICE) return;
      this.cents -= Hm.HOME_PRICE;
      h.bought = t;
      this.milestone("home_buy", `Bought his flat in ${h.city.split(",")[0]}`);
      this.say(`🔑 Bought his flat in ${h.city.split(",")[0]} (${signed(-Hm.HOME_PRICE)}): no more rent`);
      return;
    }
    if (!this.atHome() || h.things.length >= Hm.HOME_THINGS) return;
    const it = Hm.nextThing(this.bag, (from) => this.isHome(from), Items.isTreasured);
    if (!it) return;
    this.bag.splice(this.bag.indexOf(it), 1);
    h.things.push(it);
    this.say(`🖼 Put up his ${it.name} from ${it.story!.from.split(",")[0]} at home (${h.things.length} of ${Hm.HOME_THINGS})`);
  }

  /** Each morning: a share in his spot here if he has none in this city, then, with the next business's price to spare past what he saves up for (and his reserve), he buys it where he is (see business.ts). Not while you whisper to save. */
  private invest(t: number): void {
    if (this.bond.nudge === "save") return;
    const spare = () => this.cents - Math.max(this.savingTarget(), KEEP_CENTS);
    const spot = this.spots.spot(this.where.city);
    if (spot && !this.business.share(this.where.city) && spare() >= Bz.SHARE_PRICE) {
      this.cents -= Bz.SHARE_PRICE;
      this.business.buyShare(this.where.city, spot, t);
      this.milestone("share", `Bought a share in ${spot.name}, his spot`);
      this.say(`🏠 Bought a share in ${spot.name}, his spot (${signed(-Bz.SHARE_PRICE)}): it pays a little each day, more when he drops by`);
    }
    const k = this.business.next();
    if (!k || spare() < k.cents) return;
    const city = this.where.city.split(",")[0] || "town";
    this.cents -= k.cents;
    this.business.buy(k, city, t);
    const line = `${k.icon} Bought a ${k.name} in ${city} (${signed(-k.cents)}): a local runs it, and it should bring in about ${euro(k.perH * 24)} a day`;
    this.milestone(`business_${k.id}`, `Bought a ${k.name} in ${city}`);
    this.say(line);
  }

  /** Tonight's lottery draw for the ticket he holds: `prize` (see lottery.ts roll) paid, or no luck. Returns the feed line. */
  lotteryDraw(prize: Lt.Prize | null): string {
    const l = this.lottery;
    l.ticket = 0;
    l.tickets++;
    if (!prize) return this.say("🎟 Tonight's lottery draw: no luck this time");
    this.cents += prize.cents;
    l.prizes++;
    l.won += prize.cents;
    l.best = Math.max(l.best, prize.cents);
    this.applyFx({ mood: prize.mood });
    const say = prize.say[new Rng(seedOf(`lotterysay${this.now()}`)).randiRange(0, prize.say.length - 1)]!;
    const line = `🎟 ${say.replace("{WON}", euro(prize.cents))}`;
    if (prize.match >= Lt.BIG_MATCH) this.milestone(`lottery${prize.match}`, `Won ${euro(prize.cents)} on the lottery with ${prize.match} numbers`);
    return this.say(line);
  }

  /** Buys a ticket for the next draw; returns the feed line. */
  private buyTicket(action: Action, where: string): string {
    const cost = toCents(action.cost ?? 0);
    this.cents = Math.max(this.cents - cost, 0);
    this.lottery.ticket = Lt.nextDraw(this.now());
    this.applyFx(action.fx ?? {});
    const today = dayOf(this.lottery.ticket * 1000) === dayOf(this.now() * 1000);
    return this.say(`🎟 Bought a lottery ticket${where ? ` at ${where}` : ""} for ${today ? "tonight's" : "tomorrow's"} draw${cost ? ` (${signed(-cost)})` : ""}`);
  }

  /** The week's bills (see bills.ts): paid if he can, or else a debt collector takes the cheapest thing in his bag that isn't treasured. */
  private payBills(): void {
    const rent = this.home.rentAt(this.level);
    const due = Bl.billsAt(this.level) + rent;
    const what = [...(rent ? ["rent"] : []), ...Bl.BILLS.map((b) => b.name)].join(", ");
    if (this.cents >= due) {
      this.cents -= due;
      this.say(`Paid the week's bills: ${what} (${signed(-due)})`);
      return;
    }
    let item: Item | null = null;
    for (const it of this.bag) if (!Items.isTreasured(it) && (!item || it.price < item.price)) item = it;
    if (!item) {
      this.say(`Couldn't pay the week's bills (${euro(due)}), and the debt collector found nothing to take: written off`);
      return;
    }
    this.bag.splice(this.bag.indexOf(item), 1);
    this.say(`Couldn't pay the week's bills (${euro(due)}): a debt collector took his ${item.name} instead`);
  }

  /** A new day for his pet: it eats if he can pay, or else is grumpy today; when its days are over it passes. */
  private petDay(date: string, t: number): void {
    const p = this.pets.pet;
    if (!p) return;
    if (this.pets.oldAt(t)) {
      const title = this.pets.title();
      const days = Math.round((t - p.since) / 86400);
      this.pets.pass(t);
      this.addBuff({ name: `Missing ${p.name}`, min: Pt.MISSING_MIN, per_h: { mood: Pt.MISSING_MOOD_PER_H } });
      const line = p.fairy ? `${title} went back to the fairy hills, after ${days} days together` : `${title} passed away in its sleep, old and much loved, after ${days} days together`;
      this.milestone(`pet_gone${p.since}`, line);
      this.say(line);
      return;
    }
    if (this.cents < Pt.PET_FOOD) {
      this.say(`No money for pet food today (${euro(Pt.PET_FOOD)}): ${p.name} is grumpy`);
      return;
    }
    this.cents -= Pt.PET_FOOD;
    p.fed = date;
  }

  /** A stray of `kind` at `place` may stay with him for good, if he has no pet yet. Its own dice, so the walk's stay the same. */
  private stray(kind: Pt.PetKind, place: string): void {
    if (this.pets.pet) return;
    const t = this.now();
    const rng = new Rng(seedOf(`pet${t}${place}`));
    if (rng.randf() >= Pt.ADOPT_CHANCE) return;
    const p = this.pets.adopt(kind, t, dayOf(t * 1000), rng);
    this.milestone(`pet${t}`, `Took in a stray ${kind} and named it ${p.name}`);
    this.say(`The ${kind} stays with him for good. He names it ${p.name}`);
  }

  /** Right after reaching `place`: a pet high enough may show its fairy self at a real old place (see pet.ts). Its own dice, so the walk's stay the same. */
  private petAt(place: Pick<Place, "name" | "class"> & { made?: unknown }): void {
    const p = this.pets.pet;
    if (!p || p.fairy || this.pets.level() < Pt.FAIRY_LEVEL || !Pt.isFairyPlace(place)) return;
    if (new Rng(seedOf(`fairy${p.name}${this.now()}${place.name}`)).randf() >= Pt.FAIRY_CHANCE) return;
    p.fairy = true;
    const f = Pt.KINDS[p.kind].fairy;
    const line = `At ${place.name}, ${f.where}: ${p.name} was a ${f.name} all along`;
    this.milestone(`pet_fairy${p.since}`, line);
    this.say(line);
  }

  /** What moves his mood an hour now, by cause: the usual drift, dirt, the weather and each moodlet (with its minutes left). */
  moodPieces(): { name: string; icon: string; per_h: number; left?: number }[] {
    const out: { name: string; icon: string; per_h: number; left?: number }[] = [{ name: "Day to day", icon: "📉", per_h: -MOOD_PER_H }];
    if (this.meters.hygiene < DIRTY_AT) out.push({ name: "Feeling grubby", icon: "🧼", per_h: -DIRTY_MOOD_PER_H });
    const sky = weatherPerH(this.sky).mood;
    if (sky) out.push({ name: sky > 0 ? "Sunshine" : "Wet weather", icon: sky > 0 ? "☀" : "🌧", per_h: sky });
    for (const m of this.mind.moodlets) out.push({ name: m.name, icon: m.icon, per_h: m.per_h, left: m.left });
    return out;
  }

  /** Counts `minutes` of walking; each full minute Luck may find him money. Returns the feed line, or "". */
  walkFor(minutes: number, rng: Rng): string {
    this.walkMin += minutes;
    let line = "";
    while (this.walkMin >= 1) {
      this.walkMin -= 1;
      if (rng.randf() >= findChance(this.attr("luck")) * F.mult(this.forecast(), "find") * this.pets.findMult()) continue;
      const n = rng.randiRange(FIND_MIN, FIND_MAX);
      this.cents += n;
      line = this.say(`Found ${euro(n)} on the street (${signed(n)})`);
    }
    return line;
  }

  /** Adds meter, attribute, XP and Magic changes; meters stay within 0-100. */
  applyFx(fx: Fx): void {
    for (const [k, v] of Object.entries(fx) as [keyof Fx, number][]) {
      if (k === "xp") this.addXp(Math.trunc(v));
      else if (k === "magic") this.magic = Math.min(Math.max(this.magic + v, 0), Mg.MAGIC_MAX);
      else if (k === "karma") this.karma(v);
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
      if (LEVEL_MARKS.includes(this.level)) this.milestone(`level${this.level}`, `Reached level ${this.level}`);
      this.keepsakes.freePacks++;
    }
  }

  xpMult(): number {
    return this.buffs.reduce((m, b) => m * b.xp_mult, 1) * this.life.perkXp() * this.life.info().xp;
  }

  /** Sets the city card pool (none when it is empty) and works out his finished sets from it again, as the city list can change between versions. */
  setCityPool(pool: CC.Pool): void {
    this.cityPool = pool.cards.length ? pool : null;
    const k = this.keepsakes;
    k.sets = [...pool.byCountry.keys()].filter((code) => CC.hasSet(pool, k.cityCards, code));
  }

  /** True when he has the coins, attributes, skills, language, level, timing, season and weather for `action`, and the ingredients to cook or room to buy them. */
  canDo(action: Action, hour: number, kind = ""): boolean {
    if (action.pack && !this.cityPool) return false;
    if (action.steal && this.bond.leaning() !== "rascal") return false;
    if (action.bounty && !this.canPayOff()) return false;
    if (action.cook && !this.pantry.best(this.skills.level("cooking"))) return false;
    if (action.lottery && this.lottery.ticket) return false;
    if (action.groceries && !this.pantry.pick(action.groceries, this.skills.level("cooking"))) return false;
    if (!this.nightAtHome(action, kind) && this.priced(toCents(action.cost ?? 0)) > this.cents) return false;
    if (action.item && !action.steal && this.cents <= KEEP_CENTS) return false;
    if (action.sell && !this.bag.length) return false;
    for (const [k, need] of Object.entries(action.needs ?? {})) {
      if (k === "level") {
        if (this.level < (need as number)) return false;
      } else if (k === "rank") {
        if (this.careers.rank(action.career ?? "") !== need) return false;
      } else if (k === "time") {
        if (!inTime(need as TimeOfDay, hour)) return false;
      } else if (k === "season") {
        if (this.sky?.season !== need) return false;
      } else if (k === "weather") {
        if (!meets(need as WeatherNeed, this.sky)) return false;
      } else if (k === "below") {
        for (const [m, v] of Object.entries(need as object)) if (this.meters[m as Meter] >= v) return false;
      } else if (k === "lang") {
        // A language learned abroad: his own and English, which he had from the start, don't count.
        const lang = this.lang();
        if (!this.languages.learned(lang) || this.languages.level(lang) < (need as number)) return false;
      } else if (isSkill(k)) {
        if (this.skills.level(k) < (need as number)) return false;
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
      if (this.cents - this.priced(item.price) >= KEEP_CENTS && (!best || Items.power(item) > Items.power(best))) best = item;
    }
    return best ?? first;
  }

  /** Does `action` at `where`, a place of class `kind`, and returns the feed line it adds. Then wants of that kind may come true, and a mishap rattles him (see mind.ts). */
  do(action: Action, where: string, rng: Rng, kind = ""): string {
    this.mishap = false;
    const line = this.act(action, where, rng, kind);
    // A nap or a night's sleep may bring a dream, on its own dice.
    if (action.sleep) {
      const dream = this.diary.dream(this.diaryData, new Rng(seedOf(`dream${this.now()}${where}`)));
      if (dream) this.say(`💤 ${dream}`);
    }
    if (!kind) return line;
    // Its own dice, so the walk's stay the same.
    const { met, lines, feared } = this.mind.did(kind, this.mishap, this.now(), new Rng(seedOf(`mind${this.now()}${where}`)));
    for (const w of met) {
      this.addXp(WANT_XP[w.kind]);
      this.diary.note(w.kind === "face" ? "brave" : "wish", where || noun(kind));
    }
    for (const l of lines) this.say(l);
    if (feared) this.diary.note("fear", where || noun(kind));
    else if (this.mishap && where) this.diary.note("mishap", where);
    this.habit(kind);
    return line;
  }

  /** One more time at a place of map class `kind`: his quirks there cheer him, and he may gain a quirk (and lose the oldest). */
  private habit(kind: string): void {
    const { here, gained, lost } = this.quirks.count(kind);
    for (const q of here) this.mind.feel(q.treat, q.icon, ...Qk.QUIRK_MOOD);
    if (gained) {
      this.say(`${gained.icon} He has become a ${gained.name}`);
      this.diary.note("quirk", gained.name);
    }
    if (lost) this.say(`${lost.icon} He is no longer a ${lost.name}`);
  }

  /** Set by stop(): he is at his spot in this city (the same name and spot on the map). */
  private atSpot = false;

  /** Set by act() when the action's risk went wrong. */
  private mishap = false;

  private act(action: Action, where: string, rng: Rng, kind: string): string {
    if (action.steal) return this.shoplift(action, where, rng);
    if (action.item) {
      this.applyFx(action.fx ?? {});
      if (Items.RARE_STOCK.has(action.item) && rng.randf() >= Items.MOUNT_STOCK) {
        const base = Items.KINDS[action.item][0]!.base;
        return this.say(`Asked after a ${base}${where ? ` at ${where}` : ""}, but there were none in today`);
      }
      return this.buy(this.offer(action.item, rng), where);
    }
    if (action.midnight) {
      this.applyFx(action.fx ?? {});
      return this.midnightShop(where, rng);
    }
    if (action.sell) {
      this.applyFx(action.fx ?? {});
      return action.resale && this.bagFull() ? this.sellRun(where) : this.sellLoot(where);
    }
    if (action.bounty) {
      this.applyFx(action.fx ?? {});
      const n = this.law.payOff();
      this.cents -= n;
      return this.say(`🚓 Paid off what the police want him for${where ? ` at ${where}` : ""} (${signed(-n)})`);
    }
    if (action.pack) {
      const price = this.priced(toCents(action.cost ?? 0));
      this.cents -= price;
      this.applyFx(action.fx ?? {});
      return this.openPack(rng, `Bought a card pack${where ? ` at ${where}` : ""} (${signed(-price)})`);
    }
    if (action.groceries) return this.buyGroceries(action, where);
    if (action.cook) return this.cook(action, where);
    if (action.lottery) return this.buyTicket(action, where);
    // A regular's discount at his spot.
    const regular = !!where && this.atSpot;
    const home = this.nightAtHome(action, kind);
    let spent = home ? 0 : this.priced(Math.round(toCents(action.cost ?? 0) * (regular ? 1 - SPOT_DISCOUNT : 1)));
    const fx: Fx = { ...action.fx };
    if (home) fx.mood = (fx.mood ?? 0) + this.home.mood();
    if (action.skill) skilled(fx, this.skills.mult(action.skill));
    if (fx.mood !== undefined && fx.mood > 0) fx.mood *= F.mult(this.forecast(), "mood", kind);
    let text = home ? "🏡 Slept at home in his own bed" : action.name;
    const risk = action.risk;
    // At home the risk's roll still happens, so the walk's dice stay the same, but nothing goes wrong in his own bed.
    if (risk && rng.randf() < risk.p * riskMult(this.attr("luck")) * this.pets.riskMult() && !home) {
      spent += toCents(risk.cost ?? 0);
      for (const [k, v] of Object.entries(risk.fx ?? {}) as [keyof Fx, number][]) fx[k] = (fx[k] ?? 0) + v;
      text += `, ${risk.text ?? "it went wrong"}`;
      this.records.mishap();
      this.mishap = true;
    }
    const earn = action.earn ?? 0;
    const listed = Array.isArray(earn) ? rng.randiRange(toCents(earn[0]), toCents(earn[1])) : toCents(earn);
    const earned = listed ? Math.round(listed * this.wageMult(action)) : 0;
    this.cents = Math.max(this.cents - spent + earned, 0);
    if (fx.xp !== undefined) fx.xp = Math.round(fx.xp * this.xpMult() * moodXpMult(this.meters.mood));
    this.applyFx(fx);
    if (action.buff) this.addBuff(action.buff);
    if (action.deed) this.deed(action.deed);
    if (earned) this.milestone("job", `First wage: ${action.name}${where ? ` at ${where}` : ""}`);
    const learned = [action.skill ? this.skills.train(action.skill, action.min) : "", action.lang ? this.languages.add(this.lang(), Lang.CHAT_H) : ""];
    if (earned && where) this.diary.note("work", where);
    const net = earned - spent;
    const money = net ? ` (${signed(net)})` : "";
    const jokes = jokesFor(this.jokes, kind);
    // No jokes loaded, no roll, so the dice stay the same as without them.
    const joke = jokes.length && rng.randf() < JOKE_CHANCE ? ` ${rng.pick(jokes)}` : "";
    const line = this.say(text + (where && !home ? ` at ${where}` : "") + money + joke);
    for (const l of learned) this.sayIf(l);
    // Maybe a chance card at work; its own dice, so the walk's stay the same.
    if (earned && Ca.isShift(action)) this.sayIf(Work.draw(this, earned, new Rng(seedOf(`work${this.now()}${where}`))));
    if (action.career && Ca.isShift(action)) this.promote(action.career, where);
    return line;
  }

  /** The fame key of the city he is in, or "" before he is anywhere. */
  here(): string {
    return this.where.city ? cityKey(this.where.city, this.where.code) : "";
  }

  /** Adds fame where he is; a new tier is said in the feed. */
  addFame(n: number): void {
    const tier = this.fame.add(this.here(), n);
    if (tier === null) return;
    this.say(`⭐ ${this.where.city} knows his face now: ${FAME_NAMES[tier]}`);
    if (tier < FAME_NAMES.length - 1) return;
    // A Local hero makes the local paper; its own dice.
    const town = this.where.city.split(",")[0]!;
    const head = new Rng(seedOf(`paper${this.here()}`)).pick(PAPER).replace("{CITY}", town);
    this.milestone(`paper${this.here()}`, `In the ${town} paper: "${head}"`);
    this.say(`📰 The ${town} paper runs a story on him: "${head}"`);
  }

  /**
   * Moves his karma (his lean, bond.ts) by `n`; people notice either way, so
   * it adds that much fame where he is. A bad deed is a crime (unless
   * `crime` is false) and raises the police heat, the more so the better the
   * city knows him.
   */
  karma(n: number, crime = true): void {
    if (!n) return;
    const b = this.bond;
    b.lean = Math.min(Math.max(b.lean + n, -B.LEAN_MAX), B.LEAN_MAX);
    this.law.karma(b.lean);
    const tier = this.fame.tier(this.here());
    this.addFame(Math.abs(n));
    if (n < 0 && crime) this.law.addHeat(R.crimeHeat(n, tier));
  }

  /** One of his own deeds: +1 kind, -1 rascal (bond.ts DEED_STEP of karma). */
  deed(sign: number): void {
    this.karma(Math.sign(sign) * B.DEED_STEP);
  }

  /** The share off what he pays: his fame's discount (bigger when kind), or for a rascal a markup (negative). */
  shopDiscount(): number {
    const lean = this.bond.leaning();
    if (lean === "rascal") return -R.RASCAL_MARKUP;
    return this.fame.discount(this.here()) + (lean === "kind" ? R.KIND_DISCOUNT : 0);
  }

  /** What `cents` costs him, after shopDiscount. */
  priced(cents: number): number {
    return Math.round(cents * (1 - this.shopDiscount()));
  }

  /** True when he is wanted enough to pay off the police and can spare it. */
  canPayOff(): boolean {
    return this.law.stars() >= R.PAYOFF_STARS && this.cents - R.payoffOf(this.law.heat) >= KEEP_CENTS;
  }

  /** What a chase needs to know about him. */
  him(): R.Him {
    return { heat: this.law.heat, cents: this.cents, str: this.attr("str"), wit: this.attr("wit"), luck: this.attr("luck"), cha: this.attr("cha"), energy: this.meters.energy };
  }

  /** A rascal pockets the shop's `action.item` at `where`, worn if an upgrade, else bagged; it is marked stolen. */
  private shoplift(action: Action, where: string, rng: Rng): string {
    const item = this.offer(action.item!, rng);
    item.stolen = true;
    item.story = { from: this.where.city, t: this.now(), countries: this.where.code ? [this.where.code] : [], km: 0 };
    if (this.isUpgrade(item)) this.equip(item);
    else this.bagAdd(item);
    this.applyFx(action.fx ?? {});
    this.karma(-R.STEAL_KARMA);
    return this.say(`🫳 Pocketed a ${item.rarity} ${item.name}${where ? ` at ${where}` : ""} while nobody looked (karma −${R.STEAL_KARMA})`);
  }

  /**
   * Right after reaching `place`: the police may spot him while he is wanted
   * (returns true: a chase begins), or else a kind walker may get a
   * small gift from a local. Its own dice, so his walk stays the same.
   */
  reputeAt(place: Pick<Place, "name">): boolean {
    const rng = new Rng(seedOf(`law${this.now()}${place.name}`));
    if (this.law.stars() > 0 && rng.randf() < R.spotChance(this.law.heat, tierOf(this.fame.total()))) {
      this.say(`🚨 The police spotted him at ${place.name}!`);
      return true;
    }
    if (this.bond.leaning() !== "kind" || rng.randf() >= R.GIFT_CHANCE * (1 + this.fame.tier(this.here()))) return false;
    const g = rng.pick(R.GIFTS);
    this.cents += g.cents ?? 0;
    if (g.fx) this.applyFx(g.fx);
    this.say(`🎁 ${g.say.replace("{PLACE}", place.name)}${g.cents ? ` (${signed(g.cents)})` : ""}`);
    return false;
  }

  /** Ends the chase begun at the place named `place` with his own pick by his karma (moments.ts defaultPick), from his money and energy as they are now, not when it began; see chased. Its own dice. */
  runChase(place: string): number {
    const rng = new Rng(seedOf(`chase${this.now()}${place}`));
    return this.chased(M.defaultPick(R.chaseMoment(this.him()), this, rng) as R.Pick, rng.randf());
  }

  /** The chase ends with `pick` and dice `r`: away, or caught and fined, or jailed when he can't pay, and what he stole is taken back. Returns jail minutes, or 0. */
  chased(pick: R.Pick, r: number): number {
    const h = this.him();
    const c = this.law.chase(pick, h, r);
    if (c.away) {
      if (pick === "bribe") {
        const n = R.bribeOf(h.heat);
        this.cents -= n;
        this.karma(-R.BRIBE_KARMA, false);
        this.say(`🚓 Slipped the officer ${euro(n)}, and the police forgot all about him (${signed(-n)}, karma −${R.BRIBE_KARMA})`);
      } else this.say(pick === "run" ? "🚓 Ran for it down the side streets and lost the police" : "🚓 Hid until the police car drove past, and got away");
      if (this.law.escapes === 1 && pick !== "bribe") this.milestone("escape", "Got away from the police for the first time");
      return 0;
    }
    const how = pick === "surrender" ? "Gave himself up to the police" : pick === "bribe" ? "Tried to bribe the officer, who arrested him" : `Tried to ${pick}, but the police caught him`;
    if (pick === "surrender") this.karma(R.SURRENDER_KARMA);
    const hours = `${c.jailMin / 60} hour${c.jailMin === 60 ? "" : "s"}`;
    if (c.jailMin) this.say(`🚓 ${how}, and couldn't pay the ${euro(R.fineOf(h.heat))} fine: ${hours} in jail`);
    else {
      this.cents -= c.fine;
      this.say(`🚓 ${how} and paid a ${euro(c.fine)} fine (${signed(-c.fine)})`);
    }
    const stolen = this.bag.filter((i) => i.stolen).length + Object.values(this.gear).filter((i) => i?.stolen).length;
    if (stolen) {
      this.bag = this.bag.filter((i) => !i.stolen);
      for (const [slot, item] of Object.entries(this.gear) as [Slot, Item][]) if (item.stolen) delete this.gear[slot];
      this.say(`🚓 They took back the ${stolen === 1 ? "thing" : `${stolen} things`} he had stolen`);
    }
    if (c.jailMin) this.milestone("jail", `Spent ${hours} in jail${this.where.city ? ` in ${this.where.city}` : ""}`);
    return c.jailMin;
  }

  /** Counts a shift in career `id`, and says so when it promotes him. */
  private promote(id: string, where: string): void {
    const rank = this.careers.shift(id);
    const c = Ca.careerOf(id);
    if (!rank || !c) return;
    const title = c.ranks[rank - 1]!;
    this.say(`Promoted to ${title} in his ${c.name} career!`);
    this.milestone("promoted", `First promotion: ${title}${where ? ` at ${where}` : ""}`);
    if (rank === Ca.TOP_RANK) this.milestone(`career_${id}`, `Became ${title}, the top of his ${c.name} career`);
  }

  /** Buys the ingredient his pantry needs most of those `action` sells (see Pantry.pick); returns the feed line. */
  private buyGroceries(action: Action, where: string): string {
    const i = this.pantry.pick(action.groceries!, this.skills.level("cooking"))!;
    const cost = this.priced(toCents(action.cost ?? 0));
    this.cents = Math.max(this.cents - cost, 0);
    this.pantry.items.push(i);
    this.applyFx(action.fx ?? {});
    return this.say(`${Cook.INGREDIENT[i][0]} Bought ${Cook.INGREDIENT[i][1]} for cooking${where ? ` at ${where}` : ""}${cost ? ` (${signed(-cost)})` : ""}`);
  }

  /** Cooks the best meal his pantry and cooking level allow: its gains, bigger with his cooking, and `action`'s XP. Returns the feed line. */
  private cook(action: Action, where: string): string {
    const r = this.pantry.best(this.skills.level("cooking"))!;
    this.pantry.use(r);
    const fx: Fx = { ...r.fx, xp: action.fx?.xp ?? 0 };
    skilled(fx, this.skills.mult("cooking"));
    if (fx.xp) fx.xp = Math.round(fx.xp * this.xpMult() * moodXpMult(this.meters.mood));
    this.applyFx(fx);
    const line = this.say(`${r.icon} Cooked ${/^[aeiou]/.test(r.name) ? "an" : "a"} ${r.name} with ${Cook.listOf(r.uses)}${where ? ` at ${where}` : ""}`);
    this.sayIf(this.skills.train("cooking", action.min));
    return line;
  }

  /** First visit to a named place gives bonus XP; returns the XP given. */
  visit(place: Pick<Place, "name" | "lat" | "lon"> & { class?: string; made?: unknown }): number {
    // Only a real place can be his spot.
    const home = place.made ? "" : this.spots.visit(this.where.city, place);
    if (home) {
      this.say(home);
      this.diary.note("spot", place.name);
    }
    const gift = !place.made && this.spots.isSpot(this.where.city, place) ? this.mail.pickUp(this.where.city) : null;
    if (gift) {
      this.applyFx(gift.gift.fx);
      this.say(`${gift.gift.icon} Found a gift at ${place.name} from ${gift.from}: ${gift.gift.line.toLowerCase()}`);
    }
    if (!place.made) this.business.visited(this.where.city, place);
    const key = visitKey(place);
    if (this.visited.has(key)) return 0;
    this.visited.add(key);
    this.diary.note("first", place.name);
    this.week.newPlace();
    const xp = Math.round(FIRST_VISIT_XP * F.mult(this.forecast(), "visit"));
    this.addXp(xp);
    return xp;
  }

  /** He is now in `city` (`code`, `country`): worn items count the country in their story, and a new country gets the border lines. */
  arrive(city: string, code: string, country: string): void {
    const was = this.where;
    this.where = { city, code, country };
    this.records.arrived(city, code);
    this.visas.enter(code);
    if (city) this.milestone("start", `Set out from ${city}`);
    if (was.city && was.city !== city) this.milestone("trip", `First trip away: to ${city}`);
    if (was.city !== city && city) this.diary.note("arrive", city.split(",")[0]!);
    if (was.code && code && was.code !== code) this.milestone("abroad", `First time abroad: ${country}`);
    if (!code) return;
    const seen = this.keepsakes.seen;
    if (was.code && was.code !== code) {
      const first = !seen.includes(code);
      const stamps = seen.filter((c) => !c.includes(":")).length + (first ? 1 : 0);
      for (const line of crossing(this.borders, code, country, stamps, first)) this.say(line);
    }
    for (const s of [code, `${code}:${city}`]) {
      if (seen.includes(s)) continue;
      seen.push(s);
      this.keepsakes.freePacks++;
      const n = seen.filter((c) => !c.includes(":")).length;
      if (s === code && COUNTRY_MARKS.includes(n)) this.milestone(`countries${n}`, `Had walked in ${n} countries`);
    }
    for (const item of Object.values(this.gear)) if (item?.story && !item.story.countries.includes(code)) item.story.countries.push(code);
    if (was.city !== city) this.dreams(this.now());
  }

  /** What his bucket list's game dreams count (see bucket.ts). */
  facts(): Bk.Facts {
    return {
      city: this.where.city,
      level: this.level,
      countries: this.keepsakes.seen.filter((c) => !c.includes(":")).length,
      car: Bk.CAR_OR_BETTER.includes(this.vehicle()) ? 1 : 0,
      dragon: this.vehicle() === "dragon" ? 1 : 0,
      dishes: this.pantry.dishes.length,
      fluent: this.languages.list().filter((l) => this.languages.learned(l.lang) && l.level >= Lang.FLUENT).length,
      prize: this.lottery.prizes,
      business: this.business.owned.length,
      monument: this.bricks.built.length,
      skill: Math.max(...SKILLS.map((k) => this.skills.level(k))),
    };
  }

  /**
   * Ticks off what he has done on his bucket list (XP, mood, a line in his life
   * story). Only each morning (`fill`) does it fill up again, on its own dice:
   * his first dreams go on quietly (the Stats sheet shows them), later ones
   * with a feed line.
   */
  dreams(t: number, fill = false): void {
    const f = this.facts();
    for (const d of this.bucket.tick(f, t)) {
      this.applyFx({ mood: Bk.DREAM_MOOD });
      this.addXp(Bk.DREAM_XP);
      this.milestone(`dream_${d.id}`, `Ticked off his bucket list: ${d.text}`);
      this.say(`📝 ${d.icon} Ticked off his bucket list: ${d.text}! (+${Bk.DREAM_XP} XP)`);
    }
    if (!fill) return;
    const added = this.bucket.fill(f, new Rng(seedOf(`bucket${t}:${this.bucket.done.length}`)));
    if (this.bucket.done.length && added.length) this.say(`📝 New on his bucket list: ${Kit.list(added.map(Bk.lower))}`);
  }

  /** Cents off a fare for his souvenirs: FARE_CUT for every SOUVENIRS_PER_CUT, up to FARE_CUT_MAX. */
  fareMult(): number {
    return (1 - K.fareCut(this.keepsakes.souvenirs.size)) * F.mult(this.forecast(), "fare");
  }

  /**
   * Right after reaching a real place (after visit()): a landmark card the
   * first time (a revisit gives nothing) and maybe the country's souvenir,
   * a new Placedex kind, the perks of crawls he finished, and progress on the rest.
   * Made-up places (core/poiGen.ts) give none of these; only the first
   * of each odd kind (a well, a wizard's tower) is noted for the Collection.
   */
  collect(place: Place, rng: Rng): void {
    const k = this.keepsakes;
    if (place.made) {
      // Extras carry `extra`; a wizard's tower is known by its kind (poiGen.TOWER_KIND, which a test checks).
      if ((place.extra || place.class === "wizard_tower") && !k.odd.includes(place.class)) k.odd.push(place.class);
      return;
    }
    const key = visitKey(place);
    const kind = K.kindOf(place);
    if (K.isLandmark(place) && !k.cards.has(key)) {
      // Photography makes a shiny finish likelier.
      const finish = K.rollFinish(rng.randf() / (1 + PHOTO_SHINE * this.skills.level("photo")));
      const card: K.Card = { name: place.name, kind, city: this.where.city, rarity: K.cardRarity(place.rank), finish, t: this.now(), ...this.finder() };
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
        k.cityCards.set(card.key, { finish, t: this.now(), ...this.finder() });
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

  /** Trust rose to cross letter step `step` (see bond.ts): he writes to you. */
  wrote(step: number): void {
    if (step < 0) return;
    const line = B.letter(this.letters, step, new Rng(seedOf(`letter${this.now()}`)).randf());
    if (!line) return;
    this.say(line);
    this.milestone("letter", "Wrote his first letter to you");
  }

  /** He opened your care package `id`: more trust, and maybe a thank-you letter. */
  gifted(id: string): void {
    const step = this.bond.addTrust(B.TRUST_PER_GIFT);
    if (step >= 0) return this.wrote(step);
    const thanks = this.letters?.thanks[id];
    if (thanks && new Rng(seedOf(`thanks${this.now()}`)).randf() < B.THANKS_CHANCE) this.say(`${B.LETTER_MARK} ${thanks}`);
  }

  /** Right after reaching `place`: maybe a golden brick, and the next monument if he has the bricks and it is a real park (see bricks.ts). Its own dice, from the time and place. */
  bricksAt(place: Place): void {
    const b = this.bricks;
    const t = this.now();
    if (b.find(dayOf(t * 1000), new Rng(seedOf(`brick${t}${place.name}`)).randf())) this.say(`Found a golden brick (${b.count} / ${b.next().bricks})`);
    const m = b.build(place, this.where.city, t);
    if (!m) return;
    const k = Br.MONUMENTS[m.kind]!;
    this.say(`Paid ${k.bricks} golden bricks for a ${k.name} with his name in ${place.name} ${k.icon}`);
    this.milestone(`built${b.built.length}`, `Built a ${k.name} with his name in ${place.name}, ${m.city}`);
  }

  /** Right after reaching `place`: now and then, at most once a day, the creature that lives at such places shows up (creatures.ts), or null. Its own dice, so his walk stays the same. */
  creatureAt(place: Pick<Place, "class" | "name">): Cr.Creature | null {
    const t = this.now();
    return this.creatures.roll(this.creatureKinds, place.class, dayOf(t * 1000), Cr.meetingDice(t, place.name).randf());
  }

  /** The meeting with `c` at the place named `where`, with option `pick` chosen. Returns the feed line. */
  meet(c: Cr.Creature, where: string, pick: string): string {
    const o = this.creatures.outcome(c, pick, (a) => this.attr(a), Cr.meetingDice(this.now(), `${where}${pick}`).randf());
    const paid = Math.min(o.pay ?? 0, Math.max(this.cents, 0));
    this.cents -= paid;
    if (o.fx) this.applyFx(o.fx);
    if (o.buff) this.addBuff(o.buff);
    return this.say(`${c.icon} ${o.say.replace("{PLACE}", where)}${paid ? ` (${signed(-paid)})` : ""}`);
  }

  /** Right after reaching `place`: meets its creature if one shows up, taking his own pick (moments.ts defaultPick). */
  meetAt(place: Pick<Place, "class" | "name">): void {
    const c = this.creatureAt(place);
    if (c) this.meet(c, place.name, M.defaultPick(c.moment, this, Cr.meetingDice(this.now(), `${place.name}pick`)));
  }

  /** The moment at `place` when he starts an activity there, or null with none loaded. */
  momentAt(place: Pick<Place, "class" | "subclass">): PM.PlaceMoment | null {
    return PM.momentFor(this.placeMoments, place);
  }

  /**
   * Applies pick `pick` of moment `m` at the place named `where`, chosen by
   * you or (`you` false) by himself, on the moment's own `dice` (a risky
   * option's roll, then a free item). Returns the feed line.
   */
  settleMoment(m: PM.PlaceMoment, where: string, pick: string, you: boolean, dice: Rng): string {
    const o = PM.outcomeOf(m, pick, (a) => this.attr(a), dice.randf());
    const paid = Math.min(o.pay ?? 0, Math.max(this.cents, 0));
    const net = (o.gain ?? 0) - paid;
    this.cents += net;
    if (o.fx) this.applyFx(o.fx);
    if (o.buff) this.addBuff(o.buff);
    let got = "";
    if (o.item) {
      const item = Items.make(o.item, this.level, dice, this.attr("luck"));
      item.story = { from: this.where.city, t: this.now(), countries: this.where.code ? [this.where.code] : [], km: 0 };
      if (this.isUpgrade(item)) this.equip(item);
      else this.bagAdd(item);
      got = ` and got a free ${item.rarity} ${item.name}`;
    }
    return this.say(`${m.icon} ${you ? "" : "Decided by himself: "}${o.say.replaceAll("{PLACE}", where)}${got}${net ? ` (${signed(net)})` : ""}`);
  }

  /** Moment `m` at `where` with nobody to ask (the catch-up): he takes his own pick, on `dice` (placeMoments.ts momentDice). */
  byHimself(m: PM.PlaceMoment | null, where: string, dice: Rng): void {
    if (m) this.settleMoment(m, where, M.defaultPick(m, this, dice), false, dice);
  }

  /** Walked `m` meters along a ley line: a little Magic, and his luck charmed a while. */
  leyWalk(m: number): void {
    this.magic = Math.min(this.magic + (Mg.LEY_PER_KM * m) / 1000, Mg.MAGIC_MAX);
    this.addBuff(Mg.LEY_CHARM);
  }

  /** Right after reaching `place`: now and then a local word that fits it (words.ts). Its own dice, so his walk stays the same. */
  wordAt(place: Pick<Place, "class" | "name">): void {
    if (!this.wordBook) return;
    const w = this.words.learn(this.wordBook, this.where.code, place.class, new Rng(seedOf(`word${this.now()}${place.name}`)).randf());
    if (!w) return;
    this.applyFx({ wit: WORD_WIT, xp: WORD_XP });
    this.say(`🗣 Learned a ${w.language} word at ${place.name}: "${w.word}" means ${w.meaning}`);
  }

  /** Right after reaching `place`: a burst of Magic at a place on a ley line (once a day each), and maybe a spell from an old book. Its own dice, so his walk stays the same. */
  magicAt(place: Pick<Place, "class" | "name" | "lat" | "lon">): void {
    const t = this.now();
    if (Mg.isLeyPlace(place) && this.lore.tap(visitKey(place), dayOf(t * 1000))) {
      const got = Math.min(Mg.LEY_BURST, Mg.MAGIC_MAX - this.magic);
      this.magic += got;
      this.say(`✨ Felt the ley lines meet at ${place.name}${got ? ` (Magic +${Math.round(got)})` : ""}`);
    }
    if (!Mg.BOOK_CLASSES.includes(place.class)) return;
    const s = this.lore.learn(this.spellKinds, new Rng(seedOf(`spell${t}${place.name}`)).randf());
    if (!s) return;
    this.say(`📖 Learned a spell from an old book at ${place.name}: ${s.icon} ${s.name}`);
    if (this.lore.known.length === 1) this.milestone("spell", `Learned his first spell, ${s.name}, at ${place.name}`);
  }

  /** Right after reaching `place`: now and then (once a day at most) a giant shows far off and he stops to watch (see giants.ts). Its own dice, so his walk stays the same. */
  giantAt(place: Place): void {
    const t = this.now();
    const g = this.giants.roll(place, dayOf(t * 1000), new Rng(seedOf(`giant${t}${place.name}`)).randf());
    if (!g) return;
    this.applyFx(Gi.GIANT_FX);
    this.say(`${g.icon} ${g.say.replace("{PLACE}", place.name)}. He stopped to watch and took a photo`);
    if (this.giants.note(g, place.name, this.where.city, t)) this.milestone(`giant_${g.id}`, `Saw a ${g.name.toLowerCase()} from ${place.name}${this.where.city ? `, ${this.where.city}` : ""}`);
  }

  /** Right after reaching `place` at local `hour`: at dawn a fairy ring in a real park or garden may take him for a nap (see fairy.ts). Returns the nap's minutes, or 0. He wakes rested with a fairy gift (worn if an upgrade, else bagged) or Magic and a strange story. Its own dice, so his walk stays the same. */
  fairyAt(place: Place, hour: number): number {
    const t = this.now();
    if (!Fa.isRingPlace(place) || !Fa.isDawn(hour)) return 0;
    const rng = new Rng(seedOf(`fairy${t}${place.name}`));
    if (!this.rings.takes(t, rng.randf())) return 0;
    const min = rng.randiRange(Fa.NAP_MIN_MIN, Fa.NAP_MAX_MIN);
    const h = Math.round(min / 60);
    this.applyFx(Fa.NAP_FX);
    this.say(`🍄 Lay down in a ring of mushrooms in ${place.name} at dawn, and woke ${h} hours later, rested`);
    if (rng.randf() < Fa.GIFT_CHANCE) {
      const { item: gift, base } = Fa.fairyGift(this.level, rng);
      gift.story = { from: this.where.city, t, countries: this.where.code ? [this.where.code] : [], km: 0 };
      this.rings.note(t, { gift: base });
      if (this.isUpgrade(gift)) this.equip(gift);
      else this.bagAdd(gift);
      this.say(`🎁 In his hand: a ${gift.rarity} ${gift.name}, a fairy gift`);
    } else {
      const story = rng.pick(Fa.STORIES);
      this.rings.note(t, { story: story.id });
      this.applyFx({ magic: Fa.STORY_MAGIC });
      this.say(`✨ ${story.say} (Magic +${Fa.STORY_MAGIC})`);
    }
    this.milestone("fairy", `Napped in a fairy ring in ${place.name} and woke ${h} hours later`);
    return min;
  }

  /** Right after reaching `place`: a portal place may open (see portals.ts) unless he is on a quest. Returns the city it takes him to, never one he has been to, or null. Its own dice, so his walk stays the same. */
  portalAt(place: Place, trips: T.Trips): T.City | null {
    const t = this.now();
    if (!Po.isPortalPlace(place) || this.quests.active) return null;
    const rng = new Rng(seedOf(`portal${t}${place.name}`));
    if (!this.portals.opens(t, rng.randf())) return null;
    const seen = this.keepsakes.seen;
    const city = trips.pickNew(place.lat, place.lon, (c) => seen.includes(`${c.code}:${c.name}, ${c.country}`), rng);
    if (!city) return null;
    const to = `${city.name}, ${city.country}`;
    this.portals.note(t, to);
    this.say(`🌀 The old stones of ${place.name} shimmered like a door, and he stepped through`);
    this.milestone("portal", `Stepped through a portal at ${place.name} and came out in ${to}`);
    return { ...city, bounds: T.cityBounds(city) };
  }

  /** Magic his enchanted gear gathers for each km he walks. */
  gearMagic(): number {
    let v = 0;
    for (const item of Object.values(this.gear)) v += item?.stats.magic ?? 0;
    return v;
  }

  /** At the shop after midnight at `where`: an enchanted item (bought like any gear, if it is an upgrade) or a trinket used at once, for euros plus Magic. Returns the feed line. */
  private midnightShop(where: string, rng: Rng): string {
    const at = `${where ? ` at ${where}` : ""} after midnight`;
    if (rng.randf() < Mn.ENCHANTED_CHANCE) {
      const item = Items.makeEnchanted(rng.pick(Mn.ENCHANTED_KINDS), this.level, rng, this.attr("luck"));
      item.price = Math.round(item.price * Mn.ENCHANTED_PRICE);
      // What he pays; the item keeps its own price, so his karma doesn't follow it to resale.
      const cost = this.priced(item.price);
      if (this.magic < Mn.ENCHANTED_MAGIC) return this.say(`🌙 Saw a ${item.rarity} ${item.name}${at}, but hadn't the Magic for it (${euro(cost)} and ${Mn.ENCHANTED_MAGIC} Magic)`);
      if (!this.isUpgrade(item) || this.cents - cost < KEEP_CENTS) return this.say(`🌙 Looked at a ${item.rarity} ${item.name}${at} but didn't buy it (${euro(cost)} and ${Mn.ENCHANTED_MAGIC} Magic)`);
      this.cents -= cost;
      this.magic -= Mn.ENCHANTED_MAGIC;
      item.story = { from: this.where.city, t: this.now(), countries: this.where.code ? [this.where.code] : [], km: 0 };
      this.equip(item);
      for (const e of Items.ENCHANTMENTS) if (item.name.includes(e.name)) this.finds.note(e.name);
      return this.say(`🌙 Bought a ${item.rarity} ${item.name}${at} (${signed(-cost)}, Magic −${Mn.ENCHANTED_MAGIC})`);
    }
    const t = rng.pick(Mn.TRINKETS);
    const cost = this.priced(t.cents);
    if (this.magic < t.magic || this.cents - cost < KEEP_CENTS) return this.say(`🌙 Saw a ${t.name}${at}, but couldn't pay for it (${euro(cost)}${t.magic ? ` and ${t.magic} Magic` : ""})`);
    this.cents -= cost;
    this.magic -= t.magic;
    if (t.fx) this.applyFx(t.fx);
    if (t.buff) this.addBuff(t.buff);
    this.finds.note(t.id);
    return this.say(`${t.icon} Bought a ${t.name}${at} and ${t.say} (${signed(-cost)}${t.magic ? `, Magic −${t.magic}` : ""})`);
  }

  /** Casts the spell that helps now, if he has the Magic (magic.ts toCast). */
  private castIfNeeded(): void {
    const s = Mg.toCast(this.spellKinds, this.lore.known, this.magic, this.meters, this.buffNames());
    if (!s) return;
    this.magic -= s.cost;
    this.lore.casts[s.id] = (this.lore.casts[s.id] ?? 0) + 1;
    if (s.fx) this.applyFx(s.fx);
    if (s.buff) this.addBuff(s.buff);
    this.say(`${s.icon} ${s.say} (Magic −${s.cost})`);
  }

  /** Who of the family found a card, for its entry: nothing for the first walker. */
  private finder(): { gen?: number } {
    return this.life.gen > 1 ? { gen: this.life.gen } : {};
  }

  /** Writes milestone `key` in his chronicle, once. */
  milestone(key: string, text: string): void {
    this.chronicle.note(key, text, this.now());
  }

  /**
   * Maybe an incident at a stop at `place` at `hour`, when the storyteller
   * says so (Luck makes bad ones rarer), or else his club night if one is on
   * (or an invitation to one), or else a meeting with his rival, or else one
   * with a friend or his fellow traveller.
   * Returns its feed line, or "". Without a deck the stories are off and
   * nothing rolls, so the dice stay the same as without one.
   */
  happen(place: Pick<Place, "name" | "class" | "lat" | "lon"> & { made?: unknown }, hour: number, rng: Rng): string {
    this.petAt(place);
    if (!this.incidents.length) return "";
    const tone = this.story.roll(rng, riskMult(this.attr("luck")) * this.pets.riskMult());
    const card = tone && Inc.pick(this.incidents, tone, { place: place.name, kind: place.class, hour, rides: this.getsAbout() }, inTime, rng, this.story.recent);
    if (tone && card) {
      this.story.after(card.id, tone);
      this.incidentLine = Inc.play(card, this, place.name, rng);
      if (card.stray) this.stray(card.stray, place.name);
      return this.incidentLine;
    }
    // Clubs roll their own dice, so the walk's stay the same.
    const t = this.now();
    const fx: Fx = {};
    const when = { city: this.where.city, day: new Date(t * 1000).getDay(), hour, date: dayOf(t * 1000), t };
    const club = this.clubs.stop(when, this.friends, fx, new Rng(seedOf(`club${t}${place.name}`)));
    if (club) {
      this.applyFx(fx);
      return (this.incidentLine = this.say(club));
    }
    const met = this.rival.meet(this, this.contests, place.name, place.class, [place.lat, place.lon], rng);
    if (met) return (this.incidentLine = met);
    const f = this.friends.stop({ city: this.where.city, place: place.name, kind: place.class, lat: place.lat, lon: place.lon, t: this.now() }, this.friendData, rng);
    if (f) return (this.incidentLine = this.say(f));
    // Where they know him, someone may greet him; its own dice.
    if (place.made || !place.name) return "";
    const g = new Rng(seedOf(`greet${t}${place.name}`));
    const hi = greeting(this.fame.tier(this.here()), place.name, g.randf(), g.randf());
    return hi && this.say(hi);
  }

  /** True while his latest feed line is an incident, so the line over the map stands out. */
  incidentLatest(): boolean {
    return !!this.incidentLine && this.history.latest() === this.incidentLine;
  }

  /** Notes a stop at a place, for the weekly recap. */
  stop(place: { class: string; subclass: string } & Partial<Pick<Place, "name" | "lat" | "lon">> & { made?: unknown }): void {
    this.atSpot = !place.made && place.name !== undefined && this.spots.isSpot(this.where.city, place as Pick<Place, "name" | "lat" | "lon">);
    this.week.stop(place.class);
    this.sayIf(this.records.stopped(dayOf(this.now() * 1000)));
  }

  fainted(): boolean {
    return this.meters.health <= 0;
  }

  /** After fainting: patched up at a hospital for a fee. */
  wakeInHospital(hospital: string): string {
    const fee = Math.min(HOSPITAL_FEE, Math.floor(this.cents * HOSPITAL_MAX_SHARE));
    this.cents -= fee;
    this.records.fainted(this.now());
    this.life.faints++;
    this.meters.health = WAKE_HEALTH;
    this.meters.energy = Math.max(this.meters.energy, 30);
    this.meters.fullness = Math.max(this.meters.fullness, 30);
    this.meters.thirst = Math.max(this.meters.thirst, 30);
    this.milestone("faint", `Fainted for the first time and woke up at ${hospital || "the hospital"}`);
    const line = this.say(`Fainted! Woke up at ${hospital || "the hospital"} (${signed(-fee)})`);
    this.diary.note("faint", hospital || "the hospital");
    this.habit(Qk.FAINT);
    return line;
  }

  say(line: string): string {
    const t = this.now();
    this.history.add(line, t);
    this.onSay?.(line, t);
    return line;
  }

  /** Says `line` unless it is empty. */
  sayIf(line: string): void {
    if (line) this.say(line);
  }

  toJSON() {
    return {
      meters: this.meters, attrs: this.attrs, cents: this.cents, savingFor: this.savingFor, dragonFed: this.dragonFed, dragonSulked: this.dragonSulked, xp: this.xp, level: this.level,
      buffs: this.buffs, walkMin: this.walkMin, history: this.history.toJSON(), visited: [...this.visited], gear: this.gear, bag: this.bag,
      care: this.care.toJSON(), bond: this.bond.toJSON(), fame: this.fame.toJSON(), law: this.law.toJSON(), bricks: this.bricks.toJSON(), chronicle: this.chronicle.toJSON(), keepsakes: this.keepsakes.toJSON(), where: this.where, week: this.week.toJSON(), records: this.records.toJSON(), creatures: this.creatures.toJSON(), magic: this.magic, lore: this.lore.toJSON(), finds: this.finds.toJSON(), portals: this.portals.toJSON(), giants: this.giants.toJSON(), rings: this.rings.toJSON(), story: this.story.toJSON(), rival: this.rival.toJSON(), friends: this.friends.toJSON(),
      clubs: this.clubs.toJSON(), townies: this.townies.toJSON(), anniversaries: this.anniversaries.toJSON(), quests: this.quests.toJSON(), words: this.words.toJSON(),
      pets: this.pets.toJSON(),
      home: this.home.toJSON(),
      visas: this.visas.toJSON(),
      mind: this.mind.toJSON(), quirks: this.quirks.toJSON(), spots: this.spots.toJSON(), diary: this.diary.toJSON(), mail: this.mail.toJSON(),
      skills: this.skills.toJSON(), pantry: this.pantry.toJSON(), languages: this.languages.toJSON(),
      business: this.business.toJSON(), lottery: this.lottery.toJSON(), bucket: this.bucket.toJSON(),
      careers: this.careers.toJSON(),
      life: this.life.toJSON(),
    };
  }

  static fromJSON(d: ReturnType<Stats["toJSON"]>): Stats {
    const s = new Stats();
    Object.assign(s.meters, d.meters);
    Object.assign(s.attrs, d.attrs);
    s.cents = d.cents;
    s.savingFor = d.savingFor ?? 0;
    s.dragonFed = d.dragonFed ?? "";
    s.dragonSulked = d.dragonSulked ?? "";
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
    s.bond = B.Bond.fromJSON(d.bond);
    // A save from before fame and the law: a stranger everywhere, and nobody after him.
    s.fame = Fame.fromJSON(d.fame);
    s.law = R.Law.fromJSON(d.law);
    s.law.karma(s.bond.lean);
    s.bricks = Br.Bricks.fromJSON(d.bricks);
    // A save from before the chronicle: his firsts are long past, so only what comes next is written.
    s.chronicle = Chronicle.fromJSON(d.chronicle ?? { done: ["start", "trip", "abroad", "job", "faint", "letter"] });
    s.week = Week.fromJSON(d.week);
    s.creatures = Cr.Creatures.fromJSON(d.creatures);
    // A save from before magic: no Magic and no spells yet.
    s.magic = d.magic ?? 0;
    s.lore = Mg.Lore.fromJSON(d.lore);
    // A save from before the shop after midnight: nothing found there yet.
    s.finds = Mn.Finds.fromJSON(d.finds);
    s.portals = Po.Portals.fromJSON(d.portals);
    s.giants = Gi.Sightings.fromJSON(d.giants);
    s.rings = Fa.Rings.fromJSON(d.rings);
    s.records = Records.fromJSON(d.records);
    // A save from before the storyteller starts calm, on Classic.
    s.story = Storyteller.fromJSON(d.story);
    // A save from before quests starts with none, and rolls the board of the city he is in.
    s.quests = Quests.fromJSON(d.quests);
    // A save from before pets: none yet.
    s.pets = Pt.Pets.fromJSON(d.pets);
    s.home = Hm.Home.fromJSON(d.home);
    // A save from before visas: every country starts on Tourist.
    s.visas = V.Visas.fromJSON(d.visas);
    // A save from before his mind: no moodlets or fears yet, and fresh wants on the next tick.
    s.mind = Mind.fromJSON(d.mind);
    // A save from before quirks and spots: no habits counted yet.
    s.quirks = Qk.Quirks.fromJSON(d.quirks);
    s.spots = Spots.fromJSON(d.spots);
    // A save from before the diary: an empty one, starting with the next day.
    s.diary = Diary.fromJSON(d.diary);
    // A save from before letters and gifts: an empty mailbox.
    s.mail = Mailbox.fromJSON(d.mail);
    // A save from before Viktor: he hasn't met him yet.
    s.rival = Rival.fromJSON(d.rival);
    // A save from before friends: he hasn't met anyone yet.
    s.friends = Friends.fromJSON(d.friends);
    // A save from before clubs, townies and anniversaries: no clubs yet, news from the next day on, and his birthday is the day he set out, if his life story knows it.
    s.clubs = Clubs.fromJSON(d.clubs);
    s.townies = Townies.fromJSON(d.townies);
    // A save from before local words: none learned yet.
    s.words = Words.fromJSON(d.words);
    s.anniversaries = Anniversaries.fromJSON(d.anniversaries, s.chronicle.lines.find((l) => l.text.startsWith("Set out from"))?.t);
    // A save from before the diary is already on today, so its day starts now.
    if (!s.diary.today.date) Object.assign(s.diary.today, { date: s.anniversaries.day, city: s.where.city });
    // A save from before careers: no shifts yet, so every career starts at rank 1.
    s.careers = Ca.Careers.fromJSON(d.careers);
    // A save from before skills, cooking and languages: none yet, an empty pantry, and English; the country he is in next becomes his own (see passTime).
    s.skills = Skills.fromJSON(d.skills);
    s.pantry = Cook.Pantry.fromJSON(d.pantry);
    s.languages = Lang.Languages.fromJSON(d.languages);
    // A save from before side businesses and the lottery: none owned, no ticket.
    s.business = Bz.Business.fromJSON(d.business);
    s.lottery = Lt.Lottery.fromJSON(d.lottery);
    s.bucket = Bk.Bucket.fromJSON(d.bucket);
    // A save from before life stages: he was born on his birthday, a backpacker until the stages catch up with him.
    s.life = L.Life.fromJSON(d.life, s.anniversaries.born);
    return s;
  }
}

/** Makes the gains in `fx` (positive meters, attributes, Magic and XP) `mult` times as big. */
function skilled(fx: Fx, mult: number): void {
  for (const [k, v] of Object.entries(fx) as [keyof Fx, number][]) if (v > 0) fx[k] = v * mult;
}

/** The key a place is remembered by: its name and where it is. */
export const visitKey = (place: Pick<Place, "name" | "lat" | "lon">) => `${place.name}@${place.lat.toFixed(4)},${place.lon.toFixed(4)}`;

export function inTime(time: TimeOfDay, hour: number): boolean {
  const [a, b] = TIMES[time];
  return a <= b ? hour >= a && hour < b : hour >= a || hour < b;
}
