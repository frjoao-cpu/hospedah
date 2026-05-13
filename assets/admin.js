(function () {
  'use strict';

  function createClient() {
    return window.supabase.createClient(window.HOSPEDAH_SB_URL, window.HOSPEDAH_SB_ANON);
  }

  var client;
  var CRM_FETCH_LIMIT = 100;
  var crmData = [];
  var bookingsChart;
  var leadSourceChart;
  var BOOKED_STATUSES = ['booked', 'reservado'];
  var FALLBACK_LEADS = [
    { name: 'Maria Souza', email: 'maria@example.com', phone: '(17) 99999-0001', source: 'WhatsApp', status: 'reservado', created_at: new Date().toISOString(), revenue: 5400 },
    { name: 'Pedro Lima', email: 'pedro@example.com', phone: '(11) 98888-0002', source: 'Site', status: 'novo', created_at: new Date().toISOString(), revenue: 0 },
    { name: 'Carla Nunes', email: 'carla@example.com', phone: '(21) 97777-0003', source: 'Instagram', status: 'negociação', created_at: new Date().toISOString(), revenue: 0 }
  ];

  function money(value) {
    return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function renderCrmTable(rows) {
    var tbody = document.getElementById('crmTableBody');
    if (!tbody) return;
    tbody.innerHTML = rows.map(function (lead) {
      return '<tr>' +
        '<td>' + (lead.name || '-') + '</td>' +
        '<td>' + (lead.email || '-') + '</td>' +
        '<td>' + (lead.phone || '-') + '</td>' +
        '<td>' + (lead.source || '-') + '</td>' +
        '<td>' + (lead.status || 'novo') + '</td>' +
        '<td>' + new Date(lead.created_at || Date.now()).toLocaleDateString('pt-BR') + '</td>' +
        '</tr>';
    }).join('');
  }

  function updateKpis(rows) {
    var leadsToday = rows.filter(function (lead) {
      var date = new Date(lead.created_at || Date.now());
      var now = new Date();
      return date.toDateString() === now.toDateString();
    }).length;
    var bookings = rows.filter(function (lead) { return BOOKED_STATUSES.indexOf(lead.status) !== -1; }).length;
    var conversion = rows.length ? (bookings / rows.length) * 100 : 0;
    var revenue = rows.reduce(function (total, lead) {
      return total + Number(lead.revenue || 0);
    }, 0);

    setText('kpiLeads', String(leadsToday));
    setText('kpiBookings', String(bookings));
    setText('kpiConversion', conversion.toFixed(1) + '%');
    setText('kpiRevenue', money(revenue));
  }

  function renderCharts(rows) {
    if (!window.Chart) return;

    var monthMap = {};
    var sourceMap = {};
    rows.forEach(function (row) {
      var date = new Date(row.created_at || Date.now());
      var month = date.toLocaleString('pt-BR', { month: 'short' });
      monthMap[month] = (monthMap[month] || 0) + (BOOKED_STATUSES.indexOf(row.status) !== -1 ? 1 : 0);
      var source = row.source || 'Direto';
      sourceMap[source] = (sourceMap[source] || 0) + 1;
    });

    var monthLabels = Object.keys(monthMap);
    var monthValues = monthLabels.map(function (key) { return monthMap[key]; });
    var sourceLabels = Object.keys(sourceMap);
    var sourceValues = sourceLabels.map(function (key) { return sourceMap[key]; });

    if (bookingsChart) bookingsChart.destroy();
    if (leadSourceChart) leadSourceChart.destroy();

    var bookingsCtx = document.getElementById('bookingsChart');
    var sourceCtx = document.getElementById('leadSourceChart');

    if (bookingsCtx) {
      bookingsChart = new window.Chart(bookingsCtx, {
        type: 'line',
        data: {
          labels: monthLabels,
          datasets: [{ label: 'Reservas', data: monthValues, borderColor: '#D4AF37', backgroundColor: 'rgba(212,175,55,.2)', tension: 0.3, fill: true }]
        },
        options: { plugins: { legend: { labels: { color: '#f5f8ff' } } }, scales: { x: { ticks: { color: '#dbe5ff' } }, y: { ticks: { color: '#dbe5ff' } } } }
      });
    }

    if (sourceCtx) {
      leadSourceChart = new window.Chart(sourceCtx, {
        type: 'doughnut',
        data: {
          labels: sourceLabels,
          datasets: [{ data: sourceValues, backgroundColor: ['#D4AF37', '#3ea6ff', '#30d69e', '#d17aff'] }]
        },
        options: { plugins: { legend: { labels: { color: '#f5f8ff' } } } }
      });
    }
  }

  function exportCsv() {
    if (!crmData.length) return;
    var header = ['Nome', 'Email', 'Telefone', 'Origem', 'Status', 'Data'];
    var rows = crmData.map(function (lead) {
      return [lead.name || '', lead.email || '', lead.phone || '', lead.source || '', lead.status || '', lead.created_at || ''];
    });
    var csv = [header].concat(rows).map(function (cols) {
      return cols.map(function (value) { return '"' + String(value).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\n');

    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'crm-leads-hospedah.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  function setRealtimeStatus(text) {
    var el = document.getElementById('realtimeStatus');
    if (el) el.textContent = text;
  }

  async function loadLeads() {
    var rows = [];
    try {
      var response = await client.from('leads').select('name,email,phone,source,status,created_at,revenue').order('created_at', { ascending: false }).limit(CRM_FETCH_LIMIT);
      if (!response.error && response.data) rows = response.data;
    } catch (err) {
      rows = [];
    }

    if (!rows.length) {
      rows = FALLBACK_LEADS;
    }

    crmData = rows;
    renderCrmTable(rows);
    updateKpis(rows);
    renderCharts(rows);
  }

  function initRealtime() {
    try {
      var channel = client.channel('admin-leads-live');
      channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, function () {
          setRealtimeStatus('Realtime: novo evento recebido em ' + new Date().toLocaleTimeString('pt-BR'));
          loadLeads();
        })
        .subscribe(function (status) {
          setRealtimeStatus('Realtime: ' + status);
        });
    } catch (err) {
      setRealtimeStatus('Realtime indisponível neste ambiente.');
    }
  }

  async function enforceAdmin() {
    var sessionResponse = await client.auth.getSession();
    var user = sessionResponse && sessionResponse.data && sessionResponse.data.session && sessionResponse.data.session.user;
    if (!user) {
      window.location.replace('/portal/index.html');
      return null;
    }

    try {
      var roleResponse = await client.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (roleResponse.error) return user;
      var role = roleResponse.data && roleResponse.data.role;
      if (role && role !== 'admin') {
        window.location.replace('/portal/dashboard.html');
        return null;
      }
    } catch (err) {
      return user;
    }

    return user;
  }

  async function init() {
    client = createClient();
    var user = await enforceAdmin();
    if (!user) return;

    var logout = document.getElementById('adminLogout');
    var exportBtn = document.getElementById('exportCsv');

    if (logout) {
      logout.addEventListener('click', async function () {
        await client.auth.signOut();
        window.location.replace('/portal/index.html');
      });
    }

    if (exportBtn) {
      exportBtn.addEventListener('click', exportCsv);
    }

    await loadLeads();
    initRealtime();
  }

  document.addEventListener('DOMContentLoaded', function () {
    init().catch(function () {
      setRealtimeStatus('Falha ao carregar painel.');
    });
  });
})();
