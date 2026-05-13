'use strict';

try {
  importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
} catch (err) {
  /* OneSignal opcional para ambiente offline */
}

var CACHE_NAME = 'hospedah-v2';
var STATIC_CACHE = 'hospedah-static-v2';
var OFFLINE_URL = '/offline.html';
var SYNC_TAG = 'hospedah-budget-sync';
var BUDGET_STORE = 'budget_queue';

var PRECACHE_URLS = [
  '/index.html',
  '/offline.html',
  '/busca.html',
  '/reservas.html',
  '/avaliacoes.html',
  '/chat.html',
  '/resorts/hotbeach.html',
  '/resorts/saopedro.html',
  '/resorts/olimpia.html',
  '/resorts/solar.html',
  '/resorts/wyndham.html',
  '/resorts/juquehy.html',
  '/resorts/ipioca.html',
  '/resorts/portoi2.html',
  '/assets/index.css',
  '/assets/mobile-first.css',
  '/assets/logo.svg',
  '/assets/logo-navbar.svg',
  '/assets/logo-favicon.svg'
];

function openQueueDb() {
  return new Promise(function (resolve, reject) {
    var request = indexedDB.open('hospedah-sync-db', 1);
    request.onupgradeneeded = function () {
      var db = request.result;
      if (!db.objectStoreNames.contains(BUDGET_STORE)) {
        db.createObjectStore(BUDGET_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = function () { resolve(request.result); };
    request.onerror = function () { reject(request.error); };
  });
}

function saveRequestToQueue(requestData) {
  return openQueueDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(BUDGET_STORE, 'readwrite');
      tx.objectStore(BUDGET_STORE).add(requestData);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  });
}

function getQueuedRequests() {
  return openQueueDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(BUDGET_STORE, 'readonly');
      var request = tx.objectStore(BUDGET_STORE).getAll();
      request.onsuccess = function () { resolve(request.result || []); };
      request.onerror = function () { reject(request.error); };
    });
  });
}

function clearQueuedRequest(id) {
  return openQueueDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(BUDGET_STORE, 'readwrite');
      tx.objectStore(BUDGET_STORE).delete(id);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  });
}

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE_NAME).then(function (cache) {
    return cache.addAll(PRECACHE_URLS);
  }).then(function () {
    return self.skipWaiting();
  }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) {
      return key !== CACHE_NAME && key !== STATIC_CACHE;
    }).map(function (key) {
      return caches.delete(key);
    }));
  }).then(function () {
    return self.clients.claim();
  }));
});

function cacheFirst(request) {
  return caches.open(STATIC_CACHE).then(function (cache) {
    return cache.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (response && response.status === 200) {
          cache.put(request, response.clone());
        }
        return response;
      });
    });
  });
}

function networkFirst(request) {
  return fetch(request).then(function (response) {
    if (response && response.status === 200) {
      caches.open(CACHE_NAME).then(function (cache) {
        cache.put(request, response.clone());
      });
    }
    return response;
  }).catch(function () {
    return caches.match(request).then(function (cached) {
      return cached || caches.match(OFFLINE_URL);
    });
  });
}

function shouldHandleAsStatic(url) {
  return url.pathname.startsWith('/assets/') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.webp');
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  var url = new URL(request.url);
  var isBudgetEndpoint = /\/api\/orcamentos|\/budget/i.test(url.pathname);

  if (request.method === 'POST' && (request.headers.get('X-Hospedah-Queue') === 'budget' || isBudgetEndpoint)) {
    event.respondWith(fetch(request.clone()).catch(function () {
      return request.clone().text().then(function (body) {
        return saveRequestToQueue({
          url: request.url,
          method: request.method,
          headers: { 'Content-Type': request.headers.get('Content-Type') || 'application/json' },
          body: body,
          createdAt: new Date().toISOString()
        }).then(function () {
          return new Response(JSON.stringify({ queued: true }), {
            status: 202,
            headers: { 'Content-Type': 'application/json' }
          });
        });
      });
    }));
    return;
  }

  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.origin === self.location.origin && shouldHandleAsStatic(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(caches.match(request).then(function (cached) {
    return cached || fetch(request).catch(function () {
      if (request.destination === 'document') return caches.match(OFFLINE_URL);
      return new Response('', { status: 504, statusText: 'Gateway Timeout' });
    });
  }));
});

function replayBudgetQueue() {
  return getQueuedRequests().then(function (items) {
    return Promise.all(items.map(function (item) {
      return fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body
      }).then(function (response) {
        if (response && response.ok) return clearQueuedRequest(item.id);
        return null;
      }).catch(function () {
        return null;
      });
    }));
  });
}

self.addEventListener('sync', function (event) {
  if (event.tag === SYNC_TAG) event.waitUntil(replayBudgetQueue());
});

self.addEventListener('message', function (event) {
  var data = event.data || {};
  if (data.type === 'REGISTER_BUDGET_SYNC') {
    if (self.registration && self.registration.sync) {
      self.registration.sync.register(SYNC_TAG).catch(function () {});
    } else {
      replayBudgetQueue();
    }
  }
});
