// His bucket list: BUCKET_SIZE dreams at a time, a mix of things to do in the
// game (reach a level, ride a dragon, cook a stew...) and real sights in real
// cities (see the Eiffel Tower in Paris). He ticks one off by himself when he
// gets there: a goal once it is met, a sight once he arrives in its city. A
// sight on his list pulls his trips gently toward its city (DREAM_PULL, and
// at least DREAM_SHARE of a trip's odds, so a small city comes up too), and
// a dream ticked off makes room for a new one each morning. Pure; Stats owns one.
import type { Rng } from "./rng";
import type { Vehicle } from "./speeds";
import type { Pull } from "./trips";

/** What a game dream counts (Stats.facts builds them). */
export type Fact = "level" | "countries" | "dragon" | "car" | "dishes" | "fluent" | "prize" | "business" | "monument" | "skill";
export type Facts = Record<Fact, number> & { /** The "Name, Country" of the city he is in. */ city: string };
/** A dream: a game goal (`fact` at least `n`) or a sight in `city` ("Name, Country", as trips name it). */
export type Dream = { id: string; icon: string; text: string; fact?: Fact; n?: number; city?: string };

/** Dreams on his list at once. */
export const BUCKET_SIZE = 3;
/** What ticking one off gives him. */
export const DREAM_XP = 150;
export const DREAM_MOOD = 15;
/** A city with a sight on his list weighs this many times its size when he picks where to travel, and at least DREAM_SHARE of all the cities he could go to. */
export const DREAM_PULL = 3;
export const DREAM_SHARE = 0.05;
/** What counts for "a car or something faster": a carpet and a dragon are faster, so he never buys a car after them. */
export const CAR_OR_BETTER: readonly Vehicle[] = ["car", "carpet", "dragon"];

export const GOALS: Dream[] = [
  { id: "level10", icon: "⭐", text: "Reach level 10", fact: "level", n: 10 },
  { id: "level25", icon: "🌟", text: "Reach level 25", fact: "level", n: 25 },
  { id: "countries5", icon: "🌍", text: "Walk in 5 countries", fact: "countries", n: 5 },
  { id: "countries15", icon: "🗺", text: "Walk in 15 countries", fact: "countries", n: 15 },
  { id: "car", icon: "🚗", text: "Own a car or something faster", fact: "car", n: 1 },
  { id: "dragon", icon: "🐉", text: "Ride a dragon", fact: "dragon", n: 1 },
  { id: "dishes", icon: "🍲", text: "Cook 5 different dishes", fact: "dishes", n: 5 },
  { id: "fluent", icon: "🗣", text: "Speak a new language fluently", fact: "fluent", n: 1 },
  { id: "prize", icon: "🎟", text: "Win on the lottery", fact: "prize", n: 1 },
  { id: "business", icon: "💹", text: "Own a business", fact: "business", n: 1 },
  { id: "monument", icon: "🧱", text: "Build a monument", fact: "monument", n: 1 },
  { id: "skill7", icon: "🎓", text: "Get a skill to level 7", fact: "skill", n: 7 },
];

export const SIGHTS: Dream[] = [
  { id: "eiffel", icon: "🗼", text: "See the Eiffel Tower", city: "Paris, France" },
  { id: "colosseum", icon: "🏛", text: "Stand in the Colosseum", city: "Rome, Italy" },
  { id: "bigben", icon: "🕰", text: "Hear Big Ben strike", city: "London, United Kingdom" },
  { id: "sagrada", icon: "⛪", text: "Look up at the Sagrada Família", city: "Barcelona, Spain" },
  { id: "acropolis", icon: "🏛", text: "Climb to the Acropolis", city: "Athens, Greece" },
  { id: "pisa", icon: "🗼", text: "Hold up the Leaning Tower of Pisa", city: "Pisa, Italy" },
  { id: "gondola", icon: "🛶", text: "Ride a gondola in Venice", city: "Venice, Italy" },
  { id: "duomo", icon: "⛪", text: "See the Duomo in Florence", city: "Florence, Italy" },
  { id: "charles", icon: "🌉", text: "Cross the Charles Bridge at dawn", city: "Prague, Czechia" },
  { id: "canals", icon: "🚲", text: "Cycle along the Amsterdam canals", city: "Amsterdam, Netherlands" },
  { id: "brandenburg", icon: "🏛", text: "Walk through the Brandenburg Gate", city: "Berlin, Germany" },
  { id: "schonbrunn", icon: "🏰", text: "Waltz at Schönbrunn Palace", city: "Vienna, Austria" },
  { id: "parliament", icon: "🏛", text: "See Budapest's Parliament lit at night", city: "Budapest, Hungary" },
  { id: "castle", icon: "🏰", text: "Climb up to Edinburgh Castle", city: "Edinburgh, United Kingdom" },
  { id: "belem", icon: "🗼", text: "Eat a custard tart by the Belém Tower", city: "Lisbon, Portugal" },
  { id: "nevsky", icon: "⛪", text: "See the gold domes of Alexander Nevsky", city: "Sofia, Bulgaria" },
  { id: "redsquare", icon: "🏰", text: "Stand in Red Square", city: "Moscow, Russia" },
  { id: "hagia", icon: "🕌", text: "Step inside the Hagia Sophia", city: "Istanbul, Turkey" },
  { id: "pyramids", icon: "🔺", text: "See the Pyramids of Giza", city: "Cairo, Egypt" },
  { id: "jemaa", icon: "🐍", text: "Get lost in Jemaa el-Fnaa", city: "Marrakesh, Morocco" },
  { id: "table", icon: "⛰", text: "Look out from Table Mountain", city: "Cape Town, South Africa" },
  { id: "oldcity", icon: "🕍", text: "Walk the Old City of Jerusalem", city: "Jerusalem, Israel" },
  { id: "burj", icon: "🏙", text: "Go up the Burj Khalifa", city: "Dubai, United Arab Emirates" },
  { id: "taj", icon: "🕌", text: "See the Taj Mahal at sunrise", city: "Agra, India" },
  { id: "angkor", icon: "🛕", text: "Watch the sun rise over Angkor Wat", city: "Siem Reap, Cambodia" },
  { id: "palace", icon: "🛕", text: "Visit the Grand Palace in Bangkok", city: "Bangkok, Thailand" },
  { id: "forbidden", icon: "🏯", text: "Walk the Forbidden City", city: "Beijing, China" },
  { id: "inari", icon: "⛩", text: "Walk the red gates of Fushimi Inari", city: "Kyoto, Japan" },
  { id: "shibuya", icon: "🚦", text: "Cross Shibuya Crossing", city: "Tokyo, Japan" },
  { id: "gyeongbok", icon: "🏯", text: "See the guard change at Gyeongbokgung", city: "Seoul, South Korea" },
  { id: "gardens", icon: "🌳", text: "See the Supertrees in Singapore", city: "Singapore, Singapore" },
  { id: "opera", icon: "🎭", text: "Hear a concert at the Sydney Opera House", city: "Sydney, Australia" },
  { id: "liberty", icon: "🗽", text: "Wave at the Statue of Liberty", city: "New York, United States of America" },
  { id: "cntower", icon: "🗼", text: "Go up the CN Tower", city: "Toronto, Canada" },
  { id: "zocalo", icon: "🌮", text: "Eat tacos on the Zócalo", city: "Mexico City, Mexico" },
  { id: "machu", icon: "⛰", text: "Take the road to Machu Picchu", city: "Cusco, Peru" },
  { id: "redeemer", icon: "⛰", text: "See Christ the Redeemer over Rio", city: "Rio de Janeiro, Brazil" },
  { id: "tango", icon: "💃", text: "Dance a tango in Buenos Aires", city: "Buenos Aires, Argentina" },
];

