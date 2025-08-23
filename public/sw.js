// public/sw.js — cache ligero tipo "app shell"
// No cachea llamadas a Supabase para que los datos siempre estén frescos.

const VERSION = "t4c-sw-v1";
const APP_SHELL = [
  "/",
  "/storefront",
  "/index.html",
  "/manifest.webmanifest"
];

// Instalar: precache básico
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
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

  // Nunca cachear supabase ni RPC
  if (url.hostname.endsWith("supabase.co")) return;

  const acceptsHTML = request.headers.get("accept")?.includes("text/html");
  const isStatic = /\.(css|js|png|jpg|jpeg|gif|svg|webp|ico|ttf|woff2?)$/i.test(url.pathname)
                || url.pathname === "/manifest.webmanifest";

  if (acceptsHTML) {
    event.respondWith(
      fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(request, copy));
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
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(request, copy));
          return res;
        })
      )
    );
  }
});
