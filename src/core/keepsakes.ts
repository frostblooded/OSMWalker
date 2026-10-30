// His keepsakes: a card for each landmark he visits (its rarity from the
// map's rank, sometimes foil or gold), the Placedex of place kinds he has
// seen (rarer the less common the kind is in the POI sweep), a souvenir from
// each country, and crawls, little sets he finishes by visiting places of a
// kind. Pure data and rules; Stats.collect() uses them.
import type { Rarity } from "./items";
import type { Fx, Place } from "./stats";

/** Map classes that count as landmarks; art shops (art_gallery/art) don't. */
export const LANDMARK_CLASSES = ["attraction", "museum", "art_gallery", "castle", "monument", "memorial", "zoo", "aquarium", "theatre", "stadium", "place_of_worship", "theme_park"];
/** The map files shops that sell art under art_gallery; they are no gallery or sight. */
const isArtShop = (p: Pick<Place, "class" | "subclass">) => p.class === "art_gallery" && p.subclass === "art";
export const isLandmark = (p: Pick<Place, "class" | "subclass">) => LANDMARK_CLASSES.includes(p.class) && !isArtShop(p);

export type Finish = "" | "foil" | "gold";
/** Each new card is gold this often, else foil this often. */
export const GOLD_CHANCE = 0.005;
export const FOIL_CHANCE = 0.05;
export const FINISH_NAME: Record<Finish, string> = { "": "", foil: "Foil", gold: "Gold" };

/** A landmark card's rarity from the place's map rank: 1 is the most important in its area. */
export const RARE_RANK = 1;
export const UNCOMMON_RANK = 2;
export const cardRarity = (rank: number): Rarity => (rank <= RARE_RANK ? "Rare" : rank === UNCOMMON_RANK ? "Uncommon" : "Common");
/** A finish for a roll r in [0, 1). */
export const rollFinish = (r: number): Finish => (r < GOLD_CHANCE ? "gold" : r < GOLD_CHANCE + FOIL_CHANCE ? "foil" : "");

/** Newest cards the Collection sheet draws when the list opens; its counts cover them all. */
export const CARDS_SHOWN = 60;
export type Card = { name: string; kind: string; city: string; rarity: Rarity; finish: Finish; t: number };

/** Bonus XP the first time he sees a place kind, by its Placedex rarity. */
export const DEX_XP: Record<Rarity, number> = { Common: 10, Uncommon: 30, Rare: 80, Legendary: 200 };
/** How many of a kind the sweep must find for each rarity; fewer is Legendary. Copies BANDS in tools/make_placedex.py, which applies them. */
export const DEX_BANDS: [number, Rarity][] = [[1000, "Common"], [100, "Uncommon"], [10, "Rare"]];
const DEX_CODE: Record<string, Rarity> = { C: "Common", U: "Uncommon", R: "Rare", L: "Legendary" };
/** Placedex rarity by "class/subclass", from data/placedex.json; kinds it lacks are Legendary. */
export type Dex = Record<string, string>;
export const kindOf = (p: Pick<Place, "class" | "subclass">) => `${p.class}/${p.subclass}`;
export const dexRarity = (dex: Dex, kind: string): Rarity => DEX_CODE[dex[kind] ?? "L"] ?? "Legendary";
/** "place_of_worship/christian" -> "Christian · place of worship"; "cafe/cafe" -> "Cafe". */
export function kindLabel(kind: string): string {
  const [cls = "", sub = ""] = kind.split("/");
  const words = (s: string) => s.replace(/_/g, " ");
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (!sub || sub === cls) return cap(words(cls));
  return `${cap(words(sub))} · ${words(cls)}`;
}

/** Each country's own souvenir; any other country gets a fridge magnet. */
export const SOUVENIRS: Record<string, string> = {
  BGR: "bottle of rose oil", FRA: "tiny Eiffel Tower", GBR: "red phone box money tin", DEU: "beer stein", ITA: "Leaning Tower snow globe",
  ESP: "flamenco fan", PRT: "painted azulejo tile", GRC: "evil eye charm", TUR: "evil eye bead", USA: "Statue of Liberty figure",
  CAN: "maple syrup bottle", MEX: "lucha libre mask", BRA: "football shirt", ARG: "mate gourd", JPN: "maneki-neko cat",
  CHN: "paper lantern", KOR: "pair of steel chopsticks", IND: "brass elephant", THA: "silk elephant cushion", VNM: "conical hat",
  RUS: "matryoshka doll", POL: "painted Easter egg", CZE: "Bohemian glass", AUT: "Mozart chocolate box", NLD: "pair of wooden clogs",
  BEL: "box of pralines", CHE: "cuckoo clock", SWE: "Dala horse", NOR: "troll figure", DNK: "toy brick model",
  FIN: "Moomin mug", IRL: "shamrock pin", HUN: "paprika pouch", ROU: "Dracula mug", SRB: "šajkača cap",
  HRV: "Licitar heart", EGY: "papyrus scroll", MAR: "brass lantern", AUS: "boomerang", NZL: "kiwi plush", ZAF: "beaded giraffe",
};
/** A landmark in a country he has no souvenir from gives him one this often. */
export const SOUVENIR_CHANCE = 0.3;
export const souvenirName = (code: string, country: string) => SOUVENIRS[code] ?? `${country || "local"} fridge magnet`;
/** Every SOUVENIRS_PER_CUT souvenirs cut his fares by FARE_CUT, up to FARE_CUT_MAX. */
export const SOUVENIRS_PER_CUT = 5;
export const FARE_CUT = 0.02;
export const FARE_CUT_MAX = 0.1;
export const fareCut = (souvenirs: number) => Math.min(Math.floor(souvenirs / SOUVENIRS_PER_CUT) * FARE_CUT, FARE_CUT_MAX);
export type Souvenir = { name: string; country: string; city: string; t: number };

