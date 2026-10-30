// Offline support (#15, US6.3): after one visit, My Papers keeps working on weak or
// no Wi-Fi. A classic (non-module) service worker. Framework doesn't build it (it's
// not referenced by any page, and Framework would wrap an exported module in an ES
// module stub); `npm run build` copies it verbatim to dist/sw.js, the app root, so its
// scope covers index.html and my-papers.html. All paths are relative to that scope
// (the site lives in a subfolder).
//
// - Pages and other unhashed files: network-first, so a new deploy shows up as soon
//   as we're online; the cached copy is used offline or when the network is too slow.
// - Framework's hashed build assets (_file/, _import/, _node/, _npm/, _observablehq/):
//   cache-first, they're immutable by hash.
// - Other origins (the Transformers.js model and WASM, Google Fonts): not touched.
//
// The pure helpers at the top are tested in test/sw.test.js (loaded with node:vm).

/* global ServiceWorkerGlobalScope */
const VERSION = "v1";
const CACHE_PREFIX = "papersNavigator-";
const ASSET_DIRS = [
  "_file",
  "_import",
  "_node",
  "_npm",
  "_observablehq",
  "_duckdb",
];
const PRECACHE_PAGES = ["./", "./my-papers.html"];
const NETWORK_TIMEOUT_MS = 4000;

/** "cache-first" | "network-first" | "none" (let the browser handle it). */
function strategyFor(url, scope, method = "GET") {
  if (method !== "GET") return "none";
  const target = new URL(url);
  const base = new URL(scope);
  if (target.origin !== base.origin) return "none";
  if (!target.pathname.startsWith(base.pathname)) return "none";
  const parts = target.pathname.slice(base.pathname.length).split("/");
  if (
    parts.length > 1 &&
    ASSET_DIRS.includes(parts[0]) &&
    isHashed(parts.at(-1))
  )
    return "cache-first";
  return "network-first";
}

/** Framework's build names: "papers.943aaa37.json", "index.0a13f7dc.js", "b8e751b6.js". */
function isHashed(fileName) {
  return /(^|\.)[0-9a-f]{8}\.[a-z0-9]+$/i.test(fileName);
}

/** Cache key for a page: no query (?now=…) and "/" and "/index.html" are the same page. */
function pageKey(url) {
  const key = new URL(url);
  key.search = "";
  key.hash = "";
  if (key.pathname.endsWith("/")) key.pathname += "index.html";
  return key.href;
}

/** Hashed same-scope assets a built page references (preloads, stylesheets, FileAttachments). */
function assetRefs(html, pageUrl, scope) {
  const refs = new Set();
  for (const match of html.matchAll(
    /(?:href|src)="(\.\/_[^"]+)"|"path":"(\.\/_[^"]+)"/g,
  )) {
    const url = new URL(match[1] ?? match[2], pageUrl).href;
    if (strategyFor(url, scope) === "cache-first") refs.add(url);
  }
  return [...refs];
}

/** One cache per conference (scope): conferences share the origin, never each other's caches. */
function cacheName(scope) {
  return `${CACHE_PREFIX}${VERSION}:${scope}`;
}

function isStaleCache(name, scope) {
  return (
    name.startsWith(CACHE_PREFIX) &&
    name.endsWith(`:${scope}`) &&
    name !== cacheName(scope)
  );
}

if (
  typeof ServiceWorkerGlobalScope !== "undefined" &&
  self instanceof ServiceWorkerGlobalScope
) {
  const scope = self.registration.scope;
  const CACHE = cacheName(scope);

  // Precache both pages and everything they reference, so My Papers works offline
  // even if only Explore was visited.
  const precachePage = async (cache, path) => {
    const url = new URL(path, scope).href;
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok || response.redirected) return;
    const html = await response.clone().text();
    await cache.put(pageKey(url), response);
    await Promise.all(
      assetRefs(html, url, scope).map(async (ref) => {
        if (!(await cache.match(ref))) await cache.add(ref).catch(() => {});
      }),
    );
  };

  self.addEventListener("install", (event) => {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE);
        await Promise.all(
          PRECACHE_PAGES.map((path) =>
            precachePage(cache, path).catch(() => {}),
          ),
        );
        await self.skipWaiting();
      })(),
    );
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      (async () => {
        const names = await caches.keys();
        await Promise.all(
          names
            .filter((name) => isStaleCache(name, scope))
            .map((name) => caches.delete(name)),
        );
        await self.clients.claim();
      })(),
    );
  });

  const cacheFirst = async (request) => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  };

  const networkFirst = async (event) => {
    const { request } = event;
    const cache = await caches.open(CACHE);
    const key = pageKey(request.url);
    const network = fetch(request).then(async (response) => {
      if (response.ok && !response.redirected)
        await cache.put(key, response.clone());
      return response;
    });
    event.waitUntil(network.catch(() => {}));
    const cached = await cache.match(key);
    if (!cached) return network;
    // Weak Wi-Fi: give the network a few seconds, then show the cached copy
    // (the cache still gets the fresh copy when it arrives).
    const timeout = new Promise((resolve) =>
      setTimeout(() => resolve(cached), NETWORK_TIMEOUT_MS),
    );
    return Promise.race([network.catch(() => cached), timeout]);
  };

  self.addEventListener("fetch", (event) => {
    const strategy = strategyFor(
      event.request.url,
      scope,
      event.request.method,
    );
    if (strategy === "cache-first")
      event.respondWith(cacheFirst(event.request));
    else if (strategy === "network-first")
      event.respondWith(networkFirst(event));
  });
}
