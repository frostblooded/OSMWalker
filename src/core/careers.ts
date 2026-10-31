// Careers (The Sims' careers): his paid shifts at one kind of place rank him
// up in that career, from Dishwasher to Café owner. Each rank pays more there
// (in place of the old pay rise per level) and brings its own better-paid
// shift at those places, in place of the last rank's. He climbs by himself:
// jobs in his best career weigh CAREER_PULL times as much when he picks what
// to do there, and his ranks go with him to every country. Pure; Stats owns
// one, Activities adds the career shifts to the places.
import type { Action } from "./stats";
import { SHIFT_MIN } from "./workCards";

/** Shifts in a career he needs in all to reach each rank, from rank 1 (index 0) up. */
export const SHIFTS_TO = [0, 1, 12, 70, 180] as const;
export const TOP_RANK = SHIFTS_TO.length;
/** A career's jobs pay this share more for every rank above 1. */
export const WAGE_PER_RANK = 0.1;
/** Jobs in his best career weigh this many times as much when he picks what to do. */
export const CAREER_PULL = 1.5;
/** A rank's own shift pays the career's base wage times this, from rank 2 (index 0) up. */
export const RANK_PAY = [1.25, 1.5, 1.8, 2.2] as const;

/** A paid action long enough to count as a shift: not a bet, a gamble or a lucky find. */
export const isShift = (a: Action) => a.earn !== undefined && a.min >= SHIFT_MIN && !a.risk;

/**
 * A career: the action keys of the places it covers (as in data/actions.json),
 * its five rank titles, the base wage its rank shifts are priced from, and the
 * name of each rank's own shift (ranks 2 to 5). tests/unit/careers.test.ts
 * checks each key still has a shift in data/actions.json.
 */
export type Career = { id: string; name: string; icon: string; at: readonly string[]; ranks: readonly string[]; base: number; shifts: readonly string[] };

export const CAREERS: readonly Career[] = [
  {
    id: "cafe", name: "Café", icon: "☕", at: ["cafe", "bakery"], base: 25,
    ranks: ["Dishwasher", "Barista", "Head barista", "Café manager", "Café owner"],
    shifts: ["Pull espressos behind the counter", "Run the morning rush", "Manage the café for the day", "Roast the beans for his own blend"],
  },
  {
    id: "kitchen", name: "Kitchen", icon: "🍳", at: ["restaurant", "fast_food", "butcher"], base: 30,
    ranks: ["Pot washer", "Prep cook", "Line cook", "Head chef", "Restaurateur"],
    shifts: ["Prep the vegetables for service", "Cook on the line through dinner", "Run the kitchen as head chef", "Plan the new menu"],
  },
  {
    id: "bar", name: "Bar", icon: "🍸", at: ["bar", "bar/nightclub"], base: 40,
    ranks: ["Glass collector", "Barback", "Bartender", "Head bartender", "Bar manager"],
    shifts: ["Restock the bar all night", "Mix cocktails for the crowd", "Run the bar as head bartender", "Manage the bar for the night"],
  },
  {
    id: "hotel", name: "Hotel", icon: "🛎", at: ["lodging"], base: 45,
    ranks: ["Night porter", "Receptionist", "Concierge", "Duty manager", "Hotel manager"],
    shifts: ["Check guests in at the front desk", "Book tables and tours as concierge", "Run the night as duty manager", "Run the hotel for the day"],
  },
  {
    id: "shop", name: "Shop", icon: "🛒", at: ["shop", "grocery", "shop/hardware", "shop/doityourself", "shop/florist", "shop/pet", "hairdresser", "office/estate_agent"], base: 30,
    ranks: ["Shelf stacker", "Cashier", "Shift lead", "Store manager", "Area manager"],
    shifts: ["Work the till", "Lead the late shift", "Manage the store for the day", "Visit the stores as area manager"],
  },
  {
    id: "culture", name: "Culture", icon: "🎭", at: ["museum", "art_gallery", "attraction", "theatre", "park", "garden", "railway"], base: 30,
    ranks: ["Busker", "Stagehand", "Tour guide", "Curator", "Artistic director"],
    shifts: ["Set up the stage for a show", "Lead a tour for visitors", "Curate a small exhibition", "Plan the season's programme"],
  },
  {
    id: "office", name: "Office", icon: "💼", at: ["office", "office/employment_agency", "office/coworking", "college", "school", "library", "post", "notice_board"], base: 35,
    ranks: ["Temp", "Clerk", "Analyst", "Team lead", "Director"],
    shifts: ["File the day's paperwork", "Crunch the numbers for a report", "Lead the team meeting", "Sign off the quarter as director"],
  },
  {
    id: "sport", name: "Sport", icon: "⚽", at: ["swimming", "swimming_pool", "golf", "pitch", "stadium", "dog_park", "zoo"], base: 30,
    ranks: ["Kit carrier", "Attendant", "Coach", "Head coach", "Club manager"],
    shifts: ["Look after the grounds", "Coach a training session", "Run the squad as head coach", "Manage the club for the day"],
  },
  {
    id: "transport", name: "Transport", icon: "🔧", at: ["bicycle", "parking", "fuel", "car", "car/car", "harbor", "ferry_terminal"], base: 30,
    ranks: ["Car washer", "Dock hand", "Mechanic", "Foreman", "Depot manager"],
    shifts: ["Load the trucks at the depot", "Fix engines in the workshop", "Run the yard as foreman", "Manage the depot for the day"],
  },
];