/** A crawl: `need` different places of `kinds` (a class, or class/subclass) in one day, in one city, or ever. Done once; from then on every visit to one of its places gives `perk`. */
export type Crawl = { id: string; name: string; icon: string; kinds: string[]; need: number; per: "day" | "city" | "ever"; perk: Fx };
export const CRAWLS: Crawl[] = [
  { id: "coffee", name: "Coffee crawl", icon: "☕", kinds: ["cafe", "shop/coffee"], need: 4, per: "day", perk: { energy: 2 } },
  { id: "pub", name: "Pub crawl", icon: "🍺", kinds: ["bar", "beer"], need: 4, per: "day", perk: { mood: 2 } },
  { id: "sweet", name: "Sweet tooth", icon: "🍦", kinds: ["ice_cream", "bakery", "shop/confectionery", "shop/chocolate"], need: 3, per: "day", perk: { fullness: 2 } },
  { id: "parks", name: "Park life", icon: "🌳", kinds: ["park", "garden"], need: 5, per: "day", perk: { health: 1 } },
  { id: "shops", name: "Window shopping", icon: "🛍", kinds: ["shop", "clothing_store"], need: 6, per: "day", perk: { mood: 1 } },
  { id: "museums", name: "Museum marathon", icon: "🏛", kinds: ["museum"], need: 3, per: "day", perk: { xp: 5 } },
  { id: "pilgrim", name: "Pilgrim", icon: "⛪", kinds: ["place_of_worship"], need: 5, per: "city", perk: { mood: 2 } },
  { id: "culture", name: "Culture vulture", icon: "🎭", kinds: ["museum", "art_gallery", "theatre"], need: 15, per: "ever", perk: { xp: 5 } },
  { id: "sights", name: "Sightseer", icon: "🃏", kinds: LANDMARK_CLASSES, need: 25, per: "ever", perk: { xp: 5 } },
];
/** "+2 energy", "+5 XP". */
export const perkText = (perk: Fx) =>
  Object.entries(perk)
    .map(([k, v]) => `+${v} ${k === "xp" ? "XP" : k}`)
    .join(", ");
export const crawlMatches = (c: Crawl, p: Pick<Place, "class" | "subclass">) => !isArtShop(p) && (c.kinds.includes(p.class) || c.kinds.includes(kindOf(p)));

/** Everything he has collected, as saved. */
export class Keepsakes {
  /** By the place's visit key (see Stats.visit). */
  cards = new Map<string, Card>();
  /** Place kinds seen: when and in which city first. */
  dex = new Map<string, { t: number; city: string }>();
  /** By country code. */
  souvenirs = new Map<string, Souvenir>();
  /** Finished crawls, by id, with when. */
  done = new Map<string, number>();
  /** Visit keys counted towards each unfinished crawl, and the day and city they were counted in. */
  progress: Record<string, string[]> = {};
  day = "";
  city = "";

  /** Starts each day's and city's crawls over when the day or city changed. */
  roll(day: string, city: string): void {
    const fresh = (per: Crawl["per"]) => CRAWLS.filter((c) => c.per === per).forEach((c) => delete this.progress[c.id]);
    if (day !== this.day) fresh("day");
    if (city !== this.city) fresh("city");
    this.day = day;
    this.city = city;
  }

  toJSON() {
    return {
      cards: [...this.cards],
      dex: [...this.dex],
      souvenirs: [...this.souvenirs],
      done: [...this.done],
      progress: this.progress,
      day: this.day,
      city: this.city,
    };
  }

  static fromJSON(d: Partial<ReturnType<Keepsakes["toJSON"]>> | undefined): Keepsakes {
    const k = new Keepsakes();
    if (!d) return k;
    k.cards = new Map(d.cards ?? []);
    k.dex = new Map(d.dex ?? []);
    k.souvenirs = new Map(d.souvenirs ?? []);
    k.done = new Map(d.done ?? []);
    k.progress = d.progress ?? {};
    k.day = d.day ?? "";
    k.city = d.city ?? "";
    return k;
  }
}
