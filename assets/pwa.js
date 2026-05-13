(function () {
  'use strict';

  var deferredPrompt = null;
  var banner = null;

  function showBanner() {
    if (!banner) return;
    banner.hidden = false;
  }

  function hideBanner() {
    if (!banner) return;
    banner.hidden = true;
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').then(function (registration) {
      if ('sync' in registration) {
        registration.sync.register('hospedah-sync').catch(function () {});
      }
    }).catch(function () {});
  }

  function setupInstallPrompt() {
    banner = document.getElementById('pwa-install-banner');
    var installButton = document.getElementById('btn-install-pwa');
    var dismissButton = document.getElementById('btn-dismiss-pwa');

    window.addEventListener('beforeinstallprompt', function (event) {
      event.preventDefault();
      deferredPrompt = event;
      showBanner();
    });

    if (installButton) {
      installButton.addEventListener('click', function () {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function () {
          deferredPrompt = null;
          hideBanner();
        });
      });
    }

    if (dismissButton) {
      dismissButton.addEventListener('click', hideBanner);
    }

    window.addEventListener('appinstalled', function () {
      deferredPrompt = null;
      hideBanner();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    registerServiceWorker();
    setupInstallPrompt();
  });
})();
