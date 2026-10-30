// Which cache answers which request, so the game opens offline and the map
// doesn't download the same tiles twice. Live services (search, Overpass,
// Wikidata, routes) always go to the network; streets have their own
// IndexedDB cache in the streets worker.
export type Strategy = { kind: "network-first" | "cache-first" | "stale-while-revalidate"; cache: "app" | "map" } | null;

/** Map tiles, fonts and icons kept at most; the oldest go first. */
export const MAP_CACHE_MAX = 3000;
/** Build files kept at most. Each deploy renames them (about 25 now), so this holds a few builds. */
export const APP_ASSETS_MAX = 80;
const OFM = "tiles.openfreemap.org";

export function strategyFor(url: URL, scope: string, mode: RequestMode): Strategy {
  if (url.host === OFM) {
    // Tile and font addresses carry a version, so what is cached never goes stale.
    if (/^\/planet\/[^/]+\/\d+\/\d+\/\d+\.pbf$/.test(url.pathname) || url.pathname.startsWith("/fonts/")) return { kind: "cache-first", cache: "map" };
    return { kind: "stale-while-revalidate", cache: "map" };
  }
  if (!url.href.startsWith(scope)) return null;
  const path = url.href.slice(scope.length).split(/[?#]/)[0]!;
  if (mode === "navigate" || path === "" || path === "index.html") return { kind: "network-first", cache: "app" };
  if (path.startsWith("assets/")) return { kind: "cache-first", cache: "app" };
  if (path.startsWith("data/")) return { kind: "stale-while-revalidate", cache: "app" };
  return null;
}

/** The oldest of `keys` (cache order) that pass `trimmed`, past the newest `max`: what a trim deletes. */
export function overflow(keys: string[], max: number, trimmed: (url: string) => boolean): string[] {
  const own = keys.filter(trimmed);
  return own.slice(0, Math.max(own.length - max, 0));
}
