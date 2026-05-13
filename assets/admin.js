(function () {
  'use strict';

  var state = {
    client: null,
    charts: [],
    leads: []
  };

  function getClient() {
    if (state.client) return state.client;
    if (!window.supabase || !window.HOSPEDAH_SB_URL || !window.HOSPEDAH_SB_ANON) {
      throw new Error('Supabase indisponível.');
    }
    state.client = window.supabase.createClient(window.HOSPEDAH_SB_URL, window.HOSPEDAH_SB_ANON);
    return state.client;
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = String(value);
  }

  function getLast7Days() {
    var labels = [];
    var today = new Date();
    for (var i = 6; i >= 0; i--) {
      var d = new Date(today);
      d.setDate(today.getDate() - i);
      labels.push((d.getDate() + '').padStart(2, '0') + '/' + ((d.getMonth() + 1) + '').padStart(2, '0'));
    }
    return labels;
  }

  async function ensureAdmin() {
    var sb = getClient();
    var sessionData = await sb.auth.getSession();
    var session = sessionData && sessionData.data ? sessionData.data.session : null;

    if (!session) {
      window.location.replace('/portal/index.html?next=' + encodeURIComponent('/admin/index.html'));
      return null;
    }

    var user = session.user || {};
    var role = (user.app_metadata && user.app_metadata.role) || (user.user_metadata && user.user_metadata.role) || 'guest';

    if (role !== 'admin') {
      setText('adminRoleNotice', 'Acesso em modo leitura (perfil não admin).');
    }

    setText('adminUser', user.email || 'admin@hospedah.tur.br');
    return session;
  }

  async function fetchKpi(tableName) {
    var sb = getClient();
    try {
      var result = await sb.from(tableName).select('*', { count: 'exact', head: true });
      if (result.error) throw result.error;
      return result.count || 0;
    } catch (error) {
      return 0;
    }
  }

  async function loadKpis() {
    var values = await Promise.all([
      fetchKpi('leads'),
      fetchKpi('reservas'),
      fetchKpi('usuarios'),
      fetchKpi('atividade_publica')
    ]);

    setText('kpiLeads', values[0]);
    setText('kpiReservas', values[1]);
    setText('kpiClientes', values[2]);
    setText('kpiAtividade', values[3]);
  }

  function createChart(canvasId, label, data, color) {
    if (!window.Chart) return;
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;

    var chart = new window.Chart(canvas, {
      type: 'line',
      data: {
        labels: getLast7Days(),
        datasets: [{
          label: label,
          data: data,
          borderColor: color,
          backgroundColor: color + '33',
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        plugins: { legend: { labels: { color: '#d9e2f5' } } },
        scales: {
          y: { ticks: { color: '#9ca9c2' }, grid: { color: 'rgba(255,255,255,0.1)' } },
          x: { ticks: { color: '#9ca9c2' }, grid: { color: 'rgba(255,255,255,0.07)' } }
        }
      }
    });

    state.charts.push(chart);
  }

  async function loadCharts() {
    state.charts.forEach(function (chart) { chart.destroy(); });
    state.charts = [];

    var leadsData = [6, 9, 8, 11, 14, 13, 16];
    var reservasData = [2, 4, 5, 6, 4, 7, 9];

    createChart('chartLeads', 'Leads (7 dias)', leadsData, '#D4AF37');
    createChart('chartReservas', 'Reservas (7 dias)', reservasData, '#4DD0E1');
  }

  function appendLead(lead) {
    var list = document.getElementById('leadsFeed');
    if (!list) return;

    var item = document.createElement('li');
    var name = lead.nome || lead.name || 'Lead';
    var city = lead.cidade || lead.city || 'Cidade não informada';
    var createdAt = lead.criado_em || lead.created_at || new Date().toISOString();
    item.textContent = name + ' • ' + city + ' • ' + new Date(createdAt).toLocaleString('pt-BR');

    list.prepend(item);
    while (list.children.length > 15) {
      list.removeChild(list.lastChild);
    }
  }

  async function loadCrmTable() {
    var body = document.getElementById('crmTableBody');
    if (!body) return;

    var rows = [];
    var sb = getClient();

    try {
      var result = await sb.from('leads').select('nome,email,telefone,status,created_at').order('created_at', { ascending: false }).limit(50);
      if (result.error) throw result.error;
      rows = result.data || [];
    } catch (error) {
      rows = [
        { nome: 'Lead Exemplo', email: 'lead@exemplo.com', telefone: '(17) 99999-9999', status: 'novo', created_at: new Date().toISOString() }
      ];
    }

    state.leads = rows;
    body.innerHTML = rows.map(function (row) {
      return '<tr>' +
        '<td>' + (row.nome || '-') + '</td>' +
        '<td>' + (row.email || '-') + '</td>' +
        '<td>' + (row.telefone || '-') + '</td>' +
        '<td>' + (row.status || '-') + '</td>' +
        '<td>' + new Date(row.created_at || Date.now()).toLocaleDateString('pt-BR') + '</td>' +
      '</tr>';
    }).join('');
  }

  function setupRealtimeFeed() {
    var sb = getClient();
    sb
      .channel('admin-leads-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, function (payload) {
        appendLead(payload.new || {});
      })
      .subscribe();
  }

  function exportCsv() {
    var rows = state.leads;
    var headers = ['nome', 'email', 'telefone', 'status', 'created_at'];
    var csv = [headers.join(',')].concat(rows.map(function (row) {
      return headers.map(function (key) {
        var value = row[key] == null ? '' : String(row[key]);
        return '"' + value.replace(/"/g, '""') + '"';
      }).join(',');
    })).join('\n');

    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'crm-hospedah.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function setupActions() {
    var csvButton = document.getElementById('btnExportCsv');
    var logoutButton = document.getElementById('btnAdminLogout');

    if (csvButton) csvButton.addEventListener('click', exportCsv);
    if (logoutButton) {
      logoutButton.addEventListener('click', async function () {
        var sb = getClient();
        await sb.auth.signOut();
        window.location.assign('/portal/index.html');
      });
    }
  }

  document.addEventListener('DOMContentLoaded', async function () {
    try {
      var session = await ensureAdmin();
      if (!session) return;
      setupActions();
      await Promise.all([loadKpis(), loadCrmTable()]);
      loadCharts();
      setupRealtimeFeed();
      state.leads.slice(0, 5).forEach(appendLead);
    } catch (error) {
      setText('adminRoleNotice', error.message || 'Erro ao carregar dashboard.');
    }
  });
})();
