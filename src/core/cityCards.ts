// City cards: a trading card for each of the CARDS_PER_COUNTRY biggest
// cities of every country, pulled at random from packs. A card's rarity is
// fixed by the city's size in its country; on top of it a pull may be Foil
// or Gold. Spares are sold at card shops, and a whole country's set gives a
// little Charm while he is in that country. Pure data and rules; Stats uses them.
import type { Rarity } from "./items";
import { type Finish, rollFinish } from "./keepsakes";
import type { Rng } from "./rng";
import type { City } from "./trips";

/** How many of each country's biggest cities have a card. */
export const CARDS_PER_COUNTRY = 10;
/** A city's rarity by its size rank in its country (1 = biggest): Rare up to RARE_UP_TO, Uncommon up to UNCOMMON_UP_TO, else Common. */
export const RARE_UP_TO = 1;
export const UNCOMMON_UP_TO = 3;
/** Cards in a pack. */
export const PACK_SIZE = 5;
/** A pull's rarity odds; then a random city of that rarity. */
export const PULL_ODDS: [Rarity, number][] = [
  ["Rare", 0.05],
  ["Uncommon", 0.25],
  ["Common", 0.7],
];
/** Map kinds that sell packs and buy his spares, with their names for Help. */
export const CARD_SHOPS: Record<string, string> = { "shop/kiosk": "kiosks", "shop/newsagent": "newsagents", "shop/gift": "gift shops" };
/** "kiosks, newsagents and gift shops", for Help and the Collection. */
export const CARD_SHOP_NAMES = Object.values(CARD_SHOPS).join(", ").replace(/, ([^,]*)$/, " and $1");
/** What a spare fetches, in cents, by rarity; a Foil one is worth FOIL_MULT times that, a Gold one GOLD_MULT. */
export const SPARE_CENTS: Partial<Record<Rarity, number>> = { Common: 10, Uncommon: 30, Rare: 100 };
export const FOIL_MULT = 3;
export const GOLD_MULT = 10;
/** Charm while he is in a country whose whole set he has. */
export const SET_CHARM = 1;

export type CityCard = { key: string; name: string; code: string; country: string; rarity: Rarity };
export type Pool = { cards: CityCard[]; byRarity: Map<Rarity, CityCard[]>; byKey: Map<string, CityCard>; byCountry: Map<string, CityCard[]> };
export type Owned = { finish: Finish; t: number };
export type Spare = { rarity: Rarity; finish: Finish };

const cardKey = (code: string, name: string) => `${code}:${name}`;

let built: { from: City[]; pool: Pool } | null = null;
/** The card pool for `cities`; built once per list. */
export function pool(cities: City[]): Pool {
  if (built?.from === cities) return built.pool;
  const byCountry = new Map<string, City[]>();
  for (const c of cities) {
    const list = byCountry.get(c.code);
    if (list) list.push(c);
    else byCountry.set(c.code, [c]);
  }
  const cards: CityCard[] = [];
  const sets = new Map<string, CityCard[]>();
  for (const [code, list] of byCountry) {
    // Two towns of one name (Springfield, Portland) would share a key, so the smaller one gets no card.
    const names = new Set(list.sort((a, b) => b.pop - a.pop).map((c) => c.name));
    const top = [...names].slice(0, CARDS_PER_COUNTRY).map((name, i): CityCard => ({ key: cardKey(code, name), name, code, country: list[0]!.country, rarity: i < RARE_UP_TO ? "Rare" : i < UNCOMMON_UP_TO ? "Uncommon" : "Common" }));
    sets.set(code, top);
    cards.push(...top);
  }
  const byRarity = new Map<Rarity, CityCard[]>();
  for (const c of cards) {
    const list = byRarity.get(c.rarity);
    if (list) list.push(c);
    else byRarity.set(c.rarity, [c]);
  }
  const p = { cards, byRarity, byKey: new Map(cards.map((c) => [c.key, c])), byCountry: sets };
  built = { from: cities, pool: p };
  return p;
}

/** One random card and its finish. */
export function pull(p: Pool, rng: Rng): { card: CityCard; finish: Finish } {
  let r = rng.randf();
  let rarity: Rarity = "Common";
  for (const [k, odds] of PULL_ODDS) {
    if (r < odds && p.byRarity.get(k)?.length) {
      rarity = k;
      break;
    }
    r -= odds;
  }
  const list = p.byRarity.get(rarity) ?? p.cards;
  return { card: list[Math.min(Math.floor(rng.randf() * list.length), list.length - 1)]!, finish: rollFinish(rng.randf()) };
}

/** True when `owned` holds every card of country `code`. */
export const hasSet = (p: Pool, owned: Map<string, Owned>, code: string) => p.byCountry.get(code)?.every((c) => owned.has(c.key)) ?? false;

export const spareCents = (s: Spare) => (SPARE_CENTS[s.rarity] ?? 0) * (s.finish === "gold" ? GOLD_MULT : s.finish === "foil" ? FOIL_MULT : 1);
