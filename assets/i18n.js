(function () {
  'use strict';

  var STORAGE_KEY = 'hospedah_lang';
  var DEFAULT_LANG = 'pt';
  var supported = ['pt', 'en', 'es'];

  function detectLang() {
    var saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && supported.indexOf(saved) !== -1) return saved;

    var navLang = (navigator.language || DEFAULT_LANG).toLowerCase();
    if (navLang.indexOf('es') === 0) return 'es';
    if (navLang.indexOf('en') === 0) return 'en';
    return DEFAULT_LANG;
  }

  async function fetchTranslations(lang) {
    var response = await fetch('/assets/i18n/' + lang + '.json', { cache: 'default' });
    if (!response.ok) throw new Error('Arquivo de tradução indisponível.');
    return response.json();
  }

  function applyTranslations(dict) {
    var nodes = document.querySelectorAll('[data-i18n]');
    nodes.forEach(function (node) {
      var key = node.getAttribute('data-i18n');
      if (!dict[key]) return;
      node.textContent = dict[key];
    });
  }

  async function switchLang(lang) {
    var target = supported.indexOf(lang) !== -1 ? lang : DEFAULT_LANG;
    var dict = await fetchTranslations(target);
    applyTranslations(dict);
    window.localStorage.setItem(STORAGE_KEY, target);
    document.documentElement.setAttribute('lang', target === 'pt' ? 'pt-BR' : target);

    document.querySelectorAll('[data-lang]').forEach(function (button) {
      var active = button.getAttribute('data-lang') === target;
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  window.switchLang = function (lang) {
    return switchLang(lang).catch(function () {
      return null;
    });
  };

  document.addEventListener('DOMContentLoaded', function () {
    var langButtons = document.querySelectorAll('[data-lang]');
    langButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        var lang = button.getAttribute('data-lang');
        window.switchLang(lang);
      });
    });

    window.switchLang(detectLang());
  });
})();
