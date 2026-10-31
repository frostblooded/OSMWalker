// Quirks from habits (Dwarf Fortress's dwarves): counts of where he does
// things turn into named traits. Twenty bakeries make him a Croissant snob,
// ten museums or galleries a Culture vulture. A quirk makes its places pull
// his goal QUIRK_PULL times as hard and cheers him a little each time he is
// at one. He holds at most MAX_QUIRKS; a new one pushes the oldest out, and
// a quirk that faded never comes back. Pure; Stats owns one.

export const MAX_QUIRKS = 5;
export const QUIRK_PULL = 1.5;
/** The moodlet a quirk gives at its places: mood an hour, for how many hours. */
export const QUIRK_MOOD: [number, number] = [1, 1];
/** The place kind fainting counts as. */
export const FAINT = "_faint";

/** A quirk: what earns it (doing things at map classes `at`, `count` times in all) and the moodlet it gives there. */
export type Quirk = { id: string; name: string; icon: string; at: string[]; count: number; treat: string };

export const QUIRKS: Quirk[] = [
  { id: "croissant", name: "Croissant snob", icon: "🥐", at: ["bakery"], count: 20, treat: "A proper croissant" },
  { id: "coffee", name: "Coffee nerd", icon: "☕", at: ["cafe"], count: 25, treat: "A decent cup" },
  { id: "culture", name: "Culture vulture", icon: "🎭", at: ["museum", "art_gallery", "theatre"], count: 10, treat: "Some culture" },
  { id: "owl", name: "Night owl", icon: "🦉", at: ["bar", "beer"], count: 20, treat: "His kind of crowd" },
  { id: "bookworm", name: "Bookworm", icon: "📚", at: ["library"], count: 10, treat: "Quiet pages" },
  { id: "nature", name: "Nature lover", icon: "🌳", at: ["park", "garden"], count: 20, treat: "Green all round" },
  { id: "foodie", name: "Foodie", icon: "🍝", at: ["restaurant"], count: 20, treat: "A good plate" },
  { id: "sweet", name: "Sweet tooth", icon: "🍦", at: ["ice_cream"], count: 12, treat: "Something sweet" },
  { id: "gym", name: "Gym rat", icon: "🏋", at: ["fitness_centre", "sports_centre", "swimming_pool"], count: 10, treat: "A good sweat" },
  { id: "pious", name: "Pious soul", icon: "⛪", at: ["place_of_worship"], count: 10, treat: "A quiet prayer" },
  { id: "shopper", name: "Shopaholic", icon: "🛍", at: ["clothing_store", "shop"], count: 20, treat: "Retail therapy" },
  { id: "hospital", name: "Hospital regular", icon: "🏥", at: [FAINT], count: 5, treat: "The nurses know him" },
];

export const quirk = (id: string) => QUIRKS.find((q) => q.id === id);

export class Quirks {
  /** Times he did something at each map class (and FAINT). */
  counts: Record<string, number> = {};
  /** The quirks he has, oldest first, and the ones that faded. */
  have: string[] = [];
  faded: string[] = [];

  /**
   * One more time at a place of map class `kind`: the quirks he has there
   * (for their moodlet), a quirk this earns, if any, and the oldest one it
   * pushes out.
   */
  count(kind: string): { here: Quirk[]; gained: Quirk | null; lost: Quirk | null } {
    this.counts[kind] = (this.counts[kind] ?? 0) + 1;
    const here = this.have.map(quirk).filter((q): q is Quirk => !!q && q.at.includes(kind));
    const gained = QUIRKS.find((q) => q.at.includes(kind) && !this.have.includes(q.id) && !this.faded.includes(q.id) && q.at.reduce((n, k) => n + (this.counts[k] ?? 0), 0) >= q.count) ?? null;
    let lost: Quirk | null = null;
    if (gained) {
      this.have.push(gained.id);
      if (this.have.length > MAX_QUIRKS) {
        const old = this.have.shift()!;
        this.faded.push(old);
        lost = quirk(old) ?? null;
      }
    }
    return { here, gained, lost };
  }

  /** How hard a place of map class `kind` pulls his goal: QUIRK_PULL for each of his quirks there. */
  pull(kind: string): number {
    let w = 1;
    for (const id of this.have) if (quirk(id)?.at.includes(kind)) w *= QUIRK_PULL;
    return w;
  }

  toJSON() {
    return { counts: this.counts, have: this.have, faded: this.faded };
  }

  static fromJSON(d?: Partial<ReturnType<Quirks["toJSON"]>>): Quirks {
    const q = new Quirks();
    q.counts = { ...(d?.counts ?? {}) };
    q.have = [...(d?.have ?? [])];
    q.faded = [...(d?.faded ?? [])];
    return q;
  }
}
