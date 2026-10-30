// The Collection as data: every set he can fill and every feat he can earn.
// A set lists its entries, found or not, with a hint for the ones he hasn't
// found; a feat counts something and has Bronze, Silver and Gold tiers, and
// Gold gives him a title. A new feature adds its SETS and FEATS here, and the
// sheet, the overall % and Help pick them up. Loaded lazily (sheet, Help, Game).
import { BRICKS_PER_DAY, MONUMENTS } from "./bricks";
import { dayOf } from "./gifts";
import type { Rarity } from "./items";
import * as Items from "./items";
import * as K from "./keepsakes";
import { MOUNT_ICON, placeIcon } from "./look";
import { ODD_KINDS, TOWER_KIND } from "./poiGen";
import type { Stats } from "./stats";

export const TABS = [
  { id: "cards", icon: "🎴", name: "Cards" },
  { id: "places", icon: "📇", name: "Places" },
  { id: "world", icon: "🌍", name: "World" },
  { id: "gear", icon: "⚔", name: "Gear" },
  { id: "feats", icon: "🏅", name: "Feats" },
] as const;
export type Tab = (typeof TABS)[number]["id"];

/** One thing to collect. `info` is a hint while he hasn't got it, and a detail once he has. */
export type Entry = { id: string; icon: string; name: string; got: boolean; info: string; rarity?: Rarity; finish?: K.Finish; group?: string };
/**
 * A set of entries. An `open` set has no end (landmark cards): it lists only
 * what he has and doesn't count towards the overall %. `startedOnly` sets
 * draw only the groups he has something from (city cards by country).
 */
export type CSet = { id: string; tab: Tab; icon: string; title: string; entries: (s: Stats) => Entry[]; facts?: (s: Stats) => [string, string][]; open?: boolean; startedOnly?: boolean };
/** A feat: a count with Bronze, Silver and Gold thresholds; Gold gives `title`. `what` words a number of it ("{n} countries visited"). */
export type Feat = { id: string; /** The tab its badge card is named after. */ tab: Tab; icon: string; name: string; what: string; tiers: [number, number, number]; title: string; count: (s: Stats) => number };

/** Every base, with the kind of shop that sells it. */
export const BASES: (Items.Base & { kind: Items.Kind })[] = (Object.entries(Items.KINDS) as [Items.Kind, Items.Base[]][]).flatMap(([kind, list]) => list.map((b) => ({ ...b, kind })));
/** Every material word: metals, then cloths. */
export const MATERIAL_NAMES = [...Items.MATERIALS.map((m) => m.metal), ...Items.MATERIALS.map((m) => m.cloth)];

/** The base and material an item is made of, read from its name (items don't store them). A living mount's name has no material. */
export function partsOf(item: Pick<Items.Item, "name" | "slot">): { base?: string; mat?: string } {
  let best: { base?: string; mat?: string } = {};
  for (const b of BASES) {
    if (b.slot !== item.slot || (best.base && best.base.length >= b.base.length)) continue;
    if (b.plain) {
      if (item.name.includes(b.base)) best = { base: b.base };
      continue;
    }
    const mat = Items.MATERIALS.map((m) => (b.cloth ? m.cloth : m.metal)).find((w) => item.name.includes(`${w} ${b.base}`));
    if (mat) best = { base: b.base, mat };
  }
  return best;
}

/** Item bases ("b:Sword") and materials ("m:Bronze") he has owned: the ones noted so far and what he has now. */
export function ownedIds(s: Stats): Set<string> {
  const ids = new Set(s.keepsakes.owned);
  for (const item of [...Object.values(s.gear), ...s.bag]) {
    if (!item) continue;
    const { base, mat } = partsOf(item);
    if (base) ids.add(`b:${base}`);
    if (mat) ids.add(`m:${mat}`);
  }
  return ids;
}

export const TIER_NAMES = ["", "Bronze", "Silver", "Gold"] as const;
export const MEDALS = ["", "🥉", "🥈", "🥇"] as const;

