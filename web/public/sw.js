// Hawkeye Sterling — service worker
// Provides: offline app shell, fast load via cache, network-first for HTML.
// Strategy:
//   · Static assets (icons, manifest, fonts) → cache-first
//   · HTML / pages                            → network-first, cache fallback
//   · API routes (/api/*, /.netlify/*)        → network-only (never cache)
//   · Auth-sensitive paths                    → network-only

const VERSION = "v3";
const STATIC_CACHE = `hawkeye-static-${VERSION}`;
const PAGES_CACHE = `hawkeye-pages-${VERSION}`;

const STATIC_ASSETS = [
  "/manifest.webmanifest",
  "/icon-192.svg",
  "/icon-512.svg",
  "/icon-maskable.svg",
  "/favicon.ico",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // Best-effort: missing assets shouldn't block install
      await Promise.allSettled(STATIC_ASSETS.map((u) => cache.add(u)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("hawkeye-") && !k.endsWith(VERSION))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

function isApi(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/.netlify/") ||
    url.pathname.startsWith("/auth/")
  );
}

function isStatic(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icon-") ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/manifest.webmanifest" ||
    /\.(png|jpe?g|svg|webp|ico|woff2?|ttf|otf|css|js)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle GET — never cache mutations
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Same-origin only
  if (url.origin !== self.location.origin) return;

  // Never intercept API / auth — always live
  if (isApi(url)) return;

  // Static assets: cache-first, fall back to network
  if (isStatic(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(req, res.clone());
          }
          return res;
        } catch {
          return cached || new Response("", { status: 504 });
        }
      })()
    );
    return;
  }

  // HTML pages: network-first so users always get fresh content,
  // fall back to last-cached version when offline.
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) {
            const cache = await caches.open(PAGES_CACHE);
            cache.put(req, res.clone());
          }
          return res;
        } catch {
          const cached = await caches.match(req);
          if (cached) return cached;
          // Offline shell — try the start URL as a last resort
          const fallback = await caches.match("/screening");
          if (fallback) return fallback;
          return new Response(
            `<!doctype html><html><head><meta charset="utf-8"><title>Offline · Hawkeye</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#0b1320;color:#e8ecf3;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;padding:1rem;text-align:center}h1{font-weight:600;margin-bottom:.5rem}p{color:#8b95a5;max-width:320px}</style></head><body><h1>You're offline</h1><p>Hawkeye Sterling needs a connection for live screening data. Reconnect to continue.</p></body></html>`,
            { status: 503, headers: { "content-type": "text/html; charset=utf-8" } }
          );
        }
      })()
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});
