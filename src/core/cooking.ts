// Cooking (Stardew's cooking): bakeries, butchers and grocers sell him
// ingredients, which go in a pantry corner of his bag (PANTRY_MAX of them).
// At his hostel, a park or a campsite he cooks the best recipe his cooking
// level knows and his pantry holds: bread + cheese + tomato is a picnic, more
// filling than each alone. All by himself. Pure; Stats owns a Pantry.
import type { Fx } from "./stats";

export const INGREDIENTS = ["bread", "cheese", "tomato", "eggs", "pasta", "meat", "veg", "fruit"] as const;
export type Ingredient = (typeof INGREDIENTS)[number];

/** Most ingredients he carries; with that many, he buys no more. */
export const PANTRY_MAX = 6;

export const INGREDIENT: Record<Ingredient, [icon: string, name: string]> = {
  bread: ["🍞", "bread"],
  cheese: ["🧀", "cheese"],
  tomato: ["🍅", "tomatoes"],
  eggs: ["🥚", "eggs"],
  pasta: ["🌾", "pasta"],
  meat: ["🥩", "meat"],
  veg: ["🥕", "vegetables"],
  fruit: ["🍎", "fruit"],
};

export type Recipe = { id: string; name: string; icon: string; uses: Ingredient[]; level: number; fx: Fx };

/** What he can cook, from the cooking level each needs. A picnic fills more than its three parts eaten alone. */
export const RECIPES: Recipe[] = [
  { id: "fruit", name: "fruit salad", icon: "🍓", uses: ["fruit"], level: 0, fx: { fullness: 15, thirst: 10, health: 5 } },
  { id: "sandwich", name: "cheese sandwich", icon: "🥪", uses: ["bread", "cheese"], level: 0, fx: { fullness: 30, mood: 5 } },
  { id: "picnic", name: "picnic", icon: "🧺", uses: ["bread", "cheese", "tomato"], level: 0, fx: { fullness: 45, mood: 15 } },
  { id: "omelette", name: "omelette", icon: "🍳", uses: ["eggs", "cheese"], level: 1, fx: { fullness: 35, health: 5 } },
  { id: "pasta", name: "pasta al pomodoro", icon: "🍝", uses: ["pasta", "tomato"], level: 2, fx: { fullness: 45, mood: 10 } },
  { id: "soup", name: "vegetable soup", icon: "🥣", uses: ["veg", "bread"], level: 3, fx: { fullness: 40, thirst: 15, health: 10 } },
  { id: "fryup", name: "sausage and eggs", icon: "🌭", uses: ["meat", "eggs"], level: 4, fx: { fullness: 50, str: 0.1 } },
  { id: "stew", name: "hearty stew", icon: "🍲", uses: ["meat", "veg", "tomato"], level: 6, fx: { fullness: 70, health: 10, mood: 15 } },
  { id: "witch", name: "hedge-witch stew", icon: "🧙", uses: ["meat", "veg", "eggs"], level: 9, fx: { fullness: 70, mood: 20, magic: 10 } },
];

const fill = (r: Recipe) => r.fx.fullness ?? 0;

export class Pantry {
  items: Ingredient[] = [];
  /** Meals he has cooked in all. */
  cooked = 0;
  /** The recipes he has cooked at least once, by id, for the Collection. */
  dishes: string[] = [];

  full(): boolean {
    return this.items.length >= PANTRY_MAX;
  }

  has(r: Recipe): boolean {
    const left = [...this.items];
    for (const i of r.uses) {
      const at = left.indexOf(i);
      if (at < 0) return false;
      left.splice(at, 1);
    }
    return true;
  }

  /** The most filling recipe his cooking `level` knows and the pantry holds, or null. */
  best(level: number): Recipe | null {
    let out: Recipe | null = null;
    for (const r of RECIPES) if (r.level <= level && this.has(r) && (!out || fill(r) > fill(out))) out = r;
    return out;
  }

  /** Uses up `r`'s ingredients, and counts it cooked. */
  use(r: Recipe): void {
    for (const i of r.uses) this.items.splice(this.items.indexOf(i), 1);
    this.cooked++;
    if (!this.dishes.includes(r.id)) this.dishes.push(r.id);
  }

  /**
   * Which of `sold` he buys: one that a recipe his `level` knows lacks
   * (fewest missing first, then most filling). Null when he can already
   * cook something, the pantry has no room, or nothing sold here helps.
   */
  pick(sold: readonly Ingredient[], level: number): Ingredient | null {
    if (this.full() || this.best(level)) return null;
    let best: { i: Ingredient; missing: number; fill: number } | null = null;
    for (const r of RECIPES) {
      if (r.level > level) continue;
      const left = [...this.items];
      const lack = r.uses.filter((i) => {
        const at = left.indexOf(i);
        if (at < 0) return true;
        left.splice(at, 1);
        return false;
      });
      const i = lack.find((x) => sold.includes(x));
      if (!i || lack.length > PANTRY_MAX - this.items.length) continue;
      if (!best || lack.length < best.missing || (lack.length === best.missing && fill(r) > best.fill)) best = { i, missing: lack.length, fill: fill(r) };
    }
    return best?.i ?? null;
  }

  toJSON() {
    return { items: this.items, cooked: this.cooked, dishes: this.dishes };
  }

  /** Old saves have an empty pantry and no dishes; unknown ingredients and recipes are dropped. */
  static fromJSON(d: unknown): Pantry {
    const out = new Pantry();
    const v = d as { items?: unknown; cooked?: unknown; dishes?: unknown } | null;
    if (Array.isArray(v?.dishes)) out.dishes = v.dishes.filter((id) => RECIPES.some((r) => r.id === id));
    const items = v?.items;
    out.cooked = Math.max(Number(v?.cooked) || 0, 0);
    if (Array.isArray(items)) out.items = items.filter((i): i is Ingredient => (INGREDIENTS as readonly string[]).includes(i)).slice(0, PANTRY_MAX);
    return out;
  }
}

/** "bread, cheese and tomatoes". */
export const listOf = (uses: readonly Ingredient[]) => {
  const names = uses.map((i) => INGREDIENT[i][1]);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "");
};
