(function () {
  'use strict';

  var SUPPORTED_LANGS = ['pt', 'en', 'es'];
  var currentLang = 'pt';
  var currentDict = null;

  function getInitialLang() {
    var saved = localStorage.getItem('hospedah_lang');
    if (saved && SUPPORTED_LANGS.indexOf(saved) !== -1) {
      return saved;
    }
    var browser = (navigator.language || 'pt').slice(0, 2).toLowerCase();
    return SUPPORTED_LANGS.indexOf(browser) !== -1 ? browser : 'pt';
  }

  function setHtmlLang(lang) {
    var htmlLang = lang;
    if (lang === 'pt') htmlLang = 'pt-BR';
    if (lang === 'en') htmlLang = 'en-US';
    if (lang === 'es') htmlLang = 'es-ES';
    document.documentElement.setAttribute('lang', htmlLang);
  }

  function getByPath(obj, path) {
    return path.split('.').reduce(function (acc, part) {
      return acc && acc[part] !== undefined ? acc[part] : null;
    }, obj);
  }

  function applyTranslations() {
    if (!currentDict) return;

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      var value = getByPath(currentDict, key);
      if (typeof value === 'string') {
        el.textContent = value;
      }
    });

    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-html');
      var value = getByPath(currentDict, key);
      if (typeof value === 'string') {
        el.innerHTML = value;
      }
    });

    document.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
      var config = el.getAttribute('data-i18n-attr');
      if (!config) return;
      config.split(';').map(function (part) {
        return part.trim();
      }).filter(Boolean).forEach(function (pair) {
        var parts = pair.split(':').map(function (part) {
          return part.trim();
        });
        if (parts.length !== 2) return;
        var value = getByPath(currentDict, parts[1]);
        if (typeof value === 'string') {
          el.setAttribute(parts[0], value);
        }
      });
    });

    var title = getByPath(currentDict, 'meta.title');
    if (title) document.title = title;

    setHtmlLang(currentLang);

    document.querySelectorAll('.lang-btn').forEach(function (btn) {
      var isActive = btn.getAttribute('data-lang') === currentLang;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  async function loadLang(lang) {
    try {
      var res = await fetch('/assets/i18n/' + lang + '.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('Falha ao carregar idioma: ' + lang);
      currentDict = await res.json();
      currentLang = lang;
      localStorage.setItem('hospedah_lang', lang);
      applyTranslations();
    } catch (err) {
      console.warn(err);
      if (lang !== 'pt') loadLang('pt');
    }
  }

  window.switchLang = function (lang) {
    if (SUPPORTED_LANGS.indexOf(lang) === -1) return;
    loadLang(lang);
  };

  document.addEventListener('DOMContentLoaded', function () {
    loadLang(getInitialLang());
  });
}());
