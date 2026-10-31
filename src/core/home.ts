// His home (The Sims' houses): once a city knows him as a Regular (see
// fame.ts), he rents a flat there, near his spot. The rent comes with his
// weekly bills. Once he has the price to spare past what he saves up for,
// he buys it, and the rent stops. In a home he owns he puts up one thing
// from his travels a day, and each makes the place more his. A share of his
// trips take him home, and a night in a hostel or hotel in his home city is
// a night in his own bed instead: free, and it cheers him, the more so the
// more things are up. He retires there too.
// Pure; Stats owns one.
import type { Item } from "./items";
import { distanceM } from "./geo";
import { SAME_CITY_M, type LatLon } from "./trips";

/** The fame tier (see fame.ts) a city must know him at before he rents there: Regular. */
export const RENT_TIER = 2;
/** Rent a week, in cents, plus RENT_PER_LEVEL for each level above 1. */
export const RENT_CENTS = 4000;
export const RENT_PER_LEVEL = 100;
/** What buying it costs, in cents. */
export const HOME_PRICE = 500_000;
/** Things from his travels he can put up at home. */
export const HOME_THINGS = 10;
/** A night at home adds HOME_MOOD mood, plus HOME_MOOD_PER_THING for each thing up. */
export const HOME_MOOD = 5;
export const HOME_MOOD_PER_THING = 1;
/** Share of his trips from elsewhere that go home. */
export const HOME_TRIP = 0.25;

export class Home {
  /** "Sofia, Bulgaria", or "" before he has one. */
  city = "";
  code = "";
  /** Where the flat is on the map. */
  at: LatLon = [0, 0];
  /** Unix seconds he moved in, and bought it (0 while renting). */
  since = 0;
  bought = 0;
  /** What he put up, oldest first. */
  things: Item[] = [];

  has(): boolean {
    return !!this.city;
  }

  rent(city: string, code: string, at: LatLon, t: number): void {
    Object.assign(this, { city, code, at, since: t, bought: 0, things: [] });
  }

  /** Rent this week at `level`, or 0 when he has no flat or owns it. */
  rentAt(level: number): number {
    return this.city && !this.bought ? RENT_CENTS + RENT_PER_LEVEL * (level - 1) : 0;
  }

  /** Mood a night at home adds. */
  mood(): number {
    return HOME_MOOD + HOME_MOOD_PER_THING * this.things.length;
  }

  /** True when a city whose middle is `at` is his home's city. By place, not name: the city he set out from is named by the place search ("Sofia, Sofia City, Bulgaria"), a city reached by trip by the city list ("Sofia, Bulgaria"). */
  near(at: LatLon | undefined): boolean {
    return !!this.city && !!at && distanceM(at[0], at[1], this.at[0], this.at[1]) < SAME_CITY_M;
  }

  /** True when a trip roll `r` (0-1) takes him home, away from it (`atHome` false). */
  callsHome(r: number, atHome: boolean): boolean {
    return !!this.city && !atHome && r < HOME_TRIP;
  }

  toJSON() {
    return { city: this.city, code: this.code, at: this.at, since: this.since, bought: this.bought, things: this.things };
  }

  /** Old saves have no home. */
  static fromJSON(d?: Partial<ReturnType<Home["toJSON"]>>): Home {
    return Object.assign(new Home(), d ?? {});
  }
}

/** The thing from his travels he would put up next: the dearest one in `bag` whose story's city (`from`) isn't `local`, that isn't stolen or treasured (`treasured` says), or null. */
export function nextThing(bag: Item[], local: (from: string) => boolean, treasured: (i: Item) => boolean): Item | null {
  let best: Item | null = null;
  for (const it of bag) if (it.story && !local(it.story.from) && !it.stolen && !treasured(it) && (!best || it.price > best.price)) best = it;
  return best;
}
