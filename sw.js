const CACHE_NAME = "ft-v1-cache-20260304-4";
const CORE_ASSETS = ["./", "./index.html", "./styles.css", "./app.js"];
const STATIC_DESTINATIONS = new Set(["style", "script"]);

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, networkResponse.clone());
        return networkResponse;
      } catch (_err) {
        const cachedRequest = await caches.match(request);
        if (cachedRequest) {
          return cachedRequest;
        }
        const fallback = await caches.match("./index.html");
        return fallback || Response.error();
      }
    })());
    return;
  }

  if (url.origin === self.location.origin && (STATIC_DESTINATIONS.has(request.destination) || /\.(css|js)$/.test(url.pathname))) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) {
        return cached;
      }
      try {
        const networkResponse = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, networkResponse.clone());
        return networkResponse;
      } catch (_err) {
        return cached || Response.error();
      }
    })());
  }
});
