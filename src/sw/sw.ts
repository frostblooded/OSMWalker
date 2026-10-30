// The service worker: keeps the game and the map tiles it has shown, so a
// returning player starts without waiting on the network and can play offline.
/// <reference lib="webworker" />
import { APP_ASSETS_MAX, MAP_CACHE_MAX, overflow, replaced, strategyFor, versioned } from "./strategy";

declare const self: ServiceWorkerGlobalScope;
const VERSION = "v1";
const CACHES = { app: `osmwalker-app-${VERSION}`, map: `osmwalker-map-${VERSION}` };
/** The page waits this long for the network before showing what is cached. */
const PAGE_TIMEOUT_MS = 3000;
let puts = 0;

self.addEventListener("install", () => void self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keep = new Set(Object.values(CACHES));
      for (const k of await caches.keys()) if (k.startsWith("osmwalker-") && !keep.has(k)) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

// The page loaded before the worker started, so it sends what it fetched; the worker keeps the ones it would cache.
self.addEventListener("message", (e) => {
  const urls = (e.data as { cache?: string[] } | null)?.cache;
  if (!Array.isArray(urls)) return;
  e.waitUntil(
    Promise.all(
      urls.map(async (u) => {
        const s = strategyFor(new URL(u), self.registration.scope, u === self.registration.scope ? "navigate" : "cors");
        if (!s || (await caches.match(u, { cacheName: CACHES[s.cache], ignoreVary: true }))) return;
        await store(CACHES[s.cache], new Request(u), await fetch(u).catch(() => Response.error()));
      }),
    ),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const s = strategyFor(new URL(req.url), self.registration.scope, req.mode);
  if (!s) return;
  const name = CACHES[s.cache];
  if (s.kind === "cache-first") e.respondWith(cacheFirst(req, name));
  else if (s.kind === "network-first") e.respondWith(networkFirst(req, name));
  else e.respondWith(staleWhileRevalidate(req, name, e));
});

async function store(name: string, req: Request, res: Response): Promise<void> {
  if (!res.ok) return;
  const cache = await caches.open(name);
  await cache.put(req, res);
  const assets = `${self.registration.scope}assets/`;
  if (req.url.startsWith(`${self.registration.scope}data/`) && versioned(new URL(req.url))) {
    for (const k of replaced((await cache.keys()).map((k) => k.url), req.url)) await cache.delete(k);
  }
  if (name === CACHES.map ? ++puts % 100 === 0 : req.url.startsWith(assets)) {
    const keys = (await cache.keys()).map((k) => k.url);
    const old = name === CACHES.map ? overflow(keys, MAP_CACHE_MAX, () => true) : overflow(keys, APP_ASSETS_MAX, (u) => u.startsWith(assets));
    for (const k of old) await cache.delete(k);
  }
}

async function cacheFirst(req: Request, name: string): Promise<Response> {
  const hit = await caches.match(req, { cacheName: name, ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  await store(name, req, res.clone());
  return res;
}

async function networkFirst(req: Request, name: string): Promise<Response> {
  const net = fetch(req).then(async (res) => {
    await store(name, req, res.clone());
    return res;
  });
  const late = new Promise<null>((ok) => setTimeout(() => ok(null), PAGE_TIMEOUT_MS));
  try {
    const first = await Promise.race([net, late]);
    if (first) return first;
  } catch {
    // offline: fall through to the cache
  }
  return (await caches.match(req, { cacheName: name, ignoreSearch: true, ignoreVary: true })) ?? net;
}

async function staleWhileRevalidate(req: Request, name: string, e: FetchEvent): Promise<Response> {
  const hit = await caches.match(req, { cacheName: name, ignoreVary: true });
  const net = fetch(req).then(async (res) => {
    await store(name, req, res.clone());
    return res;
  });
  if (hit) {
    e.waitUntil(net.catch(() => undefined));
    return hit;
  }
  return net;
}
