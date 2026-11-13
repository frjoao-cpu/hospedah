(function () {
  'use strict';

  function callIfFn(fnName, arg) {
    var fn = window[fnName];
    if (typeof fn !== 'function') return;
    if (typeof arg === 'undefined') fn();
    else fn(arg);
  }

  function runAction(target) {
    if (!target) return;
    var action = target.getAttribute('data-action');
    if (!action) return;

    switch (action) {
      case 'tentar-login':
        callIfFn('tentarLogin');
        break;
      case 'enviar-link-magico':
        callIfFn('enviarLinkMagico');
        break;
      case 'mostrar-view-login':
        callIfFn('mostrarViewLogin');
        break;
      case 'enviar-reset-senha':
        callIfFn('enviarResetSenha');
        break;
      case 'definir-nova-senha':
        callIfFn('definirNovaSenha');
        break;
      case 'toggle-float-calc':
        callIfFn('toggleFloatCalc');
        break;
      case 'exportar-backup':
        callIfFn('exportarBackup');
        break;
      case 'importar-backup':
        callIfFn('importarBackup');
        break;
      case 'fazer-logout':
        callIfFn('fazerLogout');
        break;
      case 'toggle-nav-dropdown':
        callIfFn('toggleNavDropdown', target.getAttribute('data-dropdown-id'));
        break;
      case 'close-nav-dropdown':
        callIfFn('fecharNavDropdown', target.getAttribute('data-dropdown-id'));
        if (target.getAttribute('data-expand-captacoes') === '1') {
          callIfFn('expandirCaptacoes');
        }
        break;
      case 'toggle-dashboard':
        callIfFn('toggleDashboard');
        break;
      case 'atualizar-dashboard':
        callIfFn('atualizarDashboard');
        break;
      case 'salvar-meta':
        callIfFn('salvarMeta');
        break;
      case 'go-to-hash': {
        var hash = target.getAttribute('data-target-hash') || '';
        if (!hash) break;
        var link = document.querySelector('a[href="' + hash + '"]');
        if (link) link.click();
        else if (hash.charAt(0) === '#') window.location.hash = hash;
        break;
      }
      case 'toggle-score-detalhe':
        callIfFn('toggleScoreDetalhe');
        break;
      case 'exportar-csv-caixa':
        callIfFn('exportarCSVCaixa');
        break;
      case 'toggle-caixa':
        callIfFn('toggleCaixa');
        break;
      case 'toggle-caixa-grafico':
        callIfFn('toggleCaixaGrafico');
        break;
      case 'abrir-caixa-max':
        callIfFn('abrirCaixaMax');
        break;
      case 'set-caixa-grafico-periodo': {
        var periodo = parseInt(target.getAttribute('data-periodo-caixa') || '', 10);
        if (!Number.isFinite(periodo)) break;
        var fn = window.setCaixaGraficoPeriodo;
        if (typeof fn === 'function') fn(periodo, target);
        break;
      }
      case 'salvar-saldo-minimo':
        callIfFn('salvarSaldoMinimo');
        break;
      case 'adicionar-lancamento-caixa':
        callIfFn('adicionarLancamentoCaixa');
        break;
      case 'limpar-form-caixa':
        callIfFn('limparFormCaixa');
        break;
      case 'limpar-filtros-caixa':
        callIfFn('limparFiltrosCaixa');
        break;
      case 'exportar-csv-fluxo-caixa':
        callIfFn('exportarCSVFluxoCaixa');
        break;
      case 'toggle-fluxo-caixa':
        callIfFn('toggleFluxoCaixa');
        break;
      case 'calc-action':
        callIfFn('calcAction', target.getAttribute('data-calc-action'));
        break;
      case 'filtrar-periodo-dash':
        callIfFn('filtrarPeriodoDash', target.getAttribute('data-period'));
        break;
      case 'exportar-dashboard':
        callIfFn('exportarDashboard');
        break;
      default:
        break;
    }
  }

  function bindActions() {
    document.addEventListener('click', function (event) {
      var target = event.target.closest('[data-action]');
      if (!target) return;
      runAction(target);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter') return;
      var target = event.target.closest('[data-enter-action]');
      if (!target) return;
      var actionTarget = document.createElement('span');
      actionTarget.setAttribute('data-action', target.getAttribute('data-enter-action'));
      runAction(actionTarget);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindActions);
  } else {
    bindActions();
  }
}());
