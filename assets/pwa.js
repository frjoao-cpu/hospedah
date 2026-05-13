(function () {
  'use strict';

  var deferredPrompt = null;
  var banner = document.getElementById('pwa-install-banner');
  var installBtn = document.getElementById('pwa-install-btn');
  var closeBtn = document.getElementById('pwa-install-close');
  var DISMISSED_KEY = 'hospedah_pwa_banner_dismissed';
  var VISITS_KEY = 'hospedah_pwa_visits';
  var BUDGET_QUEUE_KEY = 'hospedah_offline_budget_queue';

  function shouldShowBanner() {
    if (!banner) return false;
    if (window.matchMedia('(display-mode: standalone)').matches) return false;
    if (localStorage.getItem(DISMISSED_KEY) === 'true') return false;
    return true;
  }

  function showBanner() {
    if (!shouldShowBanner() || !deferredPrompt) return;
    banner.style.display = 'flex';
  }

  function hideBanner() {
    if (!banner) return;
    banner.style.display = 'none';
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function (err) {
        console.warn('Falha ao registrar service worker:', err);
      });
    });
  }

  function setupInstallPrompt() {
    if (!banner || !installBtn || !closeBtn) return;

    var visits = Number(localStorage.getItem(VISITS_KEY) || '0') + 1;
    localStorage.setItem(VISITS_KEY, String(visits));

    if (visits >= 2) setTimeout(showBanner, 500);
    else setTimeout(showBanner, 30000);

    window.addEventListener('beforeinstallprompt', function (event) {
      event.preventDefault();
      deferredPrompt = event;
      showBanner();
    });

    installBtn.addEventListener('click', function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () {
        deferredPrompt = null;
        hideBanner();
      }).catch(function () {
        hideBanner();
      });
    });

    closeBtn.addEventListener('click', function () {
      localStorage.setItem(DISMISSED_KEY, 'true');
      hideBanner();
    });
  }

  function ensureOneSignalConsent() {
    var consent = localStorage.getItem('hospedah_consent');
    if (consent !== 'accepted') return;
    if (window.OneSignalDeferred || document.querySelector('script[src*="OneSignalSDK.page.js"]')) return;
    if (typeof window.initTracking === 'function') window.initTracking();
  }

  function getQueue() {
    try {
      return JSON.parse(localStorage.getItem(BUDGET_QUEUE_KEY) || '[]');
    } catch (err) {
      return [];
    }
  }

  function setQueue(queue) {
    localStorage.setItem(BUDGET_QUEUE_KEY, JSON.stringify(queue));
  }

  function requestSync() {
    if (!navigator.serviceWorker || !navigator.serviceWorker.ready) return;
    navigator.serviceWorker.ready.then(function (registration) {
      if (registration.sync && typeof registration.sync.register === 'function') {
        registration.sync.register('hospedah-budget-sync').catch(function () {});
      } else if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'REGISTER_BUDGET_SYNC' });
      }
    }).catch(function () {});
  }

  function flushQueue() {
    if (!navigator.onLine) return;
    var queue = getQueue();
    if (!queue.length) return;

    var pending = queue.slice();
    Promise.all(pending.map(function (item) {
      return fetch('/api/orcamentos-offline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Hospedah-Queue': 'budget' },
        body: JSON.stringify(item)
      });
    })).then(function (responses) {
      var failed = [];
      responses.forEach(function (res, idx) {
        if (!res || !res.ok) failed.push(pending[idx]);
      });
      setQueue(failed);
    }).catch(function () {
      requestSync();
    });
  }

  window.HOSPEDAH_PWA = window.HOSPEDAH_PWA || {};
  window.HOSPEDAH_PWA.enqueueBudget = function (payload) {
    var queue = getQueue();
    queue.push({ payload: payload, createdAt: new Date().toISOString() });
    setQueue(queue);
    requestSync();
  };

  window.addEventListener('online', flushQueue);

  window.addEventListener('appinstalled', function () {
    localStorage.setItem(DISMISSED_KEY, 'true');
    hideBanner();
    if (window.dataLayer && Array.isArray(window.dataLayer)) {
      window.dataLayer.push({ event: 'hospedah_app_installed' });
    }
    alert('Obrigado por instalar o app HOSPEDAH!');
  });

  registerServiceWorker();
  setupInstallPrompt();
  ensureOneSignalConsent();
  flushQueue();
}());
