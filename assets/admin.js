(function () {
  'use strict';

  function createClient() {
    return window.supabase.createClient(window.HOSPEDAH_SB_URL, window.HOSPEDAH_SB_ANON);
  }

  var client;
  var CRM_FETCH_LIMIT = 100;
  var crmData = [];
  var leadsCache = null;
  var FALLBACK_INTERVAL_MS = 60 * 1000;
  var fallbackTimer = null;
  var realtimeChannel = null;
  var realtimeConnected = false;
  var currentUser = null;
  var currentRole = '';
  var currentLeadId = null;
  var profileOptions = [];
  var bookingsChart;
  var leadSourceChart;
  var BOOKED_STATUSES = ['confirmada', 'concluida'];
  var PIPELINE_STAGES = [
    ['novo', 'Novo'],
    ['contatado', 'Contatado'],
    ['proposta_enviada', 'Proposta enviada'],
    ['negociacao', 'Negociação'],
    ['fechado', 'Fechado'],
    ['perdido', 'Perdido']
  ];

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
        .select('id,nome_hospede,email_hospede,telefone,resort_nome,data_entrada,data_saida,num_hospedes,status,criado_em,atualizado_em,mensagem,valor_total')
        .order('criado_em', { ascending: false })
        .limit(200);
      if (res.error) throw res.error;
      reservasData = res.data || [];
      renderReservasTable(reservasData);
      updateKpis(crmData);
      renderCharts(crmData);
      renderCrmAlerts(crmData);
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

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function formatPhone(value) {
    var digits = String(value || '').replace(/\D/g, '');
    return digits ? (digits.indexOf('55') === 0 ? digits : '55' + digits) : '';
  }

  function isThisMonth(value) {
    if (!value) return false;
    var date = new Date(value);
    var now = new Date();
    return !isNaN(date.getTime()) && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }

  function renderCrm() {
    var search = (document.getElementById('crmSearch') || {}).value || '';
    var stage = (document.getElementById('crmStage') || {}).value || '';
    var source = (document.getElementById('crmSource') || {}).value || '';
    var term = search.trim().toLocaleLowerCase('pt-BR');
    var rows = crmData.filter(function (lead) {
      var searchable = [lead.nome, lead.email, lead.whatsapp, lead.resort_nome]
        .join(' ').toLocaleLowerCase('pt-BR');
      return (!term || searchable.indexOf(term) !== -1) &&
        (!stage || lead.status_pipeline === stage) &&
        (!source || lead.origem === source);
    });
    renderCrmTable(rows);
    setText('crmResultCount', rows.length + (rows.length === 1 ? ' lead encontrado' : ' leads encontrados'));
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function renderCrmTable(rows) {
    var tbody = document.getElementById('crmTableBody');
    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--cor-sub,#aab4c4);padding:24px">Nenhum lead encontrado.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (lead) {
      var phone = formatPhone(lead.whatsapp);
      var stageOptions = PIPELINE_STAGES.map(function (option) {
        return '<option value="' + option[0] + '"' + (lead.status_pipeline === option[0] ? ' selected' : '') + '>' + option[1] + '</option>';
      }).join('');
      var sourceLabels = { orcamento: 'Orçamento', exit_intent: 'Saída do site', busca: 'Busca', chat: 'Chat' };
      var resortAndDates = [lead.resort_nome, lead.data_entrada ? fmtDate(lead.data_entrada) : '']
        .filter(Boolean).map(escapeHtml).join(' · ');
      return '<tr>' +
        '<td>' + escapeHtml(lead.nome || '—') + '</td>' +
        '<td>' + (lead.email ? '<a href="mailto:' + encodeURIComponent(lead.email) + '">' + escapeHtml(lead.email) + '</a>' : '—') + '</td>' +
        '<td>' + (phone ? '<a class="wpp-link" href="https://wa.me/' + phone + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(lead.whatsapp) + '</a>' : '—') + '</td>' +
        '<td>' + (resortAndDates || '—') + '</td>' +
        '<td>' + escapeHtml(sourceLabels[lead.origem] || lead.origem || '—') + '</td>' +
        '<td>' + escapeHtml(lead.score == null ? 0 : lead.score) + '/100</td>' +
        '<td><select class="crm-stage-select" data-id="' + escapeHtml(lead.id) + '" aria-label="Etapa de ' + escapeHtml(lead.nome || 'lead') + '">' + stageOptions + '</select></td>' +
        '<td>' + escapeHtml(fmtDate(lead.criado_em)) + '</td>' +
        '<td><button type="button" class="admin-btn admin-btn-sm crm-details-btn" data-id="' + escapeHtml(lead.id) + '" aria-label="Detalhes de ' + escapeHtml(lead.nome || 'lead') + '">Detalhes</button></td>' +
        '</tr>';
    }).join('');
    tbody.querySelectorAll('.crm-stage-select').forEach(function (select) {
      select.addEventListener('change', function () {
        updateLeadStage(select.dataset.id, select.value, select);
      });
    });
    tbody.querySelectorAll('.crm-details-btn').forEach(function (button) {
      button.addEventListener('click', function () { openLeadDetails(button.dataset.id); });
    });
  }

  function updateKpis(rows) {
    var leadsToday = rows.filter(function (lead) {
      var date = new Date(lead.criado_em || 0);
      var now = new Date();
      return date.toDateString() === now.toDateString();
    }).length;
    var bookings = reservasData.filter(function (booking) {
      return BOOKED_STATUSES.indexOf(booking.status) !== -1 && isThisMonth(booking.criado_em);
    }).length;
    var closedLeads = rows.filter(function (lead) { return lead.status_pipeline === 'fechado'; }).length;
    var conversion = rows.length ? (closedLeads / rows.length) * 100 : 0;
    var revenue = reservasData.reduce(function (total, booking) {
      return total + (BOOKED_STATUSES.indexOf(booking.status) !== -1 && isThisMonth(booking.criado_em)
        ? Number(booking.valor_total || 0) : 0);
    }, 0);

    setText('kpiLeads', String(leadsToday));
    setText('kpiBookings', String(bookings));
    setText('kpiConversion', conversion.toFixed(1) + '%');
    setText('kpiRevenue', money(revenue));
    renderCrmAlerts(rows);
  }

  function renderCrmAlerts(rows) {
    var list = document.getElementById('crmAlerts');
    if (!list) return;
    var now = Date.now();
    var period = 30 * 24 * 60 * 60 * 1000;
    var currentLeads = rows.filter(function (lead) {
      var date = new Date(lead.criado_em || 0).getTime();
      return date > now - period && date <= now;
    });
    var priorLeads = rows.filter(function (lead) {
      var date = new Date(lead.criado_em || 0).getTime();
      return date > now - 2 * period && date <= now - period;
    });
    var conversion = function (items) {
      return items.length ? items.filter(function (lead) { return lead.status_pipeline === 'fechado'; }).length / items.length : 0;
    };
    var currentConversion = conversion(currentLeads);
    var priorConversion = conversion(priorLeads);
    var alerts = [];
    if (priorLeads.length && currentConversion < priorConversion - 0.1) {
      alerts.push('A conversão caiu de ' + (priorConversion * 100).toFixed(1) + '% para ' + (currentConversion * 100).toFixed(1) + '% nos últimos 30 dias.');
    }
    var currentCancel = reservasData.filter(function (booking) {
      var date = new Date(booking.atualizado_em || booking.criado_em || 0).getTime();
      return booking.status === 'cancelada' && date > now - period;
    }).length;
    var priorCancel = reservasData.filter(function (booking) {
      var date = new Date(booking.atualizado_em || booking.criado_em || 0).getTime();
      return booking.status === 'cancelada' && date > now - 2 * period && date <= now - period;
    }).length;
    if (currentCancel >= 3 && currentCancel > priorCancel * 1.5) {
      alerts.push('Pico de cancelamentos: ' + currentCancel + ' nos últimos 30 dias, contra ' + priorCancel + ' no período anterior.');
    }
    var unanswered = rows.filter(function (lead) {
      var lastUpdate = new Date(lead.status_pipeline_alterado_em || lead.criado_em || 0).getTime();
      return ['novo', 'contatado'].indexOf(lead.status_pipeline) !== -1 && lastUpdate < now - 24 * 60 * 60 * 1000;
    }).length;
    if (unanswered) alerts.push(unanswered + (unanswered === 1 ? ' lead está' : ' leads estão') + ' sem resposta há mais de 24 horas.');
    list.textContent = '';
    if (!alerts.length) alerts.push('Nenhum alerta operacional no momento.');
    alerts.forEach(function (message) {
      var item = document.createElement('li');
      item.textContent = message;
      list.appendChild(item);
    });
  }

  function renderCharts(rows) {
    if (!window.Chart) return;

    var monthMap = {};
    var sourceMap = {};
    reservasData.forEach(function (row) {
      if (BOOKED_STATUSES.indexOf(row.status) === -1) return;
      var date = new Date(row.criado_em || Date.now());
      var month = date.toLocaleString('pt-BR', { month: 'short' });
      monthMap[month] = (monthMap[month] || 0) + 1;
    });
    rows.forEach(function (row) {
      var source = row.origem || 'Direto';
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
    var header = ['Nome', 'Email', 'WhatsApp', 'Resort', 'Origem', 'Score', 'Etapa', 'Data'];
    var rows = crmData.map(function (lead) {
      return [lead.nome, lead.email, lead.whatsapp, lead.resort_nome, lead.origem, lead.score, lead.status_pipeline, lead.criado_em];
    });
    var csv = [header].concat(rows).map(function (cols) {
      return cols.map(function (value) {
        var safe = String(value == null ? '' : value);
        if (/^[\s]*[=+\-@]/.test(safe)) safe = "'" + safe;
        return '"' + safe.replace(/"/g, '""') + '"';
      }).join(',');
    }).join('\n');

    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'crm-leads-hospedah.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function updateLeadStage(id, stage, select) {
    if (!id || !PIPELINE_STAGES.some(function (option) { return option[0] === stage; })) return;
    select.disabled = true;
    try {
      var response = await client.from('leads')
        .update({ status_pipeline: stage, atualizado_em: new Date().toISOString() })
        .eq('id', id);
      if (response.error) throw response.error;
      var lead = crmData.find(function (item) { return item.id === id; });
      if (lead) lead.status_pipeline = stage;
      updateKpis(crmData);
      setRealtimeStatus('Etapa atualizada às ' + new Date().toLocaleTimeString('pt-BR'));
      client.functions.invoke('crm-sync', { body: { lead_id: id } }).catch(function () {});
      renderCrm();
    } catch (err) {
      setRealtimeStatus('Não foi possível atualizar a etapa. Verifique sua permissão e tente novamente.');
      await loadLeads();
    } finally {
      select.disabled = false;
    }
  }

  function setRealtimeStatus(text) {
    var el = document.getElementById('realtimeStatus');
    if (el) el.textContent = text;
  }

  async function loadLeads() {
    var rows = [];
    var loadError = null;
    try {
      var response = await client.from('leads')
        .select('id,nome,email,whatsapp,resort_nome,num_pessoas,data_entrada,data_saida,observacoes,origem,utm_source,utm_medium,utm_campaign,ticket_estimado,responsavel_id,score,status_pipeline,criado_em,atualizado_em,status_pipeline_alterado_em')
        .order('criado_em', { ascending: false }).limit(CRM_FETCH_LIMIT);
      if (response.error) throw response.error;
      rows = response.data || [];
    } catch (err) {
      loadError = err;
      rows = leadsCache || [];
    }

    leadsCache = rows;
    crmData = rows;
    updateKpis(rows);
    renderCharts(rows);
    renderCrm();
    if (loadError) {
      setRealtimeStatus('Não foi possível atualizar os leads. Verifique a migração e as permissões do Supabase.');
    } else {
      setRealtimeStatus('Atualizado em ' + new Date().toLocaleTimeString('pt-BR'));
    }
  }

  async function loadProfiles() {
    var response = await client.from('profiles').select('id,nome_completo,role')
      .in('role', ['admin', 'proprietario']).order('nome_completo');
    if (response.error) throw response.error;
    profileOptions = response.data || [];
  }

  async function openLeadDetails(id) {
    currentLeadId = id;
    var lead = crmData.find(function (item) { return item.id === id; });
    var panel = document.getElementById('leadDetails');
    if (!lead || !panel) return;
    panel.hidden = false;
    document.getElementById('leadDetailsTitle').textContent = 'Histórico: ' + (lead.nome || 'Lead');
    var assignee = document.getElementById('leadAssignee');
    assignee.textContent = '';
    var unassigned = document.createElement('option');
    unassigned.value = '';
    unassigned.textContent = 'Sem responsável';
    assignee.appendChild(unassigned);
    profileOptions.forEach(function (profile) {
      var option = document.createElement('option');
      option.value = profile.id;
      option.textContent = profile.nome_completo || profile.id;
      assignee.appendChild(option);
    });
    assignee.value = lead.responsavel_id || '';
    await loadLeadDetails(id);
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function loadLeadDetails(id) {
    var status = document.getElementById('leadDetailsStatus');
    try {
      var results = await Promise.all([
        client.from('leads_historico').select('tipo_evento,descricao,usuario_id,criado_em').eq('lead_id', id).order('criado_em', { ascending: false }).limit(50),
        client.from('leads_notas').select('nota,autor_id,criado_em').eq('lead_id', id).order('criado_em', { ascending: false }).limit(50)
      ]);
      if (results[0].error) throw results[0].error;
      if (results[1].error) throw results[1].error;
      renderTimeline('leadTimeline', results[0].data || [], false);
      renderTimeline('leadNotes', results[1].data || [], true);
      if (status) status.textContent = '';
    } catch (err) {
      if (status) status.textContent = 'Não foi possível carregar histórico e notas. Verifique a migration 017.';
    }
  }

  function renderTimeline(id, entries, notes) {
    var list = document.getElementById(id);
    list.textContent = '';
    if (!entries.length) {
      var empty = document.createElement('li');
      empty.textContent = notes ? 'Nenhuma nota ainda.' : 'Nenhum evento registrado.';
      list.appendChild(empty);
      return;
    }
    entries.forEach(function (entry) {
      var item = document.createElement('li');
      var text = notes ? entry.nota : entry.descricao;
      item.textContent = text + ' · ' + new Date(entry.criado_em).toLocaleString('pt-BR');
      list.appendChild(item);
    });
  }

  async function saveLeadAssignee() {
    if (!currentLeadId) return;
    var status = document.getElementById('leadDetailsStatus');
    var value = document.getElementById('leadAssignee').value || null;
    var response = await client.from('leads').update({ responsavel_id: value, atualizado_em: new Date().toISOString() })
      .eq('id', currentLeadId);
    if (response.error) {
      status.textContent = 'Não foi possível atribuir o responsável.';
      return;
    }
    var lead = crmData.find(function (item) { return item.id === currentLeadId; });
    if (lead) lead.responsavel_id = value;
    await loadLeadDetails(currentLeadId);
    status.textContent = 'Responsável atualizado.';
  }

  async function addLeadNote() {
    if (!currentLeadId) return;
    var field = document.getElementById('leadNoteInput');
    var note = field.value.trim();
    var status = document.getElementById('leadDetailsStatus');
    if (!note) {
      status.textContent = 'Digite uma nota antes de salvar.';
      return;
    }
    var response = await client.from('leads_notas').insert({ lead_id: currentLeadId, autor_id: currentUser.id, nota: note });
    if (response.error) {
      status.textContent = 'Não foi possível salvar a nota.';
      return;
    }
    field.value = '';
    await loadLeadDetails(currentLeadId);
    status.textContent = 'Nota salva.';
  }

  async function loadApprovals() {
    var status = document.getElementById('approvalsStatus');
    var tbody = document.getElementById('approvalsTableBody');
    if (!tbody || !['admin', 'proprietario'].includes(currentRole)) return;
    status.textContent = 'Carregando aprovações…';
    var response = await client.from('aprovacoes_pendentes')
      .select('id,tipo,descricao,criado_em').eq('status', 'pendente').order('criado_em', { ascending: true });
    if (response.error) {
      status.textContent = 'Não foi possível carregar aprovações. Verifique a migration 017.';
      return;
    }
    var labels = { alteracao_tarifa: 'Alteração de tarifa', blackout_dates: 'Blackout dates', disponibilidade: 'Disponibilidade' };
    var rows = response.data || [];
    tbody.textContent = '';
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="4">Nenhuma aprovação pendente.</td></tr>';
      status.textContent = 'Atualizado em ' + new Date().toLocaleTimeString('pt-BR');
      return;
    }
    rows.forEach(function (approval) {
      var row = document.createElement('tr');
      var type = document.createElement('td');
      var description = document.createElement('td');
      var date = document.createElement('td');
      var actions = document.createElement('td');
      type.textContent = labels[approval.tipo] || approval.tipo;
      description.textContent = approval.descricao;
      date.textContent = fmtDate(approval.criado_em);
      ['aprovada', 'rejeitada'].forEach(function (decision) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'admin-btn admin-btn-sm' + (decision === 'rejeitada' ? ' admin-btn-danger' : '');
        button.textContent = decision === 'aprovada' ? 'Aprovar' : 'Rejeitar';
        button.setAttribute('aria-label', button.textContent + ' solicitação: ' + approval.descricao);
        button.addEventListener('click', function () { resolveApproval(approval.id, decision); });
        actions.appendChild(button);
      });
      row.append(type, description, date, actions);
      tbody.appendChild(row);
    });
    status.textContent = rows.length + (rows.length === 1 ? ' solicitação pendente.' : ' solicitações pendentes.');
  }

  async function resolveApproval(id, decision) {
    var response = await client.from('aprovacoes_pendentes')
      .update({ status: decision, resolvido_por: currentUser.id, resolvido_em: new Date().toISOString() })
      .eq('id', id).eq('status', 'pendente').select('id').maybeSingle();
    if (response.error || !response.data) {
      setText('approvalsStatus', 'Não foi possível resolver a solicitação.');
      return;
    }
    await loadApprovals();
  }

  function startFallbackPolling() {
    if (fallbackTimer) return;
    setRealtimeStatus('Realtime indisponível; atualização automática por polling ativada.');
    fallbackTimer = window.setInterval(function () {
      loadLeads();
      loadReservas();
    }, FALLBACK_INTERVAL_MS);
  }

  function stopFallbackPolling() {
    if (fallbackTimer) window.clearInterval(fallbackTimer);
    fallbackTimer = null;
  }

  function startRealtime() {
    if (!client.channel) {
      startFallbackPolling();
      return;
    }
    realtimeChannel = client.channel('admin-crm-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, function () {
        loadLeads();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservas_hospede' }, function () {
        loadReservas();
      })
      .subscribe(function (status) {
        if (status === 'SUBSCRIBED') {
          realtimeConnected = true;
          stopFallbackPolling();
          setRealtimeStatus('Realtime conectado.');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          realtimeConnected = false;
          startFallbackPolling();
        }
      });
    window.setTimeout(function () {
      if (!realtimeConnected) startFallbackPolling();
    }, 10000);
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
      if (roleResponse.error) throw roleResponse.error;
      var role = roleResponse.data && roleResponse.data.role;
      if (!['admin', 'proprietario'].includes(role)) {
        window.location.replace('/portal/dashboard.html');
        return null;
      }
      currentRole = role;
    } catch (err) {
      window.location.replace('/portal/dashboard.html');
      return null;
    }

    return user;
  }

  async function init() {
    client = createClient();
    var user = await enforceAdmin();
    if (!user) return;
    currentUser = user;

    var logout = document.getElementById('adminLogout');
    var exportBtn = document.getElementById('exportCsv');
    var refreshLeads = document.getElementById('refreshLeads');
    var reloadApprovals = document.getElementById('reloadApprovals');

    if (logout) {
      logout.addEventListener('click', async function () {
        await client.auth.signOut();
        window.location.replace('/portal/index.html');
      });
    }

    if (exportBtn) {
      exportBtn.addEventListener('click', exportCsv);
    }
    if (refreshLeads) refreshLeads.addEventListener('click', loadLeads);
    if (reloadApprovals) reloadApprovals.addEventListener('click', loadApprovals);
    document.getElementById('saveLeadAssignee').addEventListener('click', saveLeadAssignee);
    document.getElementById('addLeadNote').addEventListener('click', addLeadNote);
    document.getElementById('closeLeadDetails').addEventListener('click', function () {
      document.getElementById('leadDetails').hidden = true;
      currentLeadId = null;
    });
    ['crmSearch', 'crmStage', 'crmSource'].forEach(function (id) {
      var field = document.getElementById(id);
      if (field) field.addEventListener('input', renderCrm);
      if (field) field.addEventListener('change', renderCrm);
    });

    bindModalEvents();

    try {
      await loadProfiles();
    } catch (err) {
      setText('approvalsStatus', 'Não foi possível carregar a lista de responsáveis.');
    }
    await Promise.all([loadLeads(), loadReservas(), loadApprovals()]);
    startRealtime();
  }

  document.addEventListener('DOMContentLoaded', function () {
    init().catch(function () {
      setRealtimeStatus('Falha ao carregar painel.');
    });
  });
})();