const BY_ID = new Map(CAREERS.map((c) => [c.id, c]));
const BY_KEY = new Map(CAREERS.flatMap((c) => c.at.map((k) => [k, c] as const)));

export const careerOf = (id: string) => BY_ID.get(id);
/** The career of the places under action key `key`, if any. */
export const careerAt = (key: string) => BY_KEY.get(key);

/** The rank (1 to TOP_RANK) `shifts` shifts in a career earn. */
export function rankFor(shifts: number): number {
  let r = 1;
  while (r < TOP_RANK && shifts >= SHIFTS_TO[r]!) r++;
  return r;
}

/** The shift of rank `rank` (2 or more) in career `c`: paid RANK_PAY of its base wage, done only at that rank. */
export function rankShift(c: Career, rank: number): Action {
  const pay = Math.round(c.base * RANK_PAY[rank - 2]!);
  return { name: c.shifts[rank - 2]!, min: 120, earn: pay, fx: { energy: -20, xp: 20 + 5 * rank }, needs: { rank }, career: c.id };
}

/** His shifts in each career he has worked in, by career id. */
export class Careers {
  shifts: Record<string, number> = {};

  rank(id: string): number {
    return rankFor(this.shifts[id] ?? 0);
  }

  /** Counts a shift in career `id`; returns the new rank if it promoted him, else 0. */
  shift(id: string): number {
    const was = this.rank(id);
    this.shifts[id] = (this.shifts[id] ?? 0) + 1;
    const now = this.rank(id);
    return now > was ? now : 0;
  }

  /** Where he stands in career `c`: his rank and title, and, below the top, the shifts left to the next rank and his share of the way there. */
  standing(c: Career): { rank: number; title: string; left: number; share: number } {
    const n = this.shifts[c.id] ?? 0;
    const rank = rankFor(n);
    const title = c.ranks[rank - 1]!;
    if (rank === TOP_RANK) return { rank, title, left: 0, share: 1 };
    const from = SHIFTS_TO[rank - 1]!;
    const to = SHIFTS_TO[rank]!;
    return { rank, title, left: to - n, share: (n - from) / (to - from) };
  }

  /** The careers he has worked in, most shifts first. */
  worked(): Career[] {
    return CAREERS.filter((c) => this.shifts[c.id]).sort((a, b) => this.shifts[b.id]! - this.shifts[a.id]!);
  }

  /** The career he is furthest along in (most shifts, the first listed on a tie), or "" before his first shift. */
  best(): string {
    let best = "";
    for (const c of CAREERS) if ((this.shifts[c.id] ?? 0) > (this.shifts[best] ?? 0)) best = c.id;
    return best;
  }

  toJSON() {
    return { shifts: this.shifts };
  }

  static fromJSON(d?: { shifts?: Record<string, number> }): Careers {
    const c = new Careers();
    c.shifts = { ...d?.shifts };
    return c;
  }
}

/** "fast_food" or "shop/florist" as Help names it: "fast food", "florist". */
const placeName = (key: string) => key.split("/").at(-1)!.replace(/_/g, " ");

/** One Help line per career: where he works in it and its ranks. */
export const helpList = () => CAREERS.map((c) => `- ${c.icon} ${c.name} (${[...new Set(c.at.map(placeName))].join(", ")}): ${c.ranks.join(", ")}`).join("\n");
