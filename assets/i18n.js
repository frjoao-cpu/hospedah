(function () {
  'use strict';

  var dictionaries = {};
  var supported = ['pt', 'en', 'es'];
  var storageKey = 'hospedah_lang';

  function getPreferredLang() {
    var saved = localStorage.getItem(storageKey);
    if (saved && supported.indexOf(saved) !== -1) return saved;

    var browser = (navigator.language || 'pt').slice(0, 2).toLowerCase();
    if (supported.indexOf(browser) !== -1) return browser;
    return 'pt';
  }

  function fetchDictionary(lang) {
    if (dictionaries[lang]) return Promise.resolve(dictionaries[lang]);
    return fetch('/assets/i18n/' + lang + '.json').then(function (res) {
      if (!res.ok) throw new Error('Falha ao carregar dicionário de idioma.');
      return res.json();
    }).then(function (data) {
      dictionaries[lang] = data;
      return data;
    });
  }

  function applyTranslation(dict) {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (dict[key]) el.textContent = dict[key];
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-placeholder');
      if (dict[key]) el.setAttribute('placeholder', dict[key]);
    });

    document.querySelectorAll('[data-i18n-aria-label]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-aria-label');
      if (dict[key]) el.setAttribute('aria-label', dict[key]);
    });
  }

  function setActiveLangButton(lang) {
    document.querySelectorAll('[data-lang]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
    });
  }

  function switchLang(lang) {
    var target = supported.indexOf(lang) !== -1 ? lang : 'pt';
    localStorage.setItem(storageKey, target);
    document.documentElement.setAttribute('lang', target === 'pt' ? 'pt-BR' : target);

    return fetchDictionary(target).then(function (dict) {
      applyTranslation(dict);
      setActiveLangButton(target);
    }).catch(function () {});
  }

  window.switchLang = switchLang;

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-lang]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchLang(btn.getAttribute('data-lang'));
      });
    });

    switchLang(getPreferredLang());
  });
})();
