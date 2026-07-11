/**
 * sw.js — service worker for the Terrapin Solar CRM PWA.
 * =============================================================================
 * Scope is intentionally narrow: make the app SHELL (HTML/CSS/JS/icons)
 * install instantly and open even with a weak/no signal at a jobsite, so it
 * feels like a real app instead of a website. It deliberately does NOT cache
 * or intercept API calls — every request to the Apps Script backend (all POST)
 * goes straight to the network untouched. Job data, photos, and auth must
 * always be live; caching that would risk showing stale safety notes or job
 * status offline, which is worse than just showing "you're offline."
 *
 * Bump CACHE_VERSION any time you want to force every installed copy to pick
 * up new files on next launch (old caches are deleted on activate).
 *
 * Update strategy: network-first for the app shell. This app is under active
 * development — a cache-first strategy would mean bug fixes silently don't
 * show up for users until they happen to go offline once. Network-first
 * always prefers the freshest file when online, and only falls back to the
 * cached copy when the network request fails (actually offline).
 */

const CACHE_VERSION = 'terrapin-crm-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/config.js',
  './js/api.js',
  './js/auth.js',
  './js/app.js',
  './img/logo.png',
  './img/logo-512.png',
  './img/icon-192.png',
  './img/icon-maskable-512.png',
  './img/apple-touch-icon.png',
  './favicon.ico'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(function (cache) { return cache.addAll(APP_SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE_VERSION; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;

  // Never touch anything but simple same-origin GETs: leaves the Apps Script
  // API (POST), Google Sign-In scripts, and any cross-origin call untouched.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then(function (res) {
        var copy = res.clone();
        caches.open(CACHE_VERSION).then(function (cache) { cache.put(req, copy); });
        return res;
      })
      .catch(function () { return caches.match(req, { ignoreSearch: true }); })
  );
});
