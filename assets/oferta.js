(function () {
  'use strict';

  var client;
  var ofertaData = null;
  var countdownTimer = null;

  function getToken() {
    var params = new URLSearchParams(window.location.search);
    return params.get('t') || params.get('token') || '';
  }

  function show(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'block';
  }

  function hide(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }

  function fmt(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function money(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function fmtDate(dateStr) {
    if (!dateStr) return '-';
    // dateStr is YYYY-MM-DD — parse as local date to avoid UTC shift
    var parts = dateStr.split('-');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function showMsg(text, tipo) {
    var el = document.getElementById('ofertaMsg');
    if (!el) return;
    el.textContent = text;
    el.className = 'oferta-msg ' + (tipo || 'sucesso');
    el.style.display = 'block';
  }

  function hideMsg() {
    var el = document.getElementById('ofertaMsg');
    if (el) el.style.display = 'none';
  }

  // ── Contador regressivo ──────────────────────────────────────
  function startCountdown(validadeStr) {
    var el = document.getElementById('countdown');
    if (!el) return;

    function tick() {
      var diff = new Date(validadeStr).getTime() - Date.now();
      if (diff <= 0) {
        el.innerHTML = '<span class="countdown-expirado">Oferta expirada</span>';
        clearInterval(countdownTimer);
        return;
      }
      var days  = Math.floor(diff / 86400000);
      var hours = Math.floor((diff % 86400000) / 3600000);
      var mins  = Math.floor((diff % 3600000)  / 60000);
      var secs  = Math.floor((diff % 60000)    / 1000);

      el.innerHTML =
        bloco(days,  'dias') +
        bloco(hours, 'hrs')  +
        bloco(mins,  'min')  +
        bloco(secs,  'seg');
    }

    function bloco(n, u) {
      return '<div class="count-bloco">' +
        '<div class="count-num">' + String(n).padStart(2, '0') + '</div>' +
        '<div class="count-unit">' + u + '</div>' +
        '</div>';
    }

    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  // ── Renderiza a oferta ────────────────────────────────────────
  function renderOferta(o) {
    fmt('ofertaResortNome', o.resort_nome);
    fmt('ofertaCheckin',    fmtDate(o.checkin));
    fmt('ofertaCheckout',   fmtDate(o.checkout));
    fmt('ofertaCapacidade', o.capacidade + (o.capacidade === 1 ? ' hóspede' : ' hóspedes'));
    fmt('ofertaAcomodacao', o.acomodacao_tipo || 'Padrão');

    var original = Number(o.valor_original || 0);
    var final    = Number(o.valor_final    || o.valor_original || 0);
    var economia = original - final;

    var origEl = document.getElementById('ofertaPrecoOriginal');
    if (origEl) {
      if (economia > 0) {
        origEl.textContent = money(original);
        origEl.style.display = 'block';
      } else {
        origEl.style.display = 'none';
      }
    }

    fmt('ofertaPrecoFinal', money(final));

    var econEl = document.getElementById('ofertaEconomia');
    if (econEl && economia > 0) {
      econEl.textContent = 'Economia: ' + money(economia);
      econEl.style.display = 'block';
    }

    if (o.observacoes) {
      var obsEl = document.getElementById('ofertaObs');
      if (obsEl) {
        obsEl.textContent = o.observacoes;
        obsEl.style.display = 'block';
      }
    }

    // Foto placeholder (resort sem imagem)
    var fotoWrap = document.getElementById('ofertaFotoWrap');
    if (fotoWrap) {
      fotoWrap.innerHTML = '<div class="oferta-foto-placeholder">🏖️</div>';
    }

    startCountdown(o.validade);

    hide('ofertaLoading');
    show('ofertaCard');
  }

  // ── Carrega oferta via RPC ────────────────────────────────────
  async function loadOferta(token) {
    try {
      var res = await client.rpc('get_oferta_por_token', { p_token: token });
      if (res.error || !res.data || !res.data.length) {
        hide('ofertaLoading');
        show('ofertaErro');
        return;
      }
      var o = res.data[0];
      ofertaData = o;

      // Verificar estado
      if (o.status === 'expirada' || new Date(o.validade) < new Date()) {
        hide('ofertaLoading');
        show('ofertaExpirada');
        return;
      }

      if (o.status === 'aceita') {
        hide('ofertaLoading');
        show('ofertaJaAceita');
        return;
      }

      renderOferta(o);

      // Registra visualização (sem bloquear render)
      client.rpc('registrar_visualizacao_oferta', { p_token: token }).catch(function () {});

    } catch (err) {
      hide('ofertaLoading');
      show('ofertaErro');
    }
  }

  // ── Aceitar oferta ────────────────────────────────────────────
  async function aceitarOferta(token) {
    var btn = document.getElementById('btnAceitar');
    if (btn) { btn.disabled = true; btn.textContent = 'Processando…'; }
    hideMsg();

    try {
      var res = await client.rpc('aceitar_oferta', { p_token: token });
      if (res.error) throw new Error(res.error.message);

      var result = res.data;
      if (!result || result.ok === false) {
        var erro = (result && result.erro) || 'Não foi possível aceitar a oferta.';
        showMsg(erro, 'erro');
        if (btn) { btn.disabled = false; btn.textContent = '✓ ACEITAR OFERTA'; }
        return;
      }

      // Sucesso: mostrar estado de aceite
      clearInterval(countdownTimer);
      hide('ofertaCard');
      show('ofertaJaAceita');

    } catch (err) {
      showMsg('Erro ao processar aceite. Tente novamente.', 'erro');
      if (btn) { btn.disabled = false; btn.textContent = '✓ ACEITAR OFERTA'; }
    }
  }

  // ── Contra-proposta ───────────────────────────────────────────
  async function enviarContraproposta(token, dados) {
    var btn = document.getElementById('btnCpEnviar');
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
    hideMsg();

    try {
      var res = await client.rpc('enviar_contraproposta', {
        p_token:         token,
        p_nova_checkin:  dados.checkin  || null,
        p_nova_checkout: dados.checkout || null,
        p_novo_resort:   dados.resort   || null,
        p_nova_acomoda:  dados.acomoda  || null,
        p_observacoes:   dados.obs      || null
      });

      if (res.error) throw new Error(res.error.message);

      var result = res.data;
      if (!result || result.ok === false) {
        var erro = (result && result.erro) || 'Não foi possível enviar a solicitação.';
        showMsg(erro, 'erro');
        if (btn) { btn.disabled = false; btn.textContent = 'Enviar Solicitação'; }
        return;
      }

      showMsg('Sua solicitação foi enviada! A equipe HOSPEDAH entrará em contato em breve.', 'sucesso');
      var btnAlt = document.getElementById('btnAlterar');
      if (btnAlt) btnAlt.style.display = 'none';
      var form = document.getElementById('formContraproposta');
      if (form) form.style.display = 'none';

    } catch (err) {
      showMsg('Erro ao enviar solicitação. Tente novamente.', 'erro');
      if (btn) { btn.disabled = false; btn.textContent = 'Enviar Solicitação'; }
    }
  }

  // ── Eventos ───────────────────────────────────────────────────
  function bindEvents(token) {
    var btnAceitar = document.getElementById('btnAceitar');
    var btnAlterar = document.getElementById('btnAlterar');
    var formCP     = document.getElementById('formContraproposta');

    if (btnAceitar) {
      btnAceitar.addEventListener('click', function () {
        if (confirm('Confirmar aceite desta oferta?')) {
          aceitarOferta(token);
        }
      });
    }

    if (btnAlterar && formCP) {
      btnAlterar.addEventListener('click', function () {
        var visible = formCP.style.display === 'block';
        formCP.style.display = visible ? 'none' : 'block';
        btnAlterar.textContent = visible ? '✎ Solicitar Alteração' : '✕ Cancelar Alteração';
      });
    }

    if (formCP) {
      formCP.addEventListener('submit', function (e) {
        e.preventDefault();
        var dados = {
          checkin:  document.getElementById('cpCheckin').value  || null,
          checkout: document.getElementById('cpCheckout').value || null,
          resort:   document.getElementById('cpResort').value.trim()  || null,
          acomoda:  document.getElementById('cpAcomoda').value.trim() || null,
          obs:      document.getElementById('cpObs').value.trim()     || null
        };
        enviarContraproposta(token, dados);
      });
    }
  }

  // ── Init ─────────────────────────────────────────────────────
  function init() {
    client = window.supabase.createClient(window.HOSPEDAH_SB_URL, window.HOSPEDAH_SB_ANON);

    var token = getToken();
    if (!token) {
      hide('ofertaLoading');
      show('ofertaErro');
      return;
    }

    // Definir título da página com o token (SEO irrelevante, mas útil em abas)
    document.title = 'Oferta Exclusiva | HOSPEDAH';

    bindEvents(token);
    loadOferta(token);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
