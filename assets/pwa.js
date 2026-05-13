(function () {
  'use strict';

  var deferredPrompt = null;
  var syncTag = 'hospedah-form-sync';
  var DB_NAME = 'hospedah-offline';
  var STORE_NAME = 'form_queue';

  function registerSW() {
    if (!('serviceWorker' in navigator)) return Promise.resolve(null);
    return navigator.serviceWorker.register('/sw.js').catch(function () { return null; });
  }

  function showInstallBanner() {
    var banner = document.getElementById('pwa-install-banner');
    if (!banner) return;

    var installBtn = document.getElementById('pwa-install-btn');
    var closeBtn = document.getElementById('pwa-install-close');

    setTimeout(function () {
      if (deferredPrompt) banner.hidden = false;
    }, 30000);

    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        banner.hidden = true;
      });
    }

    if (installBtn) {
      installBtn.addEventListener('click', function () {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        deferredPrompt.userChoice.finally(function () {
          deferredPrompt = null;
          banner.hidden = true;
        });
      });
    }
  }

  function initOneSignalWithConsent() {
    var consent = localStorage.getItem('hospedah_consent');
    if (consent !== 'accepted') return;
    if (window.document.querySelector('script[src*="OneSignalSDK.page.js"]')) return;

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(function (OneSignal) {
      OneSignal.init({ appId: 'd60b7815-e4c5-4cad-85e1-052aabc794bd', allowLocalhostAsSecureOrigin: true });
    });

    var script = document.createElement('script');
    script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
    script.defer = true;
    document.head.appendChild(script);
  }

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

  function queueFormSubmission(payload) {
    return openQueueDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(payload);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function maybeRegisterSync() {
    if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return;
    navigator.serviceWorker.ready.then(function (registration) {
      registration.sync.register(syncTag).catch(function () {});
    }).catch(function () {});
  }

  function setupOfflineFormSync() {
    if (!('indexedDB' in window)) return;

    document.querySelectorAll('form[data-offline-sync]').forEach(function (form) {
      form.addEventListener('submit', function (event) {
        if (navigator.onLine) return;

        event.preventDefault();
        var payload = {
          id: Date.now() + '-' + Math.random().toString(16).slice(2),
          url: form.getAttribute('action') || window.location.href,
          method: (form.getAttribute('method') || 'POST').toUpperCase(),
          body: Object.fromEntries(new FormData(form).entries()),
          headers: { 'Content-Type': 'application/json' },
          createdAt: new Date().toISOString()
        };

        queueFormSubmission(payload).then(function () {
          maybeRegisterSync();
          window.alert('Sem conexão. Envio salvo e será reenviado automaticamente.');
          form.reset();
        }).catch(function () {
          window.alert('Sem conexão. Não foi possível salvar para reenvio.');
        });
      });
    });
  }

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredPrompt = event;
  });

  window.addEventListener('DOMContentLoaded', function () {
    registerSW();
    showInstallBanner();
    initOneSignalWithConsent();
    setupOfflineFormSync();
  });
})();
