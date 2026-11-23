/* Uygulama kabuğunu önbelleğe alır. İçerik/kod değiştirince VERSION'ı artırın. */
const VERSION = "mb-v1";
const FILES = ["./", "index.html", "style.css", "config.js", "app.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== VERSION).map((x) => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  // Yalnızca kendi dosyalarımız. API ve YouTube istekleri hiç önbelleğe alınmaz.
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then((res) => { const c = res.clone(); caches.open(VERSION).then((x) => x.put(req, c)); return res; })
      .catch(() => caches.match(req).then((r) => r || caches.match("index.html")))
  );
});