export const DREAMS: Dream[] = [...GOALS, ...SIGHTS];
export const dreamOf = (id: string) => DREAMS.find((d) => d.id === id);

/** Whether `facts` meet dream `d`. */
export const met = (d: Dream, f: Facts): boolean => (d.city ? d.city === f.city : f[d.fact!] >= d.n!);

export type Ticked = { id: string; t: number; city: string };

export class Bucket {
  /** The ids of the dreams on his list. */
  list: string[] = [];
  /** The ones he ticked off, oldest first. */
  done: Ticked[] = [];

  dreams(): Dream[] {
    return this.list.map((id) => dreamOf(id)!);
  }

  /** Ticks off the dreams on his list that `f` meets at `t`; returns them. */
  tick(f: Facts, t: number): Dream[] {
    const hit = this.dreams().filter((d) => met(d, f));
    for (const d of hit) this.done.push({ id: d.id, t, city: f.city });
    this.list = this.list.filter((id) => !hit.some((d) => d.id === id));
    return hit;
  }

  /** Fills his list up to BUCKET_SIZE with dreams he hasn't had or met yet, a sight first when none is on it; returns the new ones. */
  fill(f: Facts, rng: Rng): Dream[] {
    const added: Dream[] = [];
    while (this.list.length < BUCKET_SIZE) {
      const open = DREAMS.filter((d) => !this.list.includes(d.id) && !this.done.some((x) => x.id === d.id) && !met(d, f));
      const sights = open.filter((d) => d.city);
      const from = sights.length && !this.dreams().some((d) => d.city) ? sights : open;
      if (!from.length) break;
      const d = from[Math.floor(rng.randf() * from.length)]!;
      this.list.push(d.id);
      added.push(d);
    }
    return added;
  }

  /** The pull his list puts on his trips (see trips.ts): the cities of its sights. */
  pull(): Pull {
    return { cities: new Set(this.dreams().flatMap((d) => (d.city ? [d.city] : []))), mult: DREAM_PULL, share: DREAM_SHARE };
  }

  toJSON() {
    return { list: this.list, done: this.done };
  }

  /** Old saves have an empty list (it fills on his next new day, see Stats.newDay); unknown dreams are dropped. */
  static fromJSON(d: unknown): Bucket {
    const out = new Bucket();
    const v = d as { list?: unknown; done?: unknown } | null;
    if (Array.isArray(v?.list)) out.list = [...new Set(v.list.filter((id): id is string => typeof id === "string" && !!dreamOf(id)))].slice(0, BUCKET_SIZE);
    if (Array.isArray(v?.done))
      out.done = (v.done as Ticked[]).filter((x) => x && dreamOf(x.id)).map((x) => ({ id: x.id, t: Number(x.t) || 0, city: typeof x.city === "string" ? x.city : "" }));
    out.list = out.list.filter((id) => !out.done.some((x) => x.id === id));
    return out;
  }
}

/** A dream's text to go mid-sentence: "see the Eiffel Tower". */
export const lower = (d: Dream): string => d.text[0]!.toLowerCase() + d.text.slice(1);
