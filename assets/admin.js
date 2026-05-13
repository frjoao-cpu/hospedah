/* global Chart */
(function () {
  'use strict';

  var SB_URL = window.HOSPEDAH_SB_URL || 'https://ydrmjoppjxtmnwtvtinb.supabase.co';
  var SB_KEY = window.HOSPEDAH_SB_ANON || '';
  var sb = (window.supabase && SB_KEY) ? window.supabase.createClient(SB_URL, SB_KEY) : null;

  var state = {
    leads: [],
    reservas: [],
    calendarDate: new Date(),
    charts: { resorts: null, sparkline: null }
  };

  var resortColors = {
    'Hot Beach Suites': '#f59e0b',
    'São Pedro Thermas': '#3b82f6',
    'Olimpia Park': '#f97316',
    'Olimpia Park Resort': '#f97316',
    'Solar das Águas': '#22c55e',
    'Wyndham Royal': '#eab308',
    'Wyndham Royal Resort': '#eab308',
    'Praia de Juquehy': '#06b6d4',
    'Ipioca Beach Resort': '#10b981',
    'Porto 2 Life': '#a855f7'
  };

  function $(id) { return document.getElementById(id); }

  function startOfDay(date) {
    var d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function startOfWeek(date) {
    var d = startOfDay(date);
    d.setDate(d.getDate() - d.getDay());
    return d;
  }

  function startOfMonth(date) {
    var d = startOfDay(date);
    d.setDate(1);
    return d;
  }

  function formatDate(value) {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('pt-BR');
  }

  function showToast(message) {
    var container = $('adminToastContainer');
    if (!container) return;
    var toast = document.createElement('div');
    toast.className = 'admin-toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4500);
  }

  function playNotification() {
    var enabled = $('leadSoundToggle') && $('leadSoundToggle').checked;
    if (!enabled || !window.AudioContext) return;
    try {
      var audioCtx = new window.AudioContext();
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.001, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, audioCtx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch (err) {
      console.warn('Falha ao tocar notificação:', err);
    }
  }

  function setSection(section) {
    document.querySelectorAll('.nav-item[data-section]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-section') === section);
    });
    document.querySelectorAll('.admin-section').forEach(function (sec) {
      sec.classList.toggle('active', sec.id === ('section-' + section));
    });
  }

  async function validateAdminAccess() {
    if (!sb) {
      showToast('Supabase não configurado. Carregando modo visual.');
      return;
    }

    try {
      var auth = await sb.auth.getUser();
      if (!auth || !auth.data || !auth.data.user) {
        showToast('Faça login para acessar o painel admin.');
        return;
      }
      var roleRes = await sb.from('perfis').select('role').eq('id', auth.data.user.id).maybeSingle();
      if (!roleRes.error && roleRes.data && roleRes.data.role !== 'admin') {
        showToast('Acesso restrito: role admin obrigatória.');
      }
    } catch (err) {
      console.warn('Não foi possível validar role admin:', err);
    }
  }

  async function loadLeads() {
    if (!sb) {
      state.leads = [];
      renderLeads();
      renderDashboard();
      return;
    }

    try {
      var res = await sb
        .from('abandono_reserva')
        .select('id, nome, whatsapp, resort_nome, data_entrada, data_saida, status, criado_em')
        .order('criado_em', { ascending: false })
        .limit(500);

      if (res.error) throw res.error;

      state.leads = (res.data || []).map(function (lead) {
        return {
          id: lead.id,
          nome: lead.nome || 'Lead sem nome',
          whatsapp: lead.whatsapp || '-',
          resort: lead.resort_nome || 'Não informado',
          dataEntrada: lead.data_entrada || null,
          dataSaida: lead.data_saida || null,
          status: (lead.status || 'novo').toLowerCase(),
          criadoEm: lead.criado_em
        };
      });
    } catch (err) {
      console.warn('Erro ao carregar leads:', err);
      showToast('Erro ao carregar leads do Supabase.');
      state.leads = [];
    }

    renderLeads();
    renderDashboard();
    fillFilterOptions();
  }

  async function loadReservas() {
    if (!sb) {
      state.reservas = [];
      renderReservas();
      renderCalendar();
      return;
    }

    try {
      var reservasRes = await sb
        .from('reservas')
        .select('id, nome, resort, checkin, checkout, status')
        .order('checkin', { ascending: false })
        .limit(500);

      if (reservasRes.error) throw reservasRes.error;

      state.reservas = (reservasRes.data || []).map(function (reserva) {
        return {
          id: reserva.id,
          cliente: reserva.nome || 'Cliente',
          resort: reserva.resort || 'Não informado',
          checkin: reserva.checkin,
          checkout: reserva.checkout,
          status: (reserva.status || 'confirmada').toLowerCase()
        };
      });
    } catch (reservasErr) {
      console.warn('Tabela reservas indisponível, aplicando fallback:', reservasErr);
      try {
        var fallbackRes = await sb
          .from('atividade_publica')
          .select('id, resort_nome, criado_em, cidade_hospede')
          .order('criado_em', { ascending: false })
          .limit(200);

        if (fallbackRes.error) throw fallbackRes.error;

        state.reservas = (fallbackRes.data || []).map(function (item) {
          var created = item.criado_em ? new Date(item.criado_em) : new Date();
          var checkout = new Date(created);
          checkout.setDate(created.getDate() + 3);
          return {
            id: item.id,
            cliente: item.cidade_hospede || 'Cliente HOSPEDAH',
            resort: item.resort_nome || 'Não informado',
            checkin: created.toISOString(),
            checkout: checkout.toISOString(),
            status: 'confirmada'
          };
        });
      } catch (fallbackErr) {
        console.warn('Erro ao carregar reservas fallback:', fallbackErr);
        state.reservas = [];
      }
    }

    renderReservas();
    renderCalendar();
    fillFilterOptions();
  }

  function conversionForDay(dayOffset) {
    var target = startOfDay(new Date());
    target.setDate(target.getDate() - dayOffset);
    var next = new Date(target);
    next.setDate(next.getDate() + 1);

    var leads = state.leads.filter(function (lead) {
      var date = new Date(lead.criadoEm);
      return date >= target && date < next;
    });

    if (!leads.length) return 0;
    var converted = leads.filter(function (lead) { return lead.status === 'reservado'; }).length;
    return Math.round((converted / leads.length) * 100);
  }

  function renderDashboard() {
    var now = new Date();
    var totalHoje = state.leads.filter(function (lead) { return new Date(lead.criadoEm) >= startOfDay(now); }).length;
    var totalSemana = state.leads.filter(function (lead) { return new Date(lead.criadoEm) >= startOfWeek(now); }).length;
    var totalMes = state.leads.filter(function (lead) { return new Date(lead.criadoEm) >= startOfMonth(now); }).length;
    var totalConvertidos = state.leads.filter(function (lead) { return lead.status === 'reservado'; }).length;
    var conversao = state.leads.length ? Math.round((totalConvertidos / state.leads.length) * 100) : 0;

    $('kpiHoje').textContent = String(totalHoje);
    $('kpiSemana').textContent = String(totalSemana);
    $('kpiMes').textContent = String(totalMes);
    $('kpiConversao').textContent = conversao + '%';

    renderSparkline();
    renderResortsChart();
    renderHeatmap();
    renderLiveFeed();
  }

  function renderSparkline() {
    var ctx = $('conversaoSparkline');
    if (!ctx || !window.Chart) return;

    var data = [];
    for (var i = 6; i >= 0; i -= 1) data.push(conversionForDay(i));

    if (state.charts.sparkline) state.charts.sparkline.destroy();

    state.charts.sparkline = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['-6d', '-5d', '-4d', '-3d', '-2d', '-1d', 'Hoje'],
        datasets: [{
          data: data,
          borderColor: '#d4af37',
          backgroundColor: 'rgb(212 175 55 / 20%)',
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 0
        }]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { display: false }, y: { display: false, min: 0, max: 100 } }
      }
    });
  }

  function renderResortsChart() {
    var ctx = $('resortsChart');
    if (!ctx || !window.Chart) return;

    var grouped = {};
    state.leads.forEach(function (lead) { grouped[lead.resort] = (grouped[lead.resort] || 0) + 1; });

    var ordered = Object.keys(grouped).map(function (resort) {
      return { resort: resort, total: grouped[resort] };
    }).sort(function (a, b) {
      return b.total - a.total;
    }).slice(0, 7);

    if (state.charts.resorts) state.charts.resorts.destroy();

    state.charts.resorts = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ordered.map(function (item) { return item.resort; }),
        datasets: [{
          label: 'Buscas',
          data: ordered.map(function (item) { return item.total; }),
          backgroundColor: ordered.map(function (item) { return resortColors[item.resort] || '#d4af37'; })
        }]
      },
      options: {
        animation: false,
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#c7d4ef', maxRotation: 0, autoSkip: true } },
          y: { ticks: { color: '#c7d4ef', precision: 0 }, grid: { color: 'rgb(255 255 255 / 8%)' } }
        }
      }
    });
  }

  function renderHeatmap() {
    var heatmapEl = $('heatmap');
    if (!heatmapEl) return;
    heatmapEl.innerHTML = '';

    var hours = [8, 10, 12, 14, 16, 18, 20, 22];
    var weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    var counts = {};

    state.leads.forEach(function (lead) {
      var date = new Date(lead.criadoEm);
      var day = date.getDay();
      var hour = date.getHours();
      var nearest = hours.reduce(function (prev, curr) {
        return Math.abs(curr - hour) < Math.abs(prev - hour) ? curr : prev;
      }, hours[0]);
      var key = day + '-' + nearest;
      counts[key] = (counts[key] || 0) + 1;
    });

    var values = Object.values(counts);
    var max = values.length ? values.reduce(function (acc, val) { return val > acc ? val : acc; }, 1) : 1;

    weekDays.forEach(function (dayLabel, dayIndex) {
      hours.forEach(function (hour) {
        var key = dayIndex + '-' + hour;
        var val = counts[key] || 0;
        var alpha = (val / max) * 0.9 + 0.1;

        var cell = document.createElement('div');
        cell.className = 'heat-cell';
        cell.style.background = 'rgb(212 175 55 / ' + alpha.toFixed(2) + ')';
        cell.title = dayLabel + ' às ' + hour + 'h: ' + val + ' contato(s)';
        cell.textContent = val ? String(val) : '·';
        heatmapEl.appendChild(cell);
      });
    });
  }

  function renderLiveFeed() {
    var ul = $('liveFeed');
    if (!ul) return;
    ul.innerHTML = '';
    state.leads.slice(0, 10).forEach(function (lead) {
      var li = document.createElement('li');
      li.textContent = lead.nome + ' solicitou ' + lead.resort + ' em ' + formatDate(lead.criadoEm) + '.';
      ul.appendChild(li);
    });
  }

  function filteredLeads() {
    var search = ($('leadSearch').value || '').toLowerCase().trim();
    var resort = $('leadFilterResort').value;
    var status = $('leadFilterStatus').value;
    var date = $('leadFilterDate').value;

    return state.leads.filter(function (lead) {
      var hitSearch = !search || lead.nome.toLowerCase().includes(search) || String(lead.whatsapp).toLowerCase().includes(search);
      var hitResort = !resort || lead.resort === resort;
      var hitStatus = !status || lead.status === status;
      var hitDate = true;
      if (date) hitDate = new Date(lead.criadoEm).toISOString().slice(0, 10) === date;
      return hitSearch && hitResort && hitStatus && hitDate;
    });
  }

  function statusBadge(status) {
    var safe = status || 'novo';
    return '<span class="status-badge status-' + safe + '">' + safe + '</span>';
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderLeads() {
    var tbody = $('leadsTableBody');
    if (!tbody) return;
    var leads = filteredLeads();

    if (!leads.length) {
      tbody.innerHTML = '<tr><td colspan="6">Nenhum lead encontrado.</td></tr>';
      return;
    }

    tbody.innerHTML = leads.map(function (lead) {
      var datas = (lead.dataEntrada ? formatDate(lead.dataEntrada) : '-') + ' até ' + (lead.dataSaida ? formatDate(lead.dataSaida) : '-');
      return '<tr>' +
        '<td>' + escapeHtml(lead.nome) + '</td>' +
        '<td>' + escapeHtml(lead.whatsapp) + '</td>' +
        '<td>' + escapeHtml(lead.resort) + '</td>' +
        '<td>' + escapeHtml(datas) + '</td>' +
        '<td>' + statusBadge(lead.status) + '</td>' +
        '<td><div class="row-actions">' +
          '<button type="button" data-action="contatado" data-id="' + escapeHtml(lead.id) + '">Marcar contatado</button>' +
          '<button type="button" data-action="reservado" data-id="' + escapeHtml(lead.id) + '">Converter em reserva</button>' +
          '<button type="button" data-action="arquivado" data-id="' + escapeHtml(lead.id) + '">Arquivar</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');
  }

  async function updateLeadStatus(id, status) {
    var lead = state.leads.find(function (item) { return String(item.id) === String(id); });
    if (!lead) return;

    lead.status = status;
    renderLeads();
    renderDashboard();

    if (!sb) return;

    try {
      var res = await sb.from('abandono_reserva').update({ status: status }).eq('id', id);
      if (res.error) throw res.error;
      showToast('Lead atualizado para status: ' + status + '.');
    } catch (err) {
      console.warn('Erro ao atualizar lead:', err);
      showToast('Não foi possível atualizar o lead no Supabase.');
    }
  }

  function exportCsv() {
    var rows = filteredLeads();
    if (!rows.length) {
      showToast('Sem dados para exportar.');
      return;
    }

    var header = ['Nome', 'WhatsApp', 'Resort', 'Data Entrada', 'Data Saída', 'Status'];
    var dataRows = rows.map(function (lead) {
      return [lead.nome, lead.whatsapp, lead.resort, lead.dataEntrada || '', lead.dataSaida || '', lead.status];
    });

    var csv = [header].concat(dataRows).map(function (line) {
      return line.map(function (col) { return '"' + String(col || '').replace(/"/g, '""') + '"'; }).join(',');
    }).join('\n');

    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'leads-hospedah.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function filteredReservas() {
    var search = ($('reservaSearch').value || '').toLowerCase().trim();
    var resort = $('reservaFilterResort').value;
    var date = $('reservaFilterDate').value;

    return state.reservas.filter(function (reserva) {
      var hitSearch = !search || reserva.cliente.toLowerCase().includes(search) || reserva.resort.toLowerCase().includes(search);
      var hitResort = !resort || reserva.resort === resort;
      var hitDate = true;
      if (date) hitDate = (reserva.checkin || '').slice(0, 10) === date || (reserva.checkout || '').slice(0, 10) === date;
      return hitSearch && hitResort && hitDate;
    });
  }

  function renderReservas() {
    var tbody = $('reservasTableBody');
    if (!tbody) return;
    var rows = filteredReservas();

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5">Nenhuma reserva encontrada.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(function (reserva) {
      return '<tr>' +
        '<td>' + escapeHtml(reserva.cliente) + '</td>' +
        '<td>' + escapeHtml(reserva.resort) + '</td>' +
        '<td>' + escapeHtml(formatDate(reserva.checkin)) + '</td>' +
        '<td>' + escapeHtml(formatDate(reserva.checkout)) + '</td>' +
        '<td>' + statusBadge(reserva.status || 'confirmada') + '</td>' +
      '</tr>';
    }).join('');
  }

  function buildCalendarDays(year, month) {
    var firstDay = new Date(year, month, 1);
    var totalDays = new Date(year, month + 1, 0).getDate();
    var days = [];
    for (var i = 0; i < firstDay.getDay(); i += 1) days.push(null);
    for (var d = 1; d <= totalDays; d += 1) days.push(new Date(year, month, d));
    return days;
  }

  function reservasNoDia(date) {
    var dateKey = date.toISOString().slice(0, 10);
    return state.reservas.filter(function (reserva) {
      var inDate = reserva.checkin ? reserva.checkin.slice(0, 10) : '';
      var outDate = reserva.checkout ? reserva.checkout.slice(0, 10) : '';
      return dateKey >= inDate && dateKey <= outDate;
    });
  }

  function renderCalendar() {
    var grid = $('reservasCalendar');
    if (!grid) return;
    var current = state.calendarDate;

    $('calendarMonthLabel').textContent = current.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    var weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    var html = weekDays.map(function (day) { return '<div class="day-head">' + day + '</div>'; }).join('');

    buildCalendarDays(current.getFullYear(), current.getMonth()).forEach(function (day) {
      if (!day) {
        html += '<div class="day-cell" aria-hidden="true"></div>';
        return;
      }
      var reservas = reservasNoDia(day);
      var dots = reservas.slice(0, 3).map(function (reserva) {
        return '<span class="day-dot" style="background:' + (resortColors[reserva.resort] || '#d4af37') + '"></span>';
      }).join('');
      html += '<div class="day-cell ' + (reservas.length ? 'has-bookings' : '') + '" title="' + reservas.length + ' reserva(s)"><div>' + day.getDate() + '</div><div>' + dots + '</div></div>';
    });

    grid.innerHTML = html;
  }

  function fillFilterOptions() {
    var resorts = {};
    state.leads.forEach(function (lead) { resorts[lead.resort] = true; });
    state.reservas.forEach(function (reserva) { resorts[reserva.resort] = true; });

    var options = Object.keys(resorts).sort().map(function (resort) {
      return '<option value="' + escapeHtml(resort) + '">' + escapeHtml(resort) + '</option>';
    }).join('');

    $('leadFilterResort').innerHTML = '<option value="">Todos os resorts</option>' + options;
    $('reservaFilterResort').innerHTML = '<option value="">Todos os resorts</option>' + options;
  }

  function bindEvents() {
    document.querySelectorAll('.nav-item[data-section]').forEach(function (btn) {
      btn.addEventListener('click', function () { setSection(btn.getAttribute('data-section')); });
    });

    ['leadSearch', 'leadFilterResort', 'leadFilterStatus', 'leadFilterDate'].forEach(function (id) {
      $(id).addEventListener('input', renderLeads);
      $(id).addEventListener('change', renderLeads);
    });

    ['reservaSearch', 'reservaFilterResort', 'reservaFilterDate'].forEach(function (id) {
      $(id).addEventListener('input', renderReservas);
      $(id).addEventListener('change', renderReservas);
    });

    $('exportCsvBtn').addEventListener('click', exportCsv);

    $('leadsTableBody').addEventListener('click', function (event) {
      var target = event.target;
      if (!target || target.tagName !== 'BUTTON') return;
      var id = target.getAttribute('data-id');
      var status = target.getAttribute('data-action');
      if (id && status) updateLeadStatus(id, status);
    });

    $('calPrev').addEventListener('click', function () {
      state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() - 1, 1);
      renderCalendar();
    });

    $('calNext').addEventListener('click', function () {
      state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() + 1, 1);
      renderCalendar();
    });
  }

  function subscribeRealtimeLeads() {
    if (!sb) return;

    try {
      sb.channel('admin-leads-channel').on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'abandono_reserva'
      }, function (payload) {
        var lead = payload.new || {};
        state.leads.unshift({
          id: lead.id,
          nome: lead.nome || 'Lead sem nome',
          whatsapp: lead.whatsapp || '-',
          resort: lead.resort_nome || 'Não informado',
          dataEntrada: lead.data_entrada || null,
          dataSaida: lead.data_saida || null,
          status: (lead.status || 'novo').toLowerCase(),
          criadoEm: lead.criado_em || new Date().toISOString()
        });
        renderLeads();
        renderDashboard();
        fillFilterOptions();
        showToast('Novo lead recebido: ' + (lead.nome || 'Sem nome'));
        playNotification();
      }).subscribe();
    } catch (err) {
      console.warn('Falha no realtime de leads:', err);
    }
  }

  async function init() {
    bindEvents();
    await validateAdminAccess();
    await Promise.all([loadLeads(), loadReservas()]);
    subscribeRealtimeLeads();
  }

  init();
}());
