(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function feedback(message, type) {
    var el = $('adminFeedback');
    if (!el) return;
    el.className = 'admin-feedback';
    if (type) el.classList.add(type);
    el.textContent = message || '';
  }

  function getSupabaseClient() {
    if (!window.supabase || !window.supabase.createClient || !window.HOSPEDAH_SB_URL || !window.HOSPEDAH_SB_ANON) {
      throw new Error('Supabase indisponível no painel admin.');
    }
    return window.supabase.createClient(window.HOSPEDAH_SB_URL, window.HOSPEDAH_SB_ANON);
  }

  var sb;
  try {
    sb = getSupabaseClient();
  } catch (err) {
    console.warn(err.message);
    feedback(err.message, 'error');
    return;
  }

  var chart;
  var allLeads = [];
  var calendarDate = new Date();

  function safeDate(value) {
    var date = new Date(value);
    if (isNaN(date.getTime())) return new Date();
    return date;
  }

  function formatBRL(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function renderKPIs(leads) {
    var now = new Date();
    var startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var startWeek = new Date(startToday);
    startWeek.setDate(startWeek.getDate() - startWeek.getDay());
    var startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    var today = 0;
    var week = 0;
    var month = 0;
    var converted = 0;

    leads.forEach(function (lead) {
      var createdAt = safeDate(lead.created_at);
      if (createdAt >= startToday) today += 1;
      if (createdAt >= startWeek) week += 1;
      if (createdAt >= startMonth) month += 1;
      if (lead.status === 'convertido') converted += 1;
    });

    $('kpiToday').textContent = String(today);
    $('kpiWeek').textContent = String(week);
    $('kpiMonth').textContent = String(month);
    var conversion = leads.length ? ((converted / leads.length) * 100).toFixed(1) : '0.0';
    $('kpiConversion').textContent = conversion + '%';
  }

  function renderChart(items) {
    var ctx = $('searchesChart');
    if (!ctx || typeof window.Chart === 'undefined') return;

    if (chart) chart.destroy();

    chart = new window.Chart(ctx, {
      type: 'bar',
      data: {
        labels: items.map(function (item) { return item.resort; }),
        datasets: [{
          label: 'Buscas',
          data: items.map(function (item) { return item.total; }),
          backgroundColor: 'rgba(212, 175, 55, 0.62)',
          borderColor: '#D4AF37',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#e8edf8' } }
        },
        scales: {
          x: { ticks: { color: '#a8b7d1' }, grid: { color: 'rgba(255,255,255,0.06)' } },
          y: { ticks: { color: '#a8b7d1' }, grid: { color: 'rgba(255,255,255,0.06)' } }
        }
      }
    });
  }

  function prependLeadFeedItem(lead) {
    var feed = $('leadsFeed');
    if (!feed) return;

    var li = document.createElement('li');
    var amount = formatBRL(lead.budget);
    var time = new Date(lead.created_at).toLocaleTimeString('pt-BR');
    li.setAttribute('aria-label', 'Lead ' + lead.name + ', resort ' + lead.resort + ', orçamento ' + amount + ', status ' + lead.status + ', recebido às ' + time);
    li.innerHTML = '<strong>' + lead.name + '</strong> <span>(' + time + ')</span><br>' +
      '<span>Resort: ' + lead.resort + '</span><br>' +
      '<span>Orçamento: ' + amount + '</span><br>' +
      '<span>Status: ' + lead.status + '</span>';
    feed.prepend(li);

    while (feed.children.length > 20) {
      feed.removeChild(feed.lastChild);
    }
  }

  function renderCRMTable(leads) {
    var tbody = $('crmTableBody');
    if (!tbody) return;

    tbody.innerHTML = leads.map(function (lead) {
      var dateText = safeDate(lead.created_at).toLocaleDateString('pt-BR');
      return '<tr data-id="' + lead.id + '">' +
        '<td data-label="Data">' + dateText + '</td>' +
        '<td data-label="Lead"><strong>' + lead.name + '</strong><br><small>' + lead.email + '</small></td>' +
        '<td data-label="Resort">' + lead.resort + '</td>' +
        '<td data-label="Canal">' + lead.channel + '</td>' +
        '<td data-label="Orçamento">' + formatBRL(lead.budget) + '</td>' +
        '<td data-label="Status">' +
          '<select class="status-select" data-lead-id="' + lead.id + '">' +
            ['novo', 'contatado', 'convertido', 'perdido'].map(function (status) {
              var selected = status === lead.status ? ' selected' : '';
              return '<option value="' + status + '"' + selected + '>' + status + '</option>';
            }).join('') +
          '</select>' +
        '</td>' +
      '</tr>';
    }).join('');

    tbody.querySelectorAll('.status-select').forEach(function (select) {
      select.addEventListener('change', function () {
        var id = select.getAttribute('data-lead-id');
        var status = select.value;
        allLeads = allLeads.map(function (lead) {
          if (String(lead.id) === String(id)) lead.status = status;
          return lead;
        });

        sb.from('leads').update({ status: status }).eq('id', id).then(function () {
          renderKPIs(allLeads);
        }).catch(function () {
          renderKPIs(allLeads);
        });
      });
    });
  }

  function applyCRMFilters() {
    var term = ($('leadSearch').value || '').toLowerCase().trim();
    var filterStatus = $('leadStatusFilter').value;

    var filtered = allLeads.filter(function (lead) {
      var hay = [lead.name, lead.email, lead.resort].join(' ').toLowerCase();
      var statusMatch = filterStatus === 'all' || lead.status === filterStatus;
      var textMatch = !term || hay.indexOf(term) !== -1;
      return statusMatch && textMatch;
    });

    renderCRMTable(filtered);
  }

  function exportCRMCSV() {
    var lines = ['data,nome,email,resort,canal,orcamento,status'];
    allLeads.forEach(function (lead) {
      var row = [
        new Date(lead.created_at).toISOString(),
        lead.name,
        lead.email,
        lead.resort,
        lead.channel,
        lead.budget,
        lead.status
      ].map(function (value) {
        var text = String(value || '').replace(/"/g, '""');
        return '"' + text + '"';
      }).join(',');
      lines.push(row);
    });

    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'hospedah-crm-leads.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function monthLabel(date) {
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }

  function renderCalendar(bookings) {
    var grid = $('calendarGrid');
    var monthLabelEl = $('calendarMonthLabel');
    if (!grid || !monthLabelEl) return;

    var year = calendarDate.getFullYear();
    var month = calendarDate.getMonth();
    var firstDay = new Date(year, month, 1);
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var offset = firstDay.getDay();

    monthLabelEl.textContent = monthLabel(calendarDate);
    grid.innerHTML = '';

    for (var i = 0; i < offset; i += 1) {
      var empty = document.createElement('div');
      empty.className = 'calendar-day';
      grid.appendChild(empty);
    }

    for (var day = 1; day <= daysInMonth; day += 1) {
      var box = document.createElement('div');
      box.className = 'calendar-day';
      var dayDate = new Date(year, month, day);
      var dayIso = dayDate.toISOString().slice(0, 10);
      var dayBookings = bookings.filter(function (item) {
        return item.checkin === dayIso;
      });

      box.innerHTML = '<strong>' + day + '</strong>';
      dayBookings.forEach(function (item) {
        var span = document.createElement('span');
        span.className = 'calendar-item';
        span.textContent = item.resort + ' • ' + item.guest;
        box.appendChild(span);
      });
      grid.appendChild(box);
    }
  }

  function setupRealtimeLeads() {
    sb.channel('admin-leads-feed').on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'leads'
    }, function (payload) {
      var lead = payload.new || {};
      lead.id = lead.id || Date.now();
      lead.name = lead.name || 'Novo lead';
      lead.email = lead.email || '-';
      lead.resort = lead.resort || 'Não informado';
      lead.channel = lead.channel || 'site';
      lead.status = lead.status || 'novo';
      lead.budget = Number(lead.budget || 0);
      lead.created_at = lead.created_at || new Date().toISOString();

      allLeads.unshift(lead);
      prependLeadFeedItem(lead);
      applyCRMFilters();
      renderKPIs(allLeads);
      feedback('Novo lead recebido em tempo real.', 'success');
    }).subscribe();
  }

  function normalizeLead(row, index) {
    return {
      id: row.id || ('mock-' + index),
      name: row.name || 'Lead ' + (index + 1),
      email: row.email || 'lead' + (index + 1) + '@email.com',
      resort: row.resort || 'Hot Beach Suites',
      channel: row.channel || 'WhatsApp',
      budget: Number(row.budget || 0),
      status: row.status || 'novo',
      created_at: row.created_at || new Date().toISOString()
    };
  }

  function getMockLeads() {
    return [
      { id: 1, name: 'Amanda Souza', email: 'amanda@email.com', resort: 'Hot Beach Suites', channel: 'Site', budget: 4200, status: 'novo', created_at: new Date().toISOString() },
      { id: 2, name: 'Carlos Mendes', email: 'carlos@email.com', resort: 'Praia de Juquehy', channel: 'WhatsApp', budget: 3800, status: 'contatado', created_at: new Date(Date.now() - 86400000).toISOString() },
      { id: 3, name: 'Lívia Rocha', email: 'livia@email.com', resort: 'Wyndham Royal Resort', channel: 'Instagram', budget: 5600, status: 'convertido', created_at: new Date(Date.now() - 2 * 86400000).toISOString() }
    ];
  }

  function getMockSearches() {
    return [
      { resort: 'Hot Beach Suites', total: 245 },
      { resort: 'Praia de Juquehy', total: 212 },
      { resort: 'Wyndham Royal Resort', total: 176 },
      { resort: 'Ipioca Beach Resort', total: 154 },
      { resort: 'Solar das Águas', total: 132 }
    ];
  }

  function getMockBookings() {
    var now = new Date();
    var base = new Date(now.getFullYear(), now.getMonth(), 5);
    var baseIso = base.toISOString().slice(0, 10);
    var plusFive = new Date(base.getTime() + 5 * 86400000).toISOString().slice(0, 10);
    var plusNine = new Date(base.getTime() + 9 * 86400000).toISOString().slice(0, 10);
    return [
      { checkin: baseIso, resort: 'Hot Beach', guest: 'Amanda' },
      { checkin: plusFive, resort: 'Juquehy', guest: 'Carlos' },
      { checkin: plusNine, resort: 'Wyndham', guest: 'Lívia' }
    ];
  }

  function ensureAdminRole() {
    return sb.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (!session || !session.user) {
        window.location.replace('/portal/index.html');
        throw new Error('Acesso restrito. Faça login.');
      }

      var user = session.user;
      var role = (user.user_metadata && user.user_metadata.role) ||
        (user.app_metadata && user.app_metadata.role) || '';

      if (String(role).toLowerCase() !== 'admin') {
        window.location.replace('/portal/dashboard.html');
        throw new Error('Acesso permitido apenas para administradores.');
      }

      $('adminIdentity').textContent = 'Administrador: ' + (user.email || 'sem e-mail');
      return user;
    });
  }

  function setupCalendarNav(bookings) {
    $('calendarPrev').addEventListener('click', function () {
      calendarDate.setMonth(calendarDate.getMonth() - 1);
      renderCalendar(bookings);
    });

    $('calendarNext').addEventListener('click', function () {
      calendarDate.setMonth(calendarDate.getMonth() + 1);
      renderCalendar(bookings);
    });
  }

  function setupInteractions(bookings) {
    $('leadSearch').addEventListener('input', applyCRMFilters);
    $('leadStatusFilter').addEventListener('change', applyCRMFilters);
    $('exportCsvBtn').addEventListener('click', exportCRMCSV);
    setupCalendarNav(bookings);

    $('adminLogoutBtn').addEventListener('click', function () {
      sb.auth.signOut().finally(function () {
        window.location.replace('/portal/index.html');
      });
    });
  }

  function loadDataAndRender() {
    var leadsPromise = sb.from('leads').select('id,name,email,resort,channel,budget,status,created_at').order('created_at', { ascending: false }).limit(200);
    var searchesPromise = sb.from('resort_buscas').select('resort,total').order('total', { ascending: false }).limit(10);
    var bookingsPromise = sb.from('reservas').select('checkin,resort,guest').order('checkin', { ascending: true }).limit(100);

    return Promise.allSettled([leadsPromise, searchesPromise, bookingsPromise]).then(function (results) {
      var leadsResult = results[0];
      var searchesResult = results[1];
      var bookingsResult = results[2];

      var leads = leadsResult.status === 'fulfilled' && leadsResult.value && leadsResult.value.data && leadsResult.value.data.length
        ? leadsResult.value.data.map(normalizeLead)
        : getMockLeads();

      var searches = searchesResult.status === 'fulfilled' && searchesResult.value && searchesResult.value.data && searchesResult.value.data.length
        ? searchesResult.value.data
        : getMockSearches();

      var bookings = bookingsResult.status === 'fulfilled' && bookingsResult.value && bookingsResult.value.data && bookingsResult.value.data.length
        ? bookingsResult.value.data
        : getMockBookings();

      allLeads = leads;
      leads.slice(0, 10).forEach(prependLeadFeedItem);
      renderKPIs(leads);
      renderChart(searches);
      renderCRMTable(leads);
      renderCalendar(bookings);
      setupInteractions(bookings);
      setupRealtimeLeads();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    ensureAdminRole().then(loadDataAndRender).catch(function (err) {
      if (err && err.message) feedback(err.message, 'error');
    });
  });
})();
