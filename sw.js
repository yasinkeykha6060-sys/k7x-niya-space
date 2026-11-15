const CACHE = "niya-space-v3";
const FILES = [
  "./",
  "./index.html",
  "./tests.html",
  "./manifest.webmanifest",
  "./css/style.css",
  "./js/main.js",
  "./js/config.js",
  "./js/physics.js",
  "./js/vehicle.js",
  "./js/guidance.js",
  "./js/flight.js",
  "./js/rocketart.js",
  "./js/builder.js",
  "./js/company.js",
  "./js/storage.js",
  "./js/audio.js",
  "./data/parts.js",
  "./data/designs.js",
  "./data/handbook.js",
  "./tests/suite.js",
  "./assets/fonts/Vazirmatn-Regular.woff2",
  "./assets/fonts/Vazirmatn-Bold.woff2",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
      return response;
    }).catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html")))
  );
});
