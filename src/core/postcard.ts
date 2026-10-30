// Postcards to friends: a snapshot of where he is (city, place, level and
// what he just did) packed into a link, so no server is needed. The data
// rides in the link's #fragment, which browsers never send anywhere; the
// friend's game reads it on open and shows the card. Everything read from a
// link is checked and cut to size, since anyone can write one.

/** The part of the link after "#" that holds a postcard. */
export const POSTCARD_KEY = "postcard=";
/** Longest a sender's name may be, in characters. */
export const NAME_MAX = 24;
/** Longest any other text on a card may be, in characters. */
export const TEXT_MAX = 120;

export type Postcard = {
  /** Who sent it; "" when they gave no name. */
  from: string;
  /** "Kyoto, Japan". */
  city: string;
  /** The place or street he is at. */
  place: string;
  level: number;
  /** What he just did. */
  line: string;
};

const cut = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** A card from anything: unknown fields dropped, text trimmed and cut, numbers checked. Null without a city. */
export function clean(d: unknown): Postcard | null {
  if (!d || typeof d !== "object") return null;
  const o = d as Record<string, unknown>;
  const city = cut(o.city, TEXT_MAX);
  if (!city) return null;
  const level = typeof o.level === "number" && Number.isFinite(o.level) ? Math.min(Math.max(Math.floor(o.level), 1), 9999) : 1;
  return { from: cut(o.from, NAME_MAX), city, place: cut(o.place, TEXT_MAX), level, line: cut(o.line, TEXT_MAX) };
}

/** The link's fragment for `card`, base64url of its JSON (UTF-8). */
export function encode(card: Postcard): string {
  const bytes = new TextEncoder().encode(JSON.stringify(clean(card)));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return POSTCARD_KEY + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The card in a link's fragment ("#postcard=…" or without "#"), or null when there is none or it is broken. */
export function decode(hash: string): Postcard | null {
  const h = hash.replace(/^#/, "");
  if (!h.startsWith(POSTCARD_KEY)) return null;
  try {
    const bin = atob(h.slice(POSTCARD_KEY.length).replace(/-/g, "+").replace(/_/g, "/"));
    return clean(JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))));
  } catch {
    return null;
  }
}

/** "A postcard from Ivan in Kyoto". */
export function title(card: Postcard): string {
  return `A postcard from ${card.from || "a friend"} in ${card.city.split(",")[0]}`;
}
