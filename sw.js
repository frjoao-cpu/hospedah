/* ============================================================
   HOSPEDAH — Service Worker
   Estratégia:
     • Cache-First com revalidação background (SWR) para fontes e CSS.
     • Network-First para HTML/navegação.
     • Cache-First para imagens Imgur.
   ============================================================ */
'use strict';

/* OneSignal Web Push — importa o SW do SDK para compatibilidade */

importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
var CACHE_NAME = 'hospedah-v2';
var ASSETS_CACHE = 'hospedah-assets-v2';
var FONT_CACHE = 'hospedah-fonts-v2';

/* Recursos essenciais para funcionar offline */
var PRECACHE_URLS = [
  '/',
  '/index.html',
  '/busca.html',
  '/reservas.html',
  '/chat.html',
  '/avaliacoes.html',
  '/cadastro.html',
  '/painel.html',
  '/sistema.html',
  '/assets/mobile-first.css',
  '/assets/index.css',
  '/assets/style.css',
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
  var validCaches = [CACHE_NAME, ASSETS_CACHE, FONT_CACHE];
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) {
          return validCaches.indexOf(key) === -1;
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

  /* Google Fonts: Stale-While-Revalidate — serve do cache imediatamente
     e atualiza em background para garantir versões recentes */
  if (url.hostname === 'fonts.googleapis.com' ||
      url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(function (cache) {
        return cache.match(req).then(function (cached) {
          var fetchPromise = fetch(req).then(function (response) {
            if (response && response.status === 200) {
              cache.put(req, response.clone());
            }
            return response;
          });
          /* Retorna o cache imediatamente se disponível; caso contrário aguarda a rede */
          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  /* CSS e JS locais: Stale-While-Revalidate — performance + frescor */
  if (url.origin === self.location.origin &&
      (url.pathname.endsWith('.css') || url.pathname.endsWith('.js'))) {
    event.respondWith(
      caches.open(CACHE_NAME).then(function (cache) {
        return cache.match(req).then(function (cached) {
          var fetchPromise = fetch(req).then(function (response) {
            if (response && response.status === 200) {
              cache.put(req, response.clone());
            }
            return response;
          });
          return cached || fetchPromise;
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
