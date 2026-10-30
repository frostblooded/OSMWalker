// Portals: very rarely an old monument or castle ruin he reaches opens like
// a door, and he steps through to a real city he has never been to, anywhere
// in the world. Free and at once, at most once every PORTAL_GAP_DAYS, the
// same watched and away (Stats.portalAt).
import type { Place } from "./stats";

/** The odds a portal place opens when he reaches it, once the last portal is PORTAL_GAP_DAYS behind him. */
export const PORTAL_CHANCE = 0.2;
export const PORTAL_GAP_DAYS = 7;
const DAY_S = 86_400;

/** A real monument or castle ruin; made-up places hold no portal. */
export const isPortalPlace = (p: Pick<Place, "class" | "subclass"> & { made?: unknown }) => !p.made && (p.class === "monument" || (p.class === "castle" && p.subclass === "ruins"));

/** The portals he went through: when the last one was (unix seconds, 0 for never) and the cities they took him to. */
export class Portals {
  last = 0;
  went: string[] = [];

  /** True when a portal place he reaches at `now` opens for dice `r`. */
  opens(now: number, r: number): boolean {
    return (this.last === 0 || now - this.last >= PORTAL_GAP_DAYS * DAY_S) && r < PORTAL_CHANCE;
  }

  /** He went through one at `now` to `city`. */
  note(now: number, city: string): void {
    this.last = now;
    this.went.push(city);
  }

  toJSON() {
    return { last: this.last, went: this.went };
  }

  static fromJSON(d?: Partial<ReturnType<Portals["toJSON"]>>): Portals {
    const p = new Portals();
    p.last = d?.last ?? 0;
    p.went = [...(d?.went ?? [])];
    return p;
  }
}
