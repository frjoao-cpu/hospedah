/* ============================================================
   HOSPEDAH — Service Worker
   Estratégias:
     • Network-first para navegação HTML com fallback offline.
     • Stale-while-revalidate para CSS/JS/fontes.
     • Cache-first para imagens e páginas resort pré-cacheadas.
   ============================================================ */
'use strict';

importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

var CACHE_STATIC = 'hospedah-static-v5';
var CACHE_RUNTIME = 'hospedah-runtime-v5';
var CACHE_IMAGES = 'hospedah-images-v5';

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
  '/portal/index.html',
  '/portal/dashboard.html',
  '/portal/reset-password.html',
  '/admin/index.html',
  '/offline.html',
  '/manifest.json',
  '/assets/mobile-first.css',
  '/assets/style.css',
  '/assets/portal.css',
  '/assets/admin.css',
  '/assets/i18n.js',
  '/assets/pwa.js',
  '/resorts/hotbeach.html',
  '/resorts/saopedro.html',
  '/resorts/olimpia.html',
  '/resorts/solar.html',
  '/resorts/wyndham.html',
  '/resorts/juquehy.html',
  '/resorts/ipioca.html',
  '/resorts/portoi2.html'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(function (cache) {
      return cache.addAll(PRECACHE_URLS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  var valid = [CACHE_STATIC, CACHE_RUNTIME, CACHE_IMAGES];
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (valid.indexOf(key) === -1) {
          return caches.delete(key);
        }
        return Promise.resolve();
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then(function (cache) {
    return cache.match(request).then(function (cached) {
      var fetchPromise = fetch(request).then(function (response) {
        if (response && response.status === 200) {
          cache.put(request, response.clone());
        }
        return response;
      }).catch(function () {
        return cached;
      });

      if (cached) {
        fetchPromise.catch(function (error) {
          console.warn('SW staleWhileRevalidate failed:', error);
        });
        return cached;
      }
      return fetchPromise;
    });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  var url = new URL(req.url);

  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(function (response) {
        if (response && response.status === 200) {
          caches.open(CACHE_RUNTIME).then(function (cache) {
            cache.put(req, response.clone());
          });
        }
        return response;
      }).catch(function () {
        return caches.match(req).then(function (cachedPage) {
          if (cachedPage) return cachedPage;
          return caches.match('/offline.html').then(function (offlinePage) {
            if (offlinePage) return offlinePage;
            return caches.match('/index.html').then(function (homePage) {
              if (homePage) return homePage;
              return new Response('Offline', {
                status: 503,
                statusText: 'Service Unavailable',
                headers: { 'Content-Type': 'text/plain; charset=utf-8' }
              });
            });
          });
        });
      })
    );
    return;
  }

  if (url.origin === self.location.origin && (url.pathname.endsWith('.css') || url.pathname.endsWith('.js'))) {
    event.respondWith(staleWhileRevalidate(req, CACHE_RUNTIME));
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(req, CACHE_RUNTIME));
    return;
  }

  if (req.destination === 'image' || url.hostname === 'i.imgur.com') {
    event.respondWith(
      caches.open(CACHE_IMAGES).then(function (cache) {
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

  event.respondWith(
    caches.match(req).then(function (cached) {
      return cached || fetch(req);
    })
  );
});

self.addEventListener('sync', function (event) {
  if (event.tag !== 'hospedah-sync') return;

  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true }).then(function (clients) {
      clients.forEach(function (client) {
        client.postMessage({ type: 'SYNC_READY', at: Date.now() });
      });
    })
  );
});
