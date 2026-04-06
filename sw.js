/* ============================================================
   HOSPEDAH — Service Worker
   Estratégia: Cache-First para assets estáticos,
               Network-First para HTML/navegação.
   ============================================================ */
'use strict';

var CACHE_NAME = 'hospedah-v1';
var ASSETS_CACHE = 'hospedah-assets-v1';

/* Recursos essenciais para funcionar offline */
var PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap'
];

/* ── Install: pré-cacheia os essenciais ── */
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE_URLS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

/* ── Activate: remove caches antigos ── */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) {
          return key !== CACHE_NAME && key !== ASSETS_CACHE;
        }).map(function (key) {
          return caches.delete(key);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* ── Fetch: estratégia híbrida ── */
self.addEventListener('fetch', function (event) {
  var req = event.request;
  var url = new URL(req.url);

  /* Ignora requisições não-GET e extensões externas que não cachear */
  if (req.method !== 'GET') return;
  if (url.origin !== self.location.origin &&
      url.hostname !== 'fonts.googleapis.com' &&
      url.hostname !== 'fonts.gstatic.com' &&
      url.hostname !== 'i.imgur.com') return;

  /* Imagens Imgur: Cache-First com fallback de rede */
  if (url.hostname === 'i.imgur.com') {
    event.respondWith(
      caches.open(ASSETS_CACHE).then(function (cache) {
        return cache.match(req).then(function (cached) {
          if (cached) return cached;
          return fetch(req).then(function (response) {
            if (response && response.status === 200) {
              cache.put(req, response.clone());
            }
            return response;
          });
        });
      })
    );
    return;
  }

  /* Google Fonts: Cache-First */
  if (url.hostname === 'fonts.googleapis.com' ||
      url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(ASSETS_CACHE).then(function (cache) {
        return cache.match(req).then(function (cached) {
          if (cached) return cached;
          return fetch(req).then(function (response) {
            if (response && response.status === 200) {
              cache.put(req, response.clone());
            }
            return response;
          });
        });
      })
    );
    return;
  }

  /* HTML (navegação): Network-First com fallback para cache */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(function (response) {
        if (response && response.status === 200) {
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(req, response.clone());
          });
        }
        return response;
      }).catch(function () {
        return caches.match('/index.html');
      })
    );
    return;
  }

  /* Outros recursos: Cache-First */
  event.respondWith(
    caches.match(req).then(function (cached) {
      return cached || fetch(req).then(function (response) {
        if (response && response.status === 200) {
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(req, response.clone());
          });
        }
        return response;
      });
    })
  );
});