const SLOT_ICON: Record<Items.Slot, string> = { weapon: "⚔", offhand: "🛡", head: "🎩", body: "👕", feet: "👟", bag: "🎒", trinket: "💍", vehicle: "🚲" };
const VEHICLE_ICON: Record<string, string> = { bike: "🚲", motorcycle: "🛵", car: "🚗", ...MOUNT_ICON };
const words = (s: string) => s.replace(/_/g, " ");
/** "biggest", "2nd-biggest"... for a size rank up to CARDS_PER_COUNTRY. */
const ordinal = (n: number) => (n === 1 ? "biggest" : `${n}${n === 2 ? "nd" : n === 3 ? "rd" : "th"}-biggest`);
const article = (s: string) => (/^[aeiou]/i.test(s) ? "An" : "A");

const seenCountries = (s: Stats) => s.keepsakes.seen.filter((x) => !x.includes(":"));
const seenCities = (s: Stats) => s.keepsakes.seen.filter((x) => x.includes(":"));
/** Country names by code, from the city card pool. */
const countryNames = (s: Stats) => new Map([...(s.cityPool?.byCountry ?? [])].map(([code, cards]) => [code, cards[0]?.country ?? code]));
const shiny = (s: Stats) => [...s.keepsakes.cards.values(), ...s.keepsakes.cityCards.values()].filter((c) => c.finish).length;
const GEAR = BASES.filter((b) => b.slot !== "vehicle");
const VEHICLES = BASES.filter((b) => b.slot === "vehicle");
const ownedOf = (s: Stats, bases: Items.Base[]) => {
  const ids = ownedIds(s);
  return bases.filter((b) => ids.has(`b:${b.base}`)).length;
};
/** Each crawl's place kinds in words, for its hint and Help. */
export const CRAWL_KINDS: Record<string, string> = {
  coffee: "cafes or coffee shops",
  pub: "bars, pubs, clubs or beer gardens",
  sweet: "ice cream parlours, bakeries or sweet shops",
  parks: "parks or gardens",
  shops: "shops or clothing stores",
  museums: "museums",
  pilgrim: "places of worship",
  culture: "museums, galleries or theatres",
  sights: "landmarks",
};
/** Where each kind of item is sold, for hints (the place kinds with its "item" in data/actions.json). */
const SOLD_AT: Record<Items.Kind, string> = {
  weapons: "weapon, knife and hunting shops",
  improvised: "hardware and DIY shops",
  clothes: "clothes, shoe and sports shops",
  trinkets: "jewellers, gift and second-hand shops",
  instruments: "music shops",
  bicycles: "bicycle shops",
  motorcycles: "motorcycle shops",
  cars: "car dealers",
  tortoises: "pet shops, now and then",
  brooms: "hardware and DIY shops, now and then",
  carpets: "carpet shops, now and then",
  dragons: "the stable at a castle",
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const SETS: CSet[] = [
  {
    id: "landmarks",
    tab: "cards",
    icon: "🃏",
    title: "Landmark cards",
    open: true,
    entries: (s) =>
      [...s.keepsakes.cards]
        .sort((a, b) => b[1].t - a[1].t)
        .map(([key, c]) => ({ id: key, icon: "🃏", name: c.name, got: true, info: `${c.rarity}${c.finish ? ` ${K.FINISH_NAME[c.finish]}` : ""} · ${K.kindLabel(c.kind)} · ${c.city}`, rarity: c.rarity, finish: c.finish })),
    facts: (s) => {
      const cards = [...s.keepsakes.cards.values()];
      return [
        ["Rare · Uncommon · Common", ["Rare", "Uncommon", "Common"].map((r) => cards.filter((c) => c.rarity === r).length).join(" · ")],
        ["🌈 Foil · 🥇 Gold", `${cards.filter((c) => c.finish === "foil").length} · ${cards.filter((c) => c.finish === "gold").length}`],
      ];
    },
  },
  {
    id: "citycards",
    tab: "cards",
    icon: "🎴",
    title: "City cards",
    startedOnly: true,
    entries: (s) =>
      [...(s.cityPool?.byCountry.values() ?? [])].flatMap((cards) =>
        cards.map((c, i) => {
          const own = s.keepsakes.cityCards.get(c.key);
          return { id: c.key, icon: "🏙", name: c.name, got: !!own, info: own ? `${c.rarity}${own.finish ? ` ${K.FINISH_NAME[own.finish]}` : ""} · ${c.country}` : `${c.rarity} · its ${ordinal(i + 1)} city`, rarity: c.rarity, finish: own?.finish, group: c.country };
        }),
      ),
    facts: (s) => [
      ["Country sets done", String(s.keepsakes.sets.length)],
      ["Spares to sell · free packs", `${s.keepsakes.spares.length} · ${s.keepsakes.freePacks}`],
    ],
  },
  {
    id: "placedex",
    tab: "places",
    icon: "📇",
    title: "Placedex",
    entries: (s) => {
      const kinds = [...new Set([...Object.keys(s.dex), ...s.keepsakes.dex.keys()])];
      const rank = (kind: string) => Items.RARITY.indexOf(K.dexRarity(s.dex, kind));
      return kinds.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).map((kind) => {
        const rarity = K.dexRarity(s.dex, kind);
        const at = s.keepsakes.dex.get(kind);
        const [c = "", sub = ""] = kind.split("/");
        // A kind named after its class ("cafe/cafe") only gets "place" as its hint.
        const cls = sub && sub !== c ? words(c) : "place";
        return { id: kind, icon: "📍", name: K.kindLabel(kind), got: !!at, info: at ? `${rarity}${at.city ? ` · first in ${at.city}` : ""}` : `${article(rarity)} ${rarity} kind of ${cls}`, rarity, group: rarity };
      });
    },
  },
  {
    id: "odd",
    tab: "places",
    icon: "🧙",
    title: "Odd places",
    entries: (s) =>
      ODD_KINDS.map((kind) => {
        const got = s.keepsakes.odd.includes(kind);
        return { id: kind, icon: placeIcon({ class: kind, subclass: kind }), name: K.kindLabel(kind), got, info: got ? "Made up by the game" : kind === TOWER_KIND ? "Rises at a grand landmark of a big city" : "Made up by the game in some cities" };
      }),
  },
  {
    id: "crawls",
    tab: "places",
    icon: "🏁",
    title: "Crawls",
    entries: (s) =>
      K.CRAWLS.map((c) => {
        const k = s.keepsakes;
        const done = k.done.has(c.id);
        // A day's or a city's count from before is over, even before his next stop starts it again.
        const stale = (c.per === "day" && k.day !== dayOf(s.now() * 1000)) || (c.per === "city" && k.city !== s.where.city);
        const got = stale ? 0 : (k.progress[c.id]?.length ?? 0);
        const per = c.per === "day" ? "in a day" : c.per === "city" ? "in one city" : "in all";
        return { id: c.id, icon: c.icon, name: c.name, got: done, info: done ? `Done · ${K.perkText(c.perk)} at each one` : `${c.need} different ${CRAWL_KINDS[c.id] ?? c.kinds.join(", ")} ${per}: ${got} / ${c.need}` };
      }),
  },
  {
    id: "countries",
    tab: "world",
    icon: "🌍",
    title: "Countries",
    entries: (s) => {
      const seen = new Set(seenCountries(s));
      return [...countryNames(s)]
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([code, name]) => ({ id: code, icon: "🌍", name, got: seen.has(code), info: seen.has(code) ? "Visited" : `A country starting with ${name.charAt(0)}` }));
    },
    facts: (s) => [["🏙 Cities visited", String(seenCities(s).length)]],
  },
  {
    id: "souvenirs",
    tab: "world",
    icon: "🧳",
    title: "Souvenirs",
    entries: (s) => {
      const names = countryNames(s);
      return Object.entries(K.SOUVENIRS).map(([code, name]) => {
        const got = s.keepsakes.souvenirs.get(code);
        return { id: code, icon: "🧳", name, got: !!got, info: got ? `From ${got.city}, ${got.country}` : `Found in ${names.get(code) ?? code}` };
      });
    },
    facts: (s) => {
      const cut = K.fareCut(s.keepsakes.souvenirs.size);
      const magnets = [...s.keepsakes.souvenirs.keys()].filter((c) => !(c in K.SOUVENIRS)).length;
      return [
        ["🧲 Fridge magnets", String(magnets)],
        ["✈ Fares", cut ? `${Math.round(cut * 100)}% cheaper` : "full price"],
      ];
    },
  },
  {
    id: "gear",
    tab: "gear",
    icon: "⚔",
    title: "Item bases",
    entries: (s) => {
      const ids = ownedIds(s);
      return GEAR.map((b) => ({ id: b.base, icon: SLOT_ICON[b.slot], name: b.base, got: ids.has(`b:${b.base}`), info: `Sold at ${SOLD_AT[b.kind]}`, group: cap(words(b.kind)) }));
    },
  },
  {
    id: "materials",
    tab: "gear",
    icon: "⛏",
    title: "Materials",
    entries: (s) => {
      const ids = ownedIds(s);
      return Items.MATERIALS.flatMap((m) => [
        { id: m.metal, icon: "⛏", name: m.metal, got: ids.has(`m:${m.metal}`), info: `Metal, from level ${m.level}` },
        { id: m.cloth, icon: "🧵", name: m.cloth, got: ids.has(`m:${m.cloth}`), info: `Cloth, from level ${m.level}` },
      ]);
    },
  },
  {
    id: "monuments",
    tab: "world",
    icon: "🧱",
    title: "Monuments",
    entries: (s) =>
      MONUMENTS.map((m, i) => {
        const built = s.bricks.built.filter((b) => b.kind === i);
        const last = built.at(-1);
        return { id: m.name, icon: m.icon, name: m.name[0]!.toUpperCase() + m.name.slice(1), got: !!last, info: last ? `${built.length > 1 ? `${built.length} built, the last ` : ""}in ${last.park}, ${last.city}` : `${m.bricks} golden bricks, at a park` };
      }),
    facts: (s) => {
      const b = s.bricks;
      return [
        ["🧱 Golden bricks", `${b.count} / ${b.next().bricks}`],
        ["Saving for", `${b.next().icon} ${b.next().name}`],
        ["Found today", `${b.day === dayOf(s.now() * 1000) ? b.today : 0} / ${BRICKS_PER_DAY}`],
      ];
    },
  },
  {
    id: "vehicles",
    tab: "gear",
    icon: "🚲",
    title: "Vehicles",
    entries: (s) => {
      const ids = ownedIds(s);
      return VEHICLES.map((b) => ({ id: b.base, icon: VEHICLE_ICON[b.vehicle ?? ""] ?? "🚲", name: b.base, got: ids.has(`b:${b.base}`), info: `Sold at ${SOLD_AT[b.kind]}` }));
    },
  },
];

