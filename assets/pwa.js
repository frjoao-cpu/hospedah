(function () {
  'use strict';

  var deferredPrompt;

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }

  function initInstallBanner() {
    var banner = document.getElementById('pwa-install-banner');
    var installBtn = document.getElementById('pwaInstallBtn');
    var closeBtn = document.getElementById('pwaInstallClose');
    if (!banner || !installBtn || !closeBtn) return;

    closeBtn.addEventListener('click', function () {
      banner.classList.remove('show');
    });

    window.addEventListener('beforeinstallprompt', function (event) {
      event.preventDefault();
      deferredPrompt = event;
      window.setTimeout(function () {
        banner.classList.add('show');
      }, 30000);
    });

    installBtn.addEventListener('click', function () {
      if (!deferredPrompt) return;
      Promise.resolve()
        .then(function () {
          deferredPrompt.prompt();
        })
        .then(function () {
          return deferredPrompt.userChoice;
        })
        .catch(function (err) {
          console.warn('Falha ao abrir prompt de instalação:', err);
        })
        .finally(function () {
          deferredPrompt = null;
          banner.classList.remove('show');
        });
    });
  }

  function initConditionalOneSignal() {
    if (localStorage.getItem('hospedah_consent') !== 'accepted') return;
    if (window.OneSignal || document.querySelector('script[data-onesignal="sdk"]') || document.querySelector('script[src*="OneSignalSDK.page.js"]')) return;

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(function (OneSignal) {
      OneSignal.init({ appId: 'd60b7815-e4c5-4cad-85e1-052aabc794bd', allowLocalhostAsSecureOrigin: true });
    });

    var script = document.createElement('script');
    script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
    script.defer = true;
    script.setAttribute('data-onesignal', 'sdk');
    document.head.appendChild(script);
  }

  registerServiceWorker();
  document.addEventListener('DOMContentLoaded', function () {
    initInstallBanner();
    initConditionalOneSignal();
  });
})();
