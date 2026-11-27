// Tilo has closed. This replaces the old offline service worker: it empties its caches, lets
// go of itself and reloads any open tab, so nobody keeps seeing the old app from the cache.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) await caches.delete(k);
      await self.registration.unregister();
      for (const c of await self.clients.matchAll({ type: "window" })) c.navigate(c.url);
    })(),
  );
});
