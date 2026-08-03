// public/sw.js — cache ligero tipo "app shell"
// No cachea llamadas a Supabase para que los datos siempre estén frescos.

const VERSION = "t4c-sw-v6";
const APP_SHELL = [
  "/",
  "/storefront",
  "/index.html",
  "/manifest-ventas.json"
];

// Screens used physically at a stop with no signal (Ventas, Productos,
// Facturas, Visit Notebook) are lazy chunks with a hashed filename that
// changes every deploy — without this, the service worker only ever learns
// a chunk's URL once someone's browser happens to request it, so a screen
// nobody has opened since the latest deploy has nothing to fall back to
// offline. offline-precache.json is generated at build time by
// scripts/generate-offline-manifest.mjs from the real Vite build manifest,
// so this list is never hand-maintained and can't drift from what those
// screens actually need.
async function precacheOfflineCriticalScreens(cache) {
  try {
    const res = await fetch("/offline-precache.json");
    if (!res.ok) return;
    const files = await res.json();
    if (Array.isArray(files) && files.length) {
      await cache.addAll(files);
    }
  } catch {
    // Missing/stale manifest must never block install — the app shell above
    // is still enough to boot, and opportunistic cache-first fills the rest.
  }
}

// Instalar: precache básico + pantallas críticas offline
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then(async (cache) => {
        await cache.addAll(APP_SHELL);
        await precacheOfflineCriticalScreens(cache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activar: limpiar versiones viejas
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== VERSION ? caches.delete(k) : null)))
    ).then(() => self.clients.claim())
  );
});

// Fetch:
// - HTML -> network-first
// - estáticos -> cache-first
// - Supabase/RPC -> SIEMPRE red (no cacheamos datos)
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (!["http:", "https:"].includes(url.protocol)) return;

  // Nunca cachear supabase ni RPC
  if (url.hostname.endsWith("supabase.co")) return;

  const acceptsHTML = request.headers.get("accept")?.includes("text/html");
  const isStatic = /\.(css|js|png|jpg|jpeg|gif|svg|webp|ico|ttf|woff2?)$/i.test(url.pathname)
                || url.pathname === "/manifest-ventas.json"
                || url.pathname === "/manifest.webmanifest";

  if (acceptsHTML) {
    event.respondWith(
      fetch(request).then((res) => {
        if (res.ok && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(request, copy)).catch(() => {});
        }
        return res;
      }).catch(() =>
        caches.match(request).then((res) => res || caches.match("/index.html"))
      )
    );
    return;
  }

  if (isStatic) {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.ok && url.origin === self.location.origin) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
      )
    );
  }
});
