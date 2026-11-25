'use strict';

(function () {
  var SUPABASE_URL = 'https://ydrmjoppjxtmnwtvtinb.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlkcm1qb3Bwanh0bW53dHZ0aW5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNzA3MzksImV4cCI6MjA5MTg0NjczOX0.Gp4ed332v62sC5e5GXXbPqOIBNpS4EzMCFawnBJE_Cw';
  var STORAGE_KEY_RESERVAS = 'hospeda_reservas';
  var STORAGE_KEY_CAIXA = 'hospeda_caixa';

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
  var authStatus = document.getElementById('authStatus');
  var authBtn = document.getElementById('authBtn');
  var authOverlay = document.getElementById('authOverlay');
  var authEmail = document.getElementById('authEmail');
  var authPassword = document.getElementById('authPassword');
  var authSubmitBtn = document.getElementById('authSubmitBtn');
  var authCancelBtn = document.getElementById('authCancelBtn');
  var authError = document.getElementById('authError');
  var supabaseClient = null;

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
        loadDashboardData(true);
      });
    }

    if (quickReserve) {
      quickReserve.addEventListener('click', function () {
        setPage('reservas');
      });
    }

    if (authBtn) {
      authBtn.addEventListener('click', function () {
        if (!supabaseClient) return;
        if (authBtn.getAttribute('data-auth') === 'logged') {
          supabaseClient.auth.signOut().then(function () {
            updateAuthUi(null);
            loadDashboardData(false);
          });
          return;
        }
        openAuthOverlay();
      });
    }

    if (authCancelBtn) {
      authCancelBtn.addEventListener('click', function () {
        closeAuthOverlay();
      });
    }

    if (authSubmitBtn) {
      authSubmitBtn.addEventListener('click', function () {
        submitAuthLogin();
      });
    }

    if (authPassword) {
      authPassword.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') submitAuthLogin();
      });
    }
  }

  function fmtMoney(value) {
    return Number(value || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  }

  function fmtDate(value) {
    if (!value) return '—';
    var dt = new Date(value + 'T00:00:00');
    if (isNaN(dt.getTime())) {
      var dt2 = new Date(value);
      if (isNaN(dt2.getTime())) return '—';
      return dt2.toLocaleDateString('pt-BR');
    }
    return dt.toLocaleDateString('pt-BR');
  }

  function safeText(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseNumber(value) {
    if (typeof value === 'number') return isFinite(value) ? value : 0;
    if (typeof value === 'string') {
      var normalized = value.replace(/[^\d,.-]/g, '').replace(',', '.');
      var num = Number(normalized);
      return isFinite(num) ? num : 0;
    }
    return 0;
  }

  function buildStatusChip(status) {
    var s = String(status || '').toLowerCase();
    var label = s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
    return '<span class="status-chip ' + safeText(s || 'pendente') + '">' + safeText(label) + '</span>';
  }

  function getCriadoEm(item) {
    return item.criadoEm || item.criado_em || item.updated_at || item.created_at || item.entrada || '';
  }

  function updateNotice(message, type) {
    if (!notice) return;
    notice.classList.remove('success', 'error');
    if (type) notice.classList.add(type);
    notice.textContent = message;
  }

  function updateAuthUi(user) {
    if (!authBtn || !authStatus) return;
    if (user) {
      authBtn.textContent = 'Sair';
      authBtn.setAttribute('data-auth', 'logged');
      authStatus.textContent = 'Conectado: ' + (user.email || 'usuário');
      return;
    }
    authBtn.textContent = 'Entrar';
    authBtn.setAttribute('data-auth', 'logged-out');
    authStatus.textContent = 'Sistema v2';
  }

  function openAuthOverlay() {
    if (!authOverlay) return;
    authOverlay.classList.add('open');
    authOverlay.setAttribute('aria-hidden', 'false');
    if (authError) authError.textContent = '';
    if (authEmail) authEmail.focus();
  }

  function closeAuthOverlay() {
    if (!authOverlay) return;
    authOverlay.classList.remove('open');
    authOverlay.setAttribute('aria-hidden', 'true');
    if (authError) authError.textContent = '';
  }

  async function submitAuthLogin() {
    if (!supabaseClient || !authEmail || !authPassword) return;
    var email = String(authEmail.value || '').trim();
    var password = String(authPassword.value || '').trim();

    if (!email || !password) {
      if (authError) authError.textContent = 'Informe e-mail e senha.';
      return;
    }

    if (authSubmitBtn) authSubmitBtn.disabled = true;
    try {
      var result = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
      });

      if (result.error) throw result.error;
      closeAuthOverlay();
      updateAuthUi(result.data && result.data.user ? result.data.user : null);
      loadDashboardData(true);
    } catch (err) {
      if (authError) authError.textContent = 'Login inválido. Verifique e tente novamente.';
    } finally {
      if (authSubmitBtn) authSubmitBtn.disabled = false;
    }
  }

  function setMetric(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function renderRecentReservations(reservas) {
    var body = document.getElementById('dashboardRecentBody');
    if (!body) return;
    if (!reservas.length) {
      body.innerHTML = '<tr><td colspan="5">Nenhuma reserva encontrada para este usuário.</td></tr>';
      return;
    }

    body.innerHTML = reservas.slice(0, 8).map(function (r) {
      var cliente = r.cliente || r.nome_hospede || '—';
      var resort = r.resort || r.resort_nome || '—';
      var entrada = r.entrada || r.data_entrada || '';
      var valor = parseNumber(r.total !== undefined ? r.total : r.valor_total);
      var status = r.status || 'pendente';
      return '<tr>' +
        '<td>' + safeText(cliente) + '</td>' +
        '<td>' + safeText(resort) + '</td>' +
        '<td>' + safeText(fmtDate(entrada)) + '</td>' +
        '<td>' + buildStatusChip(status) + '</td>' +
        '<td>' + safeText(fmtMoney(valor)) + '</td>' +
        '</tr>';
    }).join('');
  }

  function summarizeFinance(caixa) {
    var entradas = 0;
    var saidas = 0;
    caixa.forEach(function (item) {
      var valor = parseNumber(item.valor);
      if ((item.tipo || '').toLowerCase() === 'entrada') entradas += valor;
      else saidas += valor;
    });
    return {
      entradas: entradas,
      saidas: saidas,
      saldo: entradas - saidas
    };
  }

  function readLocalArray(key) {
    try {
      var raw = window.localStorage.getItem(key);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  async function getSupabaseSessionUser() {
    var userRes = await supabaseClient.auth.getUser();
    return userRes && userRes.data ? userRes.data.user : null;
  }

  async function loadFromHospedaData(userId) {
    var res = await supabaseClient
      .from('hospeda_data')
      .select('chave,valor')
      .eq('user_id', userId)
      .in('chave', [STORAGE_KEY_RESERVAS, STORAGE_KEY_CAIXA]);

    if (res.error) throw res.error;

    var map = {};
    (res.data || []).forEach(function (row) {
      map[row.chave] = row.valor;
    });

    return {
      reservas: Array.isArray(map[STORAGE_KEY_RESERVAS]) ? map[STORAGE_KEY_RESERVAS] : [],
      caixa: Array.isArray(map[STORAGE_KEY_CAIXA]) ? map[STORAGE_KEY_CAIXA] : []
    };
  }

  async function loadFallbackReservasHospede() {
    var res = await supabaseClient
      .from('reservas_hospede')
      .select('nome_hospede,resort_nome,data_entrada,valor_total,status,criado_em')
      .order('criado_em', { ascending: false })
      .limit(20);

    if (res.error) return [];
    return res.data || [];
  }

  function updateFinancialPanel(finance) {
    var financeSummary = document.getElementById('financeSummary');
    var financePlaceholder = document.getElementById('financePlaceholder');
    if (!financeSummary || !financePlaceholder) return;

    financeSummary.textContent = 'Entradas ' + fmtMoney(finance.entradas) + ' • Saídas ' + fmtMoney(finance.saidas) + ' • Saldo ' + fmtMoney(finance.saldo) + '.';
    financePlaceholder.textContent = 'Atualizado com dados reais de caixa sincronizados.';
  }

  async function loadDashboardData(manual) {
    try {
      setMetric('metricReservas', '...');
      setMetric('metricReceita', '...');
      setMetric('metricComissaoPendente', '...');
      setMetric('metricSaldoCaixa', '...');

      var reservas = readLocalArray(STORAGE_KEY_RESERVAS);
      var caixa = readLocalArray(STORAGE_KEY_CAIXA);
      var sourceLabel = reservas.length || caixa.length ? 'dados locais do navegador' : '';

      if (!supabaseClient) {
        if (!sourceLabel) {
          updateNotice('Biblioteca do Supabase não carregou. Recarregue a página.', 'error');
          renderRecentReservations([]);
          return;
        }
      } else {
        var user = await getSupabaseSessionUser();
        if (user) {
          var storageData = await loadFromHospedaData(user.id);
          if (storageData.reservas.length || storageData.caixa.length) {
            reservas = storageData.reservas || [];
            caixa = storageData.caixa || [];
            sourceLabel = 'dados sincronizados do Supabase';
          } else if (!reservas.length) {
            reservas = await loadFallbackReservasHospede();
            sourceLabel = 'tabela reservas_hospede';
          }
        } else if (!sourceLabel) {
          updateNotice('Faça login no sistema principal (sistema.html) para carregar os resultados reais aqui.', 'error');
          renderRecentReservations([]);
          return;
        }
      }

      if (!sourceLabel) {
        updateNotice('Nenhum dado encontrado ainda. Cadastre reservas no sistema para visualizar no painel v2.', 'error');
        renderRecentReservations([]);
        return;
      }

      var receita = 0;
      var comissaoPendente = 0;

      reservas.forEach(function (r) {
        var total = parseNumber(r.total !== undefined ? r.total : r.valor_total);
        var comissaoTotal = parseNumber(r.comissao);
        var comissaoRecebida = parseNumber(r.comissaoRecebida !== undefined ? r.comissaoRecebida : r.valor_comissao_recebida);
        receita += total;
        comissaoPendente += Math.max(0, comissaoTotal - comissaoRecebida);
      });

      var finance = summarizeFinance(caixa);
      var sortedReservas = reservas.slice().sort(function (a, b) {
        return String(getCriadoEm(b)).localeCompare(String(getCriadoEm(a)));
      });

      setMetric('metricReservas', String(reservas.length));
      setMetric('metricReceita', fmtMoney(receita));
      setMetric('metricComissaoPendente', fmtMoney(comissaoPendente));
      setMetric('metricSaldoCaixa', fmtMoney(finance.saldo));

      var info = document.getElementById('metricReservasInfo');
      if (info) info.textContent = sourceLabel;

      updateFinancialPanel(finance);
      renderRecentReservations(sortedReservas);

      var when = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      updateNotice('Dados reais carregados com sucesso (' + sourceLabel + '). Última atualização às ' + when + '.', 'success');
      if (manual) {
        notice.textContent += ' Atualização manual concluída.';
      }
    } catch (err) {
      updateNotice('Não foi possível carregar os dados reais agora. Verifique sua sessão/login no Supabase.', 'error');
      renderRecentReservations([]);
    }
  }

  function initSupabase() {
    if (!window.supabase || !window.supabase.createClient) return;
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    supabaseClient.auth.getUser().then(function (userRes) {
      updateAuthUi(userRes && userRes.data ? userRes.data.user : null);
    });
    supabaseClient.auth.onAuthStateChange(function (_, session) {
      updateAuthUi(session ? session.user : null);
    });
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
  initSupabase();
  loadDashboardData(false);
}());
