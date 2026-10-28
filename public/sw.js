// REPS service worker. The app keeps its own offline data in IndexedDB, so this only makes the
// shell loadable offline. Rules: pages network-first, hashed static assets cache-first, API never cached,
// and every request resolves to a real Response (an offline page at worst), never a network error.
const CACHE = "reps-shell-v3";
const SHELL = ["/", "/calendar", "/challenges", "/leaderboard", "/profile", "/settings", "/activity"];

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · REPS</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#10120f;color:#f5f7f0;text-align:center;padding:24px}
b{font-size:2rem;display:block;margin-bottom:8px}p{color:#aab19f;max-width:30ch;margin:0 auto 20px}button{font:inherit;font-weight:800;border:0;border-radius:14px;padding:14px 22px;background:#d7ff3f;color:#15190c}</style></head>
<body><div><b>You’re offline</b><p>Your sets are safe on this device and will sync when you reconnect.</p><button onclick="location.reload()">Try again</button></div></body></html>`;
const offlinePage = () => new Response(OFFLINE_HTML, { status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

/** Browsers refuse redirected responses for navigations, so store a clean copy. */
async function storable(response) {
  if (!response.redirected) return response;
  return new Response(await response.blob(), { status: response.status, statusText: response.statusText, headers: response.headers });
}

async function precache() {
  const cache = await caches.open(CACHE);
  // One failing page must not abort the install (and leave an old worker in charge).
  await Promise.all(SHELL.map(async (path) => {
    try { const r = await fetch(path, { credentials: "same-origin" }); if (r.ok && !r.url.includes("/login")) await cache.put(path, await storable(r)); } catch {}
  }));
}

self.addEventListener("install", (e) => { e.waitUntil(precache()); self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // Live data and auth always go to the network; the app handles offline itself.
  if (url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/icon/")) return;

  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok && !res.redirected) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(url.pathname, copy)).catch(() => {}); }
        return res;
      } catch {
        const cache = await caches.open(CACHE);
        // Only app tabs may fall back to the cached app shell; other pages (badges, invites) get the offline screen.
        const appTab = SHELL.includes(url.pathname) || url.pathname === "/onboarding";
        return (await cache.match(url.pathname)) || (appTab && (await cache.match("/"))) || offlinePage();
      }
    })());
    return;
  }

  // Hashed build assets never change: cache-first. Everything else: network, falling back to cache.
  const immutable = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/api/icon/");
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (immutable) { const hit = await cache.match(req); if (hit) return hit; }
    try {
      const res = await fetch(req);
      if (res.ok && (immutable || url.pathname === "/manifest.webmanifest")) cache.put(req, res.clone()).catch(() => {});
      return res;
    } catch {
      return (await cache.match(req)) || new Response("", { status: 504, statusText: "Offline" });
    }
  })());
});