export const FEATS: Feat[] = [
  { id: "level", tab: "world", icon: "⭐", name: "Growing up", what: "level {n}", tiers: [5, 15, 30], title: "Veteran", count: (s) => s.level },
  { id: "places", tab: "places", icon: "📍", name: "Out and about", what: "{n} places visited", tiers: [50, 500, 2000], title: "Local Legend", count: (s) => s.visited.size },
  { id: "cities", tab: "world", icon: "🏙", name: "City hopper", what: "{n} cities visited", tiers: [5, 25, 100], title: "Wanderer", count: (s) => seenCities(s).length },
  { id: "countries", tab: "world", icon: "🌍", name: "Passport stamps", what: "{n} countries visited", tiers: [3, 10, 30], title: "Globetrotter", count: (s) => seenCountries(s).length },
  { id: "landmarks", tab: "cards", icon: "🃏", name: "Landmarks", what: "{n} landmark cards", tiers: [10, 50, 200], title: "Landmark Hunter", count: (s) => s.keepsakes.cards.size },
  { id: "citycards", tab: "cards", icon: "🎴", name: "Card binder", what: "{n} city cards", tiers: [10, 50, 250], title: "Card Shark", count: (s) => s.keepsakes.cityCards.size },
  { id: "sets", tab: "cards", icon: "🗃", name: "Full sets", what: "{n} country sets of city cards", tiers: [1, 3, 10], title: "Set Collector", count: (s) => s.keepsakes.sets.length },
  { id: "shiny", tab: "cards", icon: "🌈", name: "Shiny", what: "{n} Foil or Gold cards", tiers: [1, 5, 20], title: "Shiny Hunter", count: shiny },
  { id: "placedex", tab: "places", icon: "📇", name: "Placedex", what: "{n} place kinds seen", tiers: [25, 100, 250], title: "Placedex Master", count: (s) => s.keepsakes.dex.size },
  { id: "souvenirs", tab: "world", icon: "🧳", name: "Souvenir shelf", what: "{n} souvenirs", tiers: [3, 10, 30], title: "Souvenir Hunter", count: (s) => s.keepsakes.souvenirs.size },
  { id: "odd", tab: "places", icon: "🧙", name: "Off the map", what: "{n} odd places", tiers: [2, 4, ODD_KINDS.length], title: "Mystic", count: (s) => s.keepsakes.odd.length },
  { id: "builder", tab: "world", icon: "🧱", name: "Builder", what: "{n} monuments built", tiers: [1, 2, MONUMENTS.length], title: "Patron", count: (s) => s.bricks.built.length },
  { id: "ruins", tab: "places", icon: "🏰", name: "Delver", what: "{n} ruins crawled", tiers: [1, 5, 20], title: "Delver", count: (s) => s.ruins.count },
  { id: "crawls", tab: "places", icon: "🏁", name: "Crawler", what: "{n} crawls done", tiers: [3, 6, K.CRAWLS.length], title: "Crawl Legend", count: (s) => s.keepsakes.done.size },
  { id: "gear", tab: "gear", icon: "👕", name: "Wardrobe", what: "{n} item bases owned", tiers: [10, 25, GEAR.length], title: "Outfitter", count: (s) => ownedOf(s, GEAR) },
  { id: "materials", tab: "gear", icon: "⛏", name: "Materials", what: "{n} materials owned", tiers: [4, 8, MATERIAL_NAMES.length], title: "Artisan", count: (s) => [...ownedIds(s)].filter((x) => x.startsWith("m:")).length },
  { id: "vehicles", tab: "gear", icon: "🚗", name: "Garage", what: "{n} vehicles owned", tiers: [1, 3, VEHICLES.length], title: "Road King", count: (s) => ownedOf(s, VEHICLES) },
  { id: "treasured", tab: "gear", icon: "💎", name: "Keepsakes", what: "{n} treasured items he has", tiers: [1, 3, 6], title: "Storyteller", count: (s) => [...Object.values(s.gear), ...s.bag].filter((i) => i && Items.isTreasured(i)).length },
];

