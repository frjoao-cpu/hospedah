(function () {
  'use strict';

  var STORAGE_KEY = 'hospedah_lang';
  var defaultLang = 'pt';
  var loadedMessages = {};

  function normalizeLang(lang) {
    var value = (lang || '').toLowerCase();
    if (value.indexOf('es') === 0) return 'es';
    if (value.indexOf('en') === 0) return 'en';
    return 'pt';
  }

  function getPreferredLang() {
    var stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return normalizeLang(stored);
    return normalizeLang(navigator.language || defaultLang);
  }

  async function getMessages(lang) {
    if (loadedMessages[lang]) return loadedMessages[lang];
    var response = await fetch('/assets/i18n/' + lang + '.json', { cache: 'no-cache' });
    if (!response.ok) {
      if (lang !== defaultLang) return getMessages(defaultLang);
      throw new Error('Falha ao carregar tradução');
    }
    loadedMessages[lang] = await response.json();
    return loadedMessages[lang];
  }

  function textForPath(dict, path) {
    return path.split('.').reduce(function (acc, key) {
      if (acc && Object.prototype.hasOwnProperty.call(acc, key)) return acc[key];
      return null;
    }, dict);
  }

  function applyTranslations(dict) {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      var value = textForPath(dict, key);
      if (typeof value === 'string') {
        el.textContent = value;
      }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-placeholder');
      var value = textForPath(dict, key);
      if (typeof value === 'string') {
        el.setAttribute('placeholder', value);
      }
    });

    document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-title');
      var value = textForPath(dict, key);
      if (typeof value === 'string') {
        el.setAttribute('title', value);
      }
    });

    document.documentElement.setAttribute('lang', normalizeLang(localStorage.getItem(STORAGE_KEY) || defaultLang));
  }

  async function switchLang(lang) {
    var nextLang = normalizeLang(lang);
    localStorage.setItem(STORAGE_KEY, nextLang);
    var messages = await getMessages(nextLang);
    applyTranslations(messages);

    document.querySelectorAll('[data-switch-lang]').forEach(function (btn) {
      var isActive = btn.getAttribute('data-switch-lang') === nextLang;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  window.switchLang = function (lang) {
    return switchLang(lang).catch(function () {});
  };

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-switch-lang]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchLang(btn.getAttribute('data-switch-lang')).catch(function () {});
      });
    });

    switchLang(getPreferredLang()).catch(function () {});
  });
})();
