(function () {
  'use strict';

  function createClient() {
    return window.supabase.createClient(window.HOSPEDAH_SB_URL, window.HOSPEDAH_SB_ANON);
  }

  var client;
  var CRM_FETCH_LIMIT = 100;
  var crmData = [];
  var leadsCache = null;
  var leadsCacheTs = 0;
  var LEADS_CACHE_MS = 2 * 60 * 1000;
  var POLL_INTERVAL_MS = 60 * 1000;
  var pollTimer = null;
  var bookingsChart;
  var leadSourceChart;
  var BOOKED_STATUSES = ['booked', 'reservado'];

  // ── Reservas ─────────────────────────────────────────────────
  var reservasData = [];

  var STATUS_LABELS = {
    pendente:          { label: 'Solicitação Recebida', cls: 'status-pendente' },
    confirmada:        { label: 'Confirmada',           cls: 'status-confirmada' },
    cancelada:         { label: 'Cancelada',            cls: 'status-cancelada' },
    oferta_aceita:     { label: 'Oferta Aceita',        cls: 'status-aceita' },
    oferta_enviada:    { label: 'Oferta Enviada',       cls: 'status-enviada' },
    contra_proposta:   { label: 'Contra-proposta',      cls: 'status-contraproposta' },
    concluida:         { label: 'Concluída',            cls: 'status-concluida' }
  };

  function statusBadge(status) {
    var s = STATUS_LABELS[status] || { label: status || 'Novo', cls: 'status-pendente' };
    return '<span class="status-badge ' + s.cls + '">' + s.label + '</span>';
  }

  function fmtDate(dateStr) {
    if (!dateStr) return '-';
    var parts = String(dateStr).split('T')[0].split('-');
    if (parts.length < 3) return dateStr;
    return parts[2] + '/' + parts[1] + '/' + parts[0];
  }

  function renderReservasTable(rows) {
    var tbody = document.getElementById('reservasTableBody');
    if (!tbody) return;
    if (!rows || !rows.length) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--cor-sub,#aab4c4);padding:24px">Nenhuma solicitação encontrada.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (r) {
      var id = r.id || '';
      return '<tr>' +
        '<td>' + (r.nome_hospede || '-') + '</td>' +
        '<td>' + (r.telefone ? '<a href="https://wa.me/55' + r.telefone.replace(/\D/g, '') + '" target="_blank" rel="noopener" class="wpp-link">📱 ' + r.telefone + '</a>' : '-') + '</td>' +
        '<td>' + (r.email_hospede || '-') + '</td>' +
        '<td>' + (r.resort_nome || '-') + '</td>' +
        '<td>' + fmtDate(r.data_entrada) + '</td>' +
        '<td>' + (r.num_hospedes || 1) + '</td>' +
        '<td>' + statusBadge(r.status) + '</td>' +
        '<td>' + fmtDate(r.criado_em) + '</td>' +
        '<td class="acoes-cell">' +
          '<button type="button" class="admin-btn admin-btn-sm btn-aprovar" data-id="' + id + '" title="Aprovar">✔</button>' +
          '<button type="button" class="admin-btn admin-btn-sm btn-reprovar admin-btn-danger" data-id="' + id + '" title="Reprovar">✘</button>' +
          '<button type="button" class="admin-btn admin-btn-sm btn-oferta admin-btn-gold" data-id="' + id + '" title="Oferta Especial">✦</button>' +
        '</td>' +
        '</tr>';
    }).join('');

    // Bind action buttons
    tbody.querySelectorAll('.btn-aprovar').forEach(function (btn) {
      btn.addEventListener('click', function () { updateReservaStatus(btn.dataset.id, 'confirmada'); });
    });
    tbody.querySelectorAll('.btn-reprovar').forEach(function (btn) {
      btn.addEventListener('click', function () { updateReservaStatus(btn.dataset.id, 'cancelada'); });
    });
    tbody.querySelectorAll('.btn-oferta').forEach(function (btn) {
      btn.addEventListener('click', function () { abrirModalOferta(btn.dataset.id); });
    });
  }

  async function loadReservas() {
    var statusEl = document.getElementById('reservasStatus');
    if (statusEl) statusEl.textContent = 'Carregando…';
    try {
      var res = await client
        .from('reservas_hospede')
        .select('id,nome_hospede,email_hospede,telefone,resort_nome,data_entrada,num_hospedes,status,criado_em,mensagem')
        .order('criado_em', { ascending: false })
        .limit(200);
      if (res.error) throw res.error;
      reservasData = res.data || [];
      renderReservasTable(reservasData);
      if (statusEl) statusEl.textContent = 'Atualizado em ' + new Date().toLocaleTimeString('pt-BR');
    } catch (err) {
      if (statusEl) statusEl.textContent = 'Erro ao carregar solicitações.';
    }
  }

  async function updateReservaStatus(id, novoStatus) {
    if (!id) return;
    try {
      var res = await client
        .from('reservas_hospede')
        .update({ status: novoStatus, atualizado_em: new Date().toISOString() })
        .eq('id', id);
      if (res.error) throw res.error;
      await loadReservas();
    } catch (err) {
      alert('Erro ao atualizar status: ' + (err.message || err));
    }
  }

  // ── Modal: Oferta Especial ────────────────────────────────────
  var ofertaAtual = null; // reserva selecionada

  function gerarToken() {
    var arr = new Uint8Array(16);
    window.crypto.getRandomValues(arr);
    return Array.from(arr).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  function abrirModalOferta(reservaId) {
    var reserva = reservasData.find(function (r) { return r.id === reservaId; });
    if (!reserva) return;
    ofertaAtual = reserva;

    document.getElementById('ofReservaId').value     = reserva.id;
    document.getElementById('modalClienteNome').textContent = 'Cliente: ' + (reserva.nome_hospede || '—');
    document.getElementById('ofResort').value         = reserva.resort_nome || '';
    document.getElementById('ofAcomoda').value        = '';
    document.getElementById('ofCheckin').value        = reserva.data_entrada || '';
    document.getElementById('ofCheckout').value       = '';
    document.getElementById('ofCapacidade').value     = reserva.num_hospedes || 2;
    document.getElementById('ofValorOriginal').value  = '';
    document.getElementById('ofDesconto').value       = '0';
    document.getElementById('ofValorFinalDisplay').textContent = 'R$ 0,00';
    document.getElementById('ofObs').value            = '';

    // Validade padrão: 48 horas
    var validade = new Date(Date.now() + 48 * 3600 * 1000);
    var pad = function (n) { return String(n).padStart(2, '0'); };
    var validadeStr = validade.getFullYear() + '-' + pad(validade.getMonth() + 1) + '-' + pad(validade.getDate()) +
      'T' + pad(validade.getHours()) + ':' + pad(validade.getMinutes());
    document.getElementById('ofValidade').value = validadeStr;

    document.getElementById('modalLinkWrap').style.display = 'none';
    document.getElementById('btnEnviarWhatsapp').style.display = 'none';
    document.getElementById('ofLinkGerado').value = '';
    document.getElementById('btnGerarOferta').textContent = 'Gerar Oferta e Link';
    document.getElementById('btnGerarOferta').disabled = false;

    var msgEl = document.getElementById('modalMsg');
    if (msgEl) { msgEl.style.display = 'none'; msgEl.textContent = ''; }

    document.getElementById('modalOferta').style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function fecharModal() {
    document.getElementById('modalOferta').style.display = 'none';
    document.body.style.overflow = '';
    ofertaAtual = null;
  }

  function atualizarValorFinal() {
    var original  = parseFloat(document.getElementById('ofValorOriginal').value) || 0;
    var desconto  = parseFloat(document.getElementById('ofDesconto').value) || 0;
    var final     = Math.max(0, original - desconto);
    document.getElementById('ofValorFinalDisplay').textContent =
      final.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function showModalMsg(text, tipo) {
    var el = document.getElementById('modalMsg');
    if (!el) return;
    el.textContent = text;
    el.className = 'modal-msg modal-msg-' + (tipo || 'ok');
    el.style.display = 'block';
  }

  async function salvarOferta(e) {
    e.preventDefault();
    if (!ofertaAtual) return;

    var btn = document.getElementById('btnGerarOferta');
    btn.disabled = true;
    btn.textContent = 'Gerando…';
    var msgEl = document.getElementById('modalMsg');
    if (msgEl) msgEl.style.display = 'none';

    var original = parseFloat(document.getElementById('ofValorOriginal').value) || 0;
    var desconto = parseFloat(document.getElementById('ofDesconto').value) || 0;

    if (!document.getElementById('ofResort').value.trim()) {
      showModalMsg('Informe o nome do resort.', 'erro');
      btn.disabled = false; btn.textContent = 'Gerar Oferta e Link';
      return;
    }
    if (!document.getElementById('ofCheckin').value || !document.getElementById('ofCheckout').value) {
      showModalMsg('Informe as datas de check-in e check-out.', 'erro');
      btn.disabled = false; btn.textContent = 'Gerar Oferta e Link';
      return;
    }
    if (original <= 0) {
      showModalMsg('Informe o valor original da hospedagem.', 'erro');
      btn.disabled = false; btn.textContent = 'Gerar Oferta e Link';
      return;
    }

    var token = gerarToken();

    try {
      var payload = {
        reserva_id:      ofertaAtual.id,
        nome_hospede:    ofertaAtual.nome_hospede,
        email_hospede:   ofertaAtual.email_hospede,
        telefone:        ofertaAtual.telefone || null,
        resort_nome:     document.getElementById('ofResort').value.trim(),
        acomodacao_tipo: document.getElementById('ofAcomoda').value.trim() || null,
        checkin:         document.getElementById('ofCheckin').value,
        checkout:        document.getElementById('ofCheckout').value,
        capacidade:      parseInt(document.getElementById('ofCapacidade').value, 10) || 1,
        valor_original:  original,
        desconto_valor:  desconto,
        observacoes:     document.getElementById('ofObs').value.trim() || null,
        token:           token,
        validade:        new Date(document.getElementById('ofValidade').value).toISOString(),
        status:          'pendente'
      };

      var res = await client.from('ofertas_especiais').insert(payload);
      if (res.error) throw res.error;

      // Atualiza status da reserva para "oferta_enviada"
      await client.from('reservas_hospede')
        .update({ status: 'oferta_enviada', atualizado_em: new Date().toISOString() })
        .eq('id', ofertaAtual.id);

      var link = window.location.origin + '/oferta.html?t=' + token;
      document.getElementById('ofLinkGerado').value = link;
      document.getElementById('modalLinkWrap').style.display = 'block';
      document.getElementById('btnEnviarWhatsapp').style.display = 'inline-flex';
      btn.textContent = 'Oferta Gerada ✔';

      showModalMsg('Oferta gerada com sucesso! Copie o link ou envie via WhatsApp.', 'ok');

      enviarWhatsapp();

      await loadReservas();

    } catch (err) {
      showModalMsg('Erro ao gerar oferta: ' + (err.message || err), 'erro');
      btn.disabled = false;
      btn.textContent = 'Gerar Oferta e Link';
    }
  }

  function enviarWhatsapp() {
    if (!ofertaAtual) return;
    var link  = document.getElementById('ofLinkGerado').value;
    var nome  = ofertaAtual.nome_hospede || 'cliente';
    var fone  = (ofertaAtual.telefone || '').replace(/\D/g, '');
    if (!fone) {
      alert('Número de WhatsApp não disponível para esta reserva.');
      return;
    }
    var msg = 'Olá, ' + nome + '! 😊\n\n' +
      'Analisamos sua solicitação e preparamos uma *oferta exclusiva* para você na HOSPEDAH.\n\n' +
      'Clique abaixo para visualizar e aceitar sua oferta:\n' +
      link + '\n\n' +
      '_Equipe HOSPEDAH_ 🏖️';
    window.open('https://wa.me/55' + fone + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
  }

  function bindModalEvents() {
    var modalFechar = document.getElementById('modalFechar');
    var overlay     = document.getElementById('modalOferta');
    var formOferta  = document.getElementById('formOferta');
    var btnWpp      = document.getElementById('btnEnviarWhatsapp');
    var btnCopiar   = document.getElementById('btnCopiarLink');
    var valOrig     = document.getElementById('ofValorOriginal');
    var valDesc     = document.getElementById('ofDesconto');
    var reloadBtn   = document.getElementById('reloadReservas');

    if (modalFechar) modalFechar.addEventListener('click', fecharModal);

    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) fecharModal();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay && overlay.style.display === 'flex') fecharModal();
    });

    if (formOferta) formOferta.addEventListener('submit', salvarOferta);
    if (btnWpp)     btnWpp.addEventListener('click', enviarWhatsapp);

    if (btnCopiar) {
      btnCopiar.addEventListener('click', function () {
        var inp = document.getElementById('ofLinkGerado');
        if (!inp) return;
        inp.select();
        document.execCommand('copy');
        btnCopiar.textContent = 'Copiado!';
        setTimeout(function () { btnCopiar.textContent = 'Copiar'; }, 2000);
      });
    }

    if (valOrig) valOrig.addEventListener('input', atualizarValorFinal);
    if (valDesc) valDesc.addEventListener('input', atualizarValorFinal);

    if (reloadBtn) reloadBtn.addEventListener('click', function () { loadReservas(); });
  }

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
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--cor-sub,#aab4c4);padding:24px">Nenhum lead encontrado.</td></tr>';
      return;
    }
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

  async function loadLeads(force) {
    var now = Date.now();
    if (!force && leadsCache && (now - leadsCacheTs) < LEADS_CACHE_MS) {
      return;
    }

    var rows = [];
    try {
      var response = await client.from('leads').select('name,email,phone,source,status,created_at,revenue').order('created_at', { ascending: false }).limit(CRM_FETCH_LIMIT);
      if (!response.error && response.data) rows = response.data;
    } catch (err) {
      rows = [];
    }

    if (!rows.length) {
      rows = leadsCache || [];
    }

    leadsCache = rows;
    leadsCacheTs = Date.now();
    crmData = rows;
    renderCrmTable(rows);
    updateKpis(rows);
    renderCharts(rows);
    setRealtimeStatus('Atualizado em ' + new Date().toLocaleTimeString('pt-BR'));
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = window.setInterval(function () { loadLeads(false); }, POLL_INTERVAL_MS);
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

    bindModalEvents();

    await Promise.all([loadLeads(true), loadReservas()]);
    startPolling();
  }

  document.addEventListener('DOMContentLoaded', function () {
    init().catch(function () {
      setRealtimeStatus('Falha ao carregar painel.');
    });
  });
})();
