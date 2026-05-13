'use strict';

var STATIC_CACHE = 'hospedah-static-v5';
var PAGE_CACHE = 'hospedah-pages-v5';
var OFFLINE_URL = '/offline.html';

var PRECACHE_URLS = [
  '/',
  '/index.html',
  '/busca.html',
  '/reservas.html',
  '/chat.html',
  '/avaliacoes.html',
  '/jornal.html',
  '/portal/index.html',
  '/portal/dashboard.html',
  '/portal/reset-password.html',
  '/admin/index.html',
  '/resorts/hotbeach.html',
  '/resorts/saopedro.html',
  '/resorts/olimpia.html',
  '/resorts/solar.html',
  '/resorts/wyndham.html',
  '/resorts/juquehy.html',
  '/resorts/ipioca.html',
  '/resorts/portoi2.html',
  '/assets/mobile-first.css',
  '/assets/style.css',
  '/assets/index.css',
  '/assets/portal.css',
  '/assets/admin.css',
  '/assets/pwa.js',
  '/offline.html',
  '/manifest.json'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(function (cache) {
      return cache.addAll(PRECACHE_URLS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== STATIC_CACHE && key !== PAGE_CACHE) {
          return caches.delete(key);
        }
        return Promise.resolve();
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

function isAsset(pathname) {
  return /\.(?:css|js|png|jpg|jpeg|svg|webp|woff2?)$/i.test(pathname);
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(function (response) {
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(PAGE_CACHE).then(function (cache) {
            cache.put(req, clone);
          });
        }
        return response;
      }).catch(function () {
        return caches.match(req).then(function (cached) {
          return cached || caches.match(OFFLINE_URL);
        });
      })
    );
    return;
  }

  if (isAsset(url.pathname)) {
    event.respondWith(
      caches.match(req).then(function (cached) {
        if (cached) return cached;
        return fetch(req).then(function (response) {
          if (response && response.status === 200) {
            var clone = response.clone();
            caches.open(STATIC_CACHE).then(function (cache) {
              cache.put(req, clone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(req).catch(function () {
      return caches.match(req);
    })
  );
});

self.addEventListener('sync', function (event) {
  if (event.tag === 'hospedah-sync') {
    event.waitUntil(Promise.resolve());
  }
});
