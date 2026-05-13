'use strict';

try {
  importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
} catch (err) {
  // noop
}

var CACHE_STATIC = 'hospedah-static-v5';
var CACHE_PAGES = 'hospedah-pages-v5';
var DB_NAME = 'hospedah-offline';
var STORE_NAME = 'form_queue';
var SYNC_TAG = 'hospedah-form-sync';

var PRECACHE = [
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
  '/assets/portal.js',
  '/assets/admin.js',
  '/assets/i18n.js',
  '/assets/pwa.js',
  '/manifest.json',
  '/offline.html'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_PAGES).then(function (cache) {
      return cache.addAll(PRECACHE);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  var keep = [CACHE_STATIC, CACHE_PAGES];
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (keep.indexOf(key) === -1) return caches.delete(key);
        return Promise.resolve();
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

function isStaticAsset(reqUrl) {
  return /\.(?:css|js|png|jpg|jpeg|svg|webp|woff2?|json)$/.test(reqUrl.pathname);
}

function cacheFirst(request) {
  return caches.open(CACHE_STATIC).then(function (cache) {
    return cache.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (response && response.status === 200) cache.put(request, response.clone());
        return response;
      });
    });
  });
}

function networkFirst(request) {
  return fetch(request).then(function (response) {
    if (response && response.status === 200) {
      caches.open(CACHE_PAGES).then(function (cache) {
        cache.put(request, response.clone());
      });
    }
    return response;
  }).catch(function () {
    return caches.match(request).then(function (cached) {
      return cached || caches.match('/offline.html');
    });
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var reqUrl = new URL(request.url);
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (reqUrl.origin === self.location.origin && isStaticAsset(reqUrl)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(
    caches.match(request).then(function (cached) {
      return cached || fetch(request).catch(function () { return caches.match('/offline.html'); });
    })
  );
});

function openQueueDb() {
  return new Promise(function (resolve, reject) {
    var request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = function () {
      var db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = function () { resolve(request.result); };
    request.onerror = function () { reject(request.error); };
  });
}

function getQueuedSubmissions() {
  return openQueueDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE_NAME, 'readonly');
      var store = tx.objectStore(STORE_NAME);
      var req = store.getAll();
      req.onsuccess = function () { resolve(req.result || []); };
      req.onerror = function () { reject(req.error); };
    });
  });
}

function removeQueuedSubmission(id) {
  return openQueueDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  });
}

function flushQueue() {
  return getQueuedSubmissions().then(function (items) {
    return Promise.all(items.map(function (item) {
      return fetch(item.url, {
        method: item.method || 'POST',
        headers: item.headers || { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.body || {})
      }).then(function (res) {
        if (res && res.ok) {
          return removeQueuedSubmission(item.id);
        }
        return Promise.resolve();
      }).catch(function () {
        return Promise.resolve();
      });
    }));
  });
}

self.addEventListener('sync', function (event) {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(flushQueue());
  }
});