/** "30 countries visited" for n = 30. */
export const say = (f: Feat, n: number | string) => f.what.replace("{n}", String(n));

/** How many tiers of `f` a count reaches (0 to 3). */
export const tierOf = (f: Feat, n: number) => f.tiers.filter((t) => n >= t).length;

/** Badges earned so far, kept even if the count falls (a sold treasured item). */
export const tierHeld = (f: Feat, s: Stats) => Math.max(s.keepsakes.badges[f.id] ?? 0, tierOf(f, f.count(s)));

/** Gives him the badges he has newly reached, with a feed line each; a new Gold one becomes his title. */
export function award(s: Stats): string[] {
  const k = s.keepsakes;
  k.owned = [...ownedIds(s)];
  const lines: string[] = [];
  for (const f of FEATS) {
    const n = f.count(s);
    const tier = tierOf(f, n);
    const had = k.badges[f.id] ?? 0;
    if (tier <= had) continue;
    k.badges[f.id] = tier;
    if (tier === 3) k.title = f.title;
    lines.push(s.say(`${MEDALS[tier]} ${TIER_NAMES[tier]} badge: ${f.name} (${say(f, f.tiers[tier - 1]!)})${tier === 3 ? `. New title: ${f.title}` : ""}`));
  }
  return lines;
}

/** Found entries and tiers out of all of them, for the overall %. Open sets don't count. `entriesOf` can hand in entries already worked out. */
export function completion(s: Stats, entriesOf = (set: CSet) => set.entries(s)): { got: number; total: number } {
  let got = 0;
  let total = 0;
  for (const set of SETS) {
    if (set.open) continue;
    const e = entriesOf(set);
    got += e.filter((x) => x.got).length;
    total += e.length;
  }
  for (const f of FEATS) {
    got += tierHeld(f, s);
    total += 3;
  }
  return { got, total };
}
