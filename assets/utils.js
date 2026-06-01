// ============================================================
// HOSPEDAH — Utilitários compartilhados (window.HospedahUtils)
//
// Funções utilitárias reutilizáveis em portal.js, admin.js e
// demais scripts. Carregue este arquivo antes dos scripts de
// página para garantir disponibilidade do objeto global.
// ============================================================
(function () {
  'use strict';

  /**
   * Formata um número como moeda brasileira (BRL).
   * @param {number} value
   * @returns {string}
   */
  function money(value) {
    return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  /**
   * Escapa caracteres HTML especiais para prevenir XSS em innerHTML.
   * @param {*} value
   * @returns {string}
   */
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Escapa apenas atributos HTML (sem aspas simples).
   * @param {*} value
   * @returns {string}
   */
  function escapeAttr(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Define textContent de um elemento pelo seu id.
   * @param {string} id
   * @param {string} text
   */
  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  /**
   * Define uma mensagem de feedback (success/error) em um elemento.
   * @param {Element|null} el
   * @param {string} text
   * @param {'success'|'error'|''} type
   */
  function setMessage(el, text, type) {
    if (!el) return;
    el.textContent = text || '';
    el.classList.remove('success', 'error');
    if (type) el.classList.add(type);
  }

  /**
   * Validação simples de formato de e-mail.
   * @param {string} value
   * @returns {boolean}
   */
  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  /**
   * Formata uma data ISO como data brasileira (dd/mm/aaaa).
   * @param {string|Date} dateInput
   * @returns {string}
   */
  function formatDate(dateInput) {
    if (!dateInput) return '-';
    return new Date(dateInput).toLocaleDateString('pt-BR');
  }

  /**
   * Capitaliza a primeira letra de uma string.
   * @param {string} str
   * @returns {string}
   */
  function capitalize(str) {
    if (!str) return '';
    return String(str).charAt(0).toUpperCase() + String(str).slice(1);
  }

  /**
   * Debounce: atrasa a execução de uma função.
   * @param {Function} fn
   * @param {number} delay ms
   * @returns {Function}
   */
  function debounce(fn, delay) {
    var timer;
    return function () {
      var args = arguments;
      var ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, delay);
    };
  }

  window.HospedahUtils = {
    money: money,
    escapeHtml: escapeHtml,
    escapeAttr: escapeAttr,
    setText: setText,
    setMessage: setMessage,
    isValidEmail: isValidEmail,
    formatDate: formatDate,
    capitalize: capitalize,
    debounce: debounce
  };
})();
