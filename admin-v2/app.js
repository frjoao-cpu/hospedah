'use strict';

(function () {
  var pages = {
    dashboard: { title: 'Resumo Geral', subtitle: 'Visão consolidada dos indicadores principais.' },
    caixa: { title: 'Controle de Caixa', subtitle: 'Entradas, saídas e saldo financeiro da operação.' },
    fluxo: { title: 'Fluxo de Caixa Mensal', subtitle: 'Acompanhamento do fluxo por competência mensal.' },
    cobrancas: { title: 'Cobranças', subtitle: 'Gestão de cobranças, vencimentos e recebimentos.' },
    reservas: { title: 'Reservas', subtitle: 'Gestão completa de reservas e comissões.' },
    'captacao-resumo': { title: 'Captações', subtitle: 'Resumo e gestão completa de captações.' },
    'cotas-vendas': { title: 'Vendas de Cotas', subtitle: 'Operação de vendas, margens e resultados.' },
    calendario: { title: 'Calendário', subtitle: 'Disponibilidade, bloqueios e períodos.' },
    'reservas-hospede': { title: 'Solicitações', subtitle: 'Solicitações de reserva dos hóspedes.' },
    'visitas-site': { title: 'Visitas ao Site', subtitle: 'Métricas de visitas e desempenho do site.' },
    'moderacao-avaliacoes': { title: 'Avaliações', subtitle: 'Moderação e acompanhamento de avaliações.' },
    'fidelidade-admin': { title: 'Fidelidade', subtitle: 'Gestão completa do programa de fidelidade.' },
    graficos: { title: 'Relatórios', subtitle: 'Gráficos, análises e visão de resultados.' },
    automacoes: { title: 'Automações', subtitle: 'Fluxos automáticos e produtividade operacional.' },
    'config-ia': { title: 'Concierge IA', subtitle: 'Configuração e monitoramento da IA concierge.' }
  };

  var navItems = Array.prototype.slice.call(document.querySelectorAll('.nav-item'));
  var pageTitle = document.getElementById('pageTitle');
  var pageSubtitle = document.getElementById('pageSubtitle');
  var crumbTitle = document.getElementById('crumbTitle');
  var sidebar = document.getElementById('sidebar');
  var mobileMenu = document.getElementById('mobileMenu');
  var refreshBtn = document.getElementById('refreshBtn');
  var frame = document.getElementById('systemMirrorFrame');
  var baseSrc = '/sistema.html?v=20261125d';

  function setPage(target, forceReload) {
    if (!pages[target]) return;

    navItems.forEach(function (item) {
      var active = item.getAttribute('data-target') === target;
      item.classList.toggle('active', active);
      item.setAttribute('aria-current', active ? 'page' : 'false');
    });

    pageTitle.textContent = pages[target].title;
    pageSubtitle.textContent = pages[target].subtitle;
    crumbTitle.textContent = pages[target].title;

    var nextSrc = baseSrc + '#' + target;
    if (forceReload || !frame.src || frame.src.indexOf('#' + target) === -1) {
      frame.src = nextSrc;
    } else {
      try {
        frame.contentWindow.location.hash = target;
      } catch (e) {
        frame.src = nextSrc;
      }
    }

    window.location.hash = target;
    if (window.innerWidth <= 720) sidebar.classList.remove('open');
  }

  navItems.forEach(function (item) {
    item.addEventListener('click', function () {
      setPage(item.getAttribute('data-target'), false);
    });
  });

  if (mobileMenu) {
    mobileMenu.addEventListener('click', function () {
      sidebar.classList.toggle('open');
    });

    document.addEventListener('click', function (event) {
      if (window.innerWidth > 720) return;
      if (event.target === mobileMenu || mobileMenu.contains(event.target)) return;
      if (event.target === sidebar || sidebar.contains(event.target)) return;
      sidebar.classList.remove('open');
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
      var active = document.querySelector('.nav-item.active');
      var target = active ? active.getAttribute('data-target') : 'dashboard';
      setPage(target, true);
    });
  }

  var fromHash = (window.location.hash || '').replace('#', '');
  setPage(pages[fromHash] ? fromHash : 'dashboard', true);
}());
