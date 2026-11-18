// Service Worker: macht die App offline nutzbar.
// VERSION wird beim Deployment durch den Commit-Hash ersetzt; "dev" = lokale Entwicklung.
const VERSION = "dev";
const SHELL = `nutraid-shell-${VERSION}`;
const DATA = `nutraid-data-${VERSION}`;

const APP_FILES = [
  "./", "index.html", "manifest.webmanifest", "icon.svg", "css/style.css",
  "js/app.js", "js/daten.js", "js/pwa.js", "js/scanner.js", "js/dashboard.js", "js/eigene.js", "js/referenz.js", "js/ui.js", "js/verlauf.js", "js/vendor/zxing.min.js",
  "data/lebensmittel.json", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-192.png", "icons/maskable-512.png",
];
// Die große USDA-Liste (5,5 MB) wird erst bei Bedarf geladen und dann zwischengespeichert
const LAZY = ["data/usda.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(APP_FILES.map((f) => new Request(f, { cache: "reload" })))));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== SHELL && key !== DATA) await caches.delete(key);
    await self.clients.claim();
  })());
});

// Die Seite bestätigt das Update ("Neu laden") – erst dann übernimmt die neue Version
self.addEventListener("message", (e) => {
  if (e.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.includes("/api/")) return;
  const lazy = LAZY.some((f) => url.pathname.endsWith(f));
  if (VERSION === "dev") return e.respondWith(networkFirst(e.request, lazy ? DATA : SHELL));
  e.respondWith(cacheFirst(e.request, lazy ? DATA : SHELL));
});

async function cacheFirst(req, cacheName) {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(cacheName)).put(req, res.clone());
  return res;
}

async function networkFirst(req, cacheName) {
  try {
    const res = await fetch(req, { cache: "no-store" });
    if (res.ok) (await caches.open(cacheName)).put(req, res.clone());
    return res;
  } catch {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw new Error("offline");
  }
}
