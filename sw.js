// ARDE Campo · Service worker: la app abre y funciona sin señal.
// Al publicar una versión nueva, cambia VERSION para que los celulares se actualicen.
var VERSION = 'arde-campo-1.0.1';
var ARCHIVOS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/config.js', 'js/core.js', 'js/ui.js', 'js/mod-tecnico.js', 'js/mod-comercial.js', 'js/app.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(ARCHIVOS); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (claves) {
    return Promise.all(claves.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('message', function (e) { if (e.data === 'activar') self.skipWaiting(); });

// Solo se sirven desde caché los archivos de la app; la API (Google) siempre va a la red
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (r) {
    return r || fetch(e.request).catch(function () { return caches.match('index.html'); });
  }));
});
