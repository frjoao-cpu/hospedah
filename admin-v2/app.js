'use strict';

(function () {
  var pages = {
    dashboard: {
      title: 'Resumo Geral',
      subtitle: 'Acompanhe os principais indicadores da operação HOSPEDAH.'
    },
    caixa: {
      title: 'Controle de Caixa',
      subtitle: 'Registre lançamentos e acompanhe a saúde financeira diária.'
    },
    fluxo: {
      title: 'Fluxo de Caixa Mensal',
      subtitle: 'Visualize entradas, saídas e saldo acumulado por competência.'
    },
    cobrancas: {
      title: 'Cobranças',
      subtitle: 'Gerencie vencimentos, recebimentos e alertas de inadimplência.'
    },
    reservas: {
      title: 'Reservas',
      subtitle: 'Operação de reservas com cálculo rápido de comissão e resultado.'
    },
    captacoes: {
      title: 'Captações',
      subtitle: 'Controle de proprietários, custos de captação e repasses.'
    },
    cotas: {
      title: 'Vendas de Cotas',
      subtitle: 'Acompanhe margens, compradores, vendedores e comissões.'
    },
    calendario: {
      title: 'Calendário',
      subtitle: 'Central de disponibilidade, bloqueios e compromissos operacionais.'
    },
    solicitacoes: {
      title: 'Solicitações',
      subtitle: 'Demandas de hóspedes e leads aguardando tratamento.'
    },
    visitas: {
      title: 'Visitas ao Site',
      subtitle: 'Indicadores de tráfego e desempenho de aquisição.'
    },
    avaliacoes: {
      title: 'Avaliações',
      subtitle: 'Fila de moderação e qualidade de atendimento.'
    },
    fidelidade: {
      title: 'Fidelidade',
      subtitle: 'Gestão de pontos, benefícios e recorrência de hóspedes.'
    },
    relatorios: {
      title: 'Relatórios',
      subtitle: 'Indicadores consolidados de resultado e eficiência.'
    },
    automacoes: {
      title: 'Automações',
      subtitle: 'Régua operacional e gatilhos automáticos do sistema.'
    },
    concierge: {
      title: 'Concierge IA',
      subtitle: 'Configuração e monitoramento do atendimento inteligente.'
    }
  };

  var navItems = Array.prototype.slice.call(document.querySelectorAll('.nav-item'));
  var pageBlocks = Array.prototype.slice.call(document.querySelectorAll('.page'));
  var pageTitle = document.getElementById('pageTitle');
  var pageSubtitle = document.getElementById('pageSubtitle');
  var crumbTitle = document.getElementById('crumbTitle');
  var sidebar = document.getElementById('sidebar');
  var mobileMenu = document.getElementById('mobileMenu');
  var refreshBtn = document.getElementById('refreshBtn');
  var quickReserve = document.getElementById('quickReserve');
  var notice = document.getElementById('demoNotice');

  function setPage(page) {
    if (!pages[page]) return;

    navItems.forEach(function (item) {
      var active = item.getAttribute('data-page') === page;
      item.classList.toggle('active', active);
      item.setAttribute('aria-current', active ? 'page' : 'false');
    });

    pageBlocks.forEach(function (block) {
      block.classList.toggle('active', block.id === 'page-' + page);
    });

    pageTitle.textContent = pages[page].title;
    pageSubtitle.textContent = pages[page].subtitle;
    crumbTitle.textContent = pages[page].title;
    window.location.hash = page;

    if (window.innerWidth <= 720) {
      sidebar.classList.remove('open');
    }
  }

  function bindNavigation() {
    navItems.forEach(function (item) {
      item.addEventListener('click', function () {
        setPage(item.getAttribute('data-page'));
      });
    });

    Array.prototype.slice.call(document.querySelectorAll('[data-page]')).forEach(function (item) {
      if (item.classList.contains('nav-item')) return;
      item.addEventListener('click', function () {
        setPage(item.getAttribute('data-page'));
      });
    });
  }

  function bindMobileMenu() {
    if (!mobileMenu) return;
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

  function bindCalculator() {
    var total = document.getElementById('total');
    var percent = document.getElementById('percent');
    var commission = document.getElementById('commission');
    if (!total || !percent || !commission) return;

    function calc() {
      var totalVal = parseFloat(total.value) || 0;
      var percentVal = parseFloat(percent.value) || 0;
      var result = totalVal * (percentVal / 100);
      commission.textContent = result.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      });
    }

    total.addEventListener('input', calc);
    percent.addEventListener('input', calc);
    calc();
  }

  function bindHeaderActions() {
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        var now = new Date();
        var time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        notice.textContent = 'Demonstração atualizada às ' + time + '. Integração com Supabase será ligada na próxima etapa.';
      });
    }

    if (quickReserve) {
      quickReserve.addEventListener('click', function () {
        setPage('reservas');
      });
    }
  }

  function initFromHash() {
    var fromHash = (window.location.hash || '').replace('#', '');
    if (pages[fromHash]) setPage(fromHash);
    else setPage('dashboard');
  }

  bindNavigation();
  bindMobileMenu();
  bindCalculator();
  bindHeaderActions();
  initFromHash();
}());
