/* eslint-disable */
'use strict';

// fbq('init', 'SEU_PIXEL_ID');
  // fbq('track', 'PageView');

'use strict';

const CONFIG = {
  whatsapp: {
    flavio: '5517982006382',
    juliana: '5517992068296'
  },
  iaChatUrl: 'https://hospedah.tur.br/chat.html',
  reservasUrl: 'https://hospedah.tur.br/reservas.html',
  instagram: 'https://www.instagram.com/julianasilvaoliveira.joao',
  economiaDesconto: 0.20
};
window.CONFIG = CONFIG;

const WA_MESSAGES = {
  hospedagem: 'Olá! Quero viajar e preciso de ajuda para encontrar a melhor hospedagem com a HOSPEDAH.',
  juliana: 'Olá, Juliana! Quero ajuda para escolher hospedagem e datas da minha viagem.',
  cota: function (destino, dormitorios, semanas, temporada) {
    return 'Olá! Tenho interesse em *ter uma cota* com a HOSPEDAH.\n' +
      'Destino: ' + (destino || 'a definir') + '\n' +
      'Dormitórios: ' + (dormitorios || 'a definir') + '\n' +
      'Semanas: ' + (semanas || 'a definir') + '\n' +
      'Temporada: ' + (temporada || 'a definir');
  },
  oportunidade: function (nome, score) {
    return 'Olá! Vi a cota *' + nome + '* (HOSPEDAH Score ' + score + ') no site HOSPEDAH e quero mais informações.';
  },
  score: 'Olá! Quero saber o *HOSPEDAH Score* de uma cota específica, inclusive da minha.',
  vender: 'Olá! Sou proprietário e quero *vender minha cota* com apoio da HOSPEDAH.',
  anunciar: 'Olá! Sou proprietário e quero *anunciar minha cota* no Radar HOSPEDAH.',
  avaliar: 'Olá! Sou proprietário e quero *avaliar o Score* da minha cota.',
  gestao: 'Olá! Sou proprietário e quero conhecer a *gestão especializada* da HOSPEDAH para minha cota.',
  especialista: 'Olá! Quero falar com um *especialista HOSPEDAH* sobre cotas e oportunidades.',
  flavio: 'Olá, Flávio! Quero falar sobre cotas, oportunidades e suporte para proprietários.'
};

const WA_ROUTING = {
  hospedagem: 'juliana',
  juliana: 'juliana'
};

function trackEvent(nome, parametros) {
  if (typeof gtag === 'function') {
    gtag('event', nome, parametros || {});
  }
}

function openExternalUrl(url) {
  var newWindow = window.open(url, '_blank', 'noopener,noreferrer');
  if (newWindow) {
    newWindow.opener = null;
  } else {
    window.location.href = url;
  }
}

function openWhatsApp(key) {
  var args = Array.prototype.slice.call(arguments, 1);
  var atendente = WA_ROUTING[key] || 'flavio';
  var numero = CONFIG.whatsapp[atendente];
  var template = WA_MESSAGES[key] || WA_MESSAGES.especialista;
  var mensagem = typeof template === 'function' ? template.apply(null, args) : template;
  trackEvent('whatsapp_click', { event_category: 'conversao', event_label: key, atendente: atendente });
  openExternalUrl('https://wa.me/' + numero + '?text=' + encodeURIComponent(mensagem));
}

function atualizarTextoEconomia() {
  var el = document.getElementById('economiaPercent');
  if (el) el.textContent = Math.round(CONFIG.economiaDesconto * 100) + '%';
}

function calcularEconomia() {
  var diaria = parseFloat(document.getElementById('diaria').value) || 800;
  var noites = parseInt(document.getElementById('calc_noites').value, 10) || 3;
  if (diaria < 1) diaria = 1;
  if (noites < 1) noites = 1;
  if (noites > 30) noites = 30;
  var totalDireto = noites * diaria;
  var economia = noites * diaria * CONFIG.economiaDesconto;
  var totalHospedah = totalDireto - economia;
  var fmt = function(v) { return 'R$ ' + v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
  document.getElementById('calcDireto').textContent = fmt(totalDireto);
  document.getElementById('calcHospedah').textContent = fmt(totalHospedah);
  document.getElementById('calcEconomia').textContent = fmt(economia);
}

document.addEventListener('DOMContentLoaded', function () {
  atualizarTextoEconomia();
  calcularEconomia();
});

/* =====================
   TEMA
===================== */
(function () {
  var html = document.documentElement;
  var btn  = document.getElementById('btnTema');
  var salvo = localStorage.getItem('hospedah_tema') || 'dark';
  html.setAttribute('data-theme', salvo);
  btn.textContent = salvo === 'dark' ? '🌓' : '🌞';

  btn.addEventListener('click', function () {
    var novo = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', novo);
    btn.textContent = novo === 'dark' ? '🌓' : '🌞';
    localStorage.setItem('hospedah_tema', novo);
  });
})();

/* =====================
   ✅ MENU MOBILE
===================== */
var hamburger = document.getElementById('hamburger');
var mainNav = document.getElementById('mainNav');
var navDrawer = document.getElementById('navDrawer');
var navOverlay = document.getElementById('navOverlay');

function closeDrawer() {
  if (mainNav) mainNav.classList.remove('nav-open');
  var navMoreBtn = document.getElementById('navMoreBtn');
  var navMoreMenu = document.getElementById('navMoreMenu');
  if (navMoreMenu) navMoreMenu.classList.remove('open');
  if (navMoreBtn) navMoreBtn.setAttribute('aria-expanded', 'false');
  if (hamburger) {
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.setAttribute('aria-label', 'Abrir menu');
  }
  document.body.style.overflow = '';
}

function toggleMenu() {
  if (!mainNav || !hamburger) return;
  mainNav.classList.toggle('nav-open');
  var aberto = mainNav.classList.contains('nav-open');
  hamburger.setAttribute('aria-expanded', aberto ? 'true' : 'false');
  hamburger.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
  document.body.style.overflow = aberto ? 'hidden' : '';
}

if (hamburger) {
  hamburger.addEventListener('click', function () {
    toggleMenu();
    if (navDrawer) navDrawer.classList.remove('open');
    if (navOverlay) navOverlay.classList.remove('open');
  });
}

document.querySelectorAll('#mainNav a').forEach(function (link) {
  link.addEventListener('click', closeDrawer);
});
document.addEventListener('keydown', function (event) {
  if (event.key === 'Escape') closeDrawer();
});

/* ── DROPDOWN MAIS ── */
(function () {
  var btn = document.getElementById('navMoreBtn');
  var menu = document.getElementById('navMoreMenu');
  if (!btn || !menu) return;

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    var open = menu.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  document.addEventListener('click', function (e) {
    if (!menu.contains(e.target) && e.target !== btn) {
      menu.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      menu.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
})();


/* =====================
   ✅ HERO CARROSSEL
===================== */
(function () {
  var slides  = document.querySelectorAll('.hero-slide');
  var dots    = document.querySelectorAll('.hero-dot');
  var current = 0;
  var total   = slides.length;
  var timer;

  function showSlide(idx) {
    slides[current].classList.remove('active');
    dots[current].classList.remove('active');
    current = (idx + total) % total;
    slides[current].classList.add('active');
    dots[current].classList.add('active');
  }
  function autoPlay() {
    clearInterval(timer);
    timer = setInterval(function () { showSlide(current + 1); }, 5000);
  }

  document.getElementById('heroNext').addEventListener('click', function () {
    showSlide(current + 1); autoPlay();
  });
  document.getElementById('heroPrev').addEventListener('click', function () {
    showSlide(current - 1); autoPlay();
  });
  dots.forEach(function (dot, i) {
    dot.addEventListener('click', function () { showSlide(i); autoPlay(); });
  });

  // Pausa ao hover
  var hero = document.querySelector('.hero');
  hero.addEventListener('mouseenter', function () { clearInterval(timer); });
  hero.addEventListener('mouseleave', autoPlay);

  // Touch/swipe
  var touchStartX = 0;
  hero.addEventListener('touchstart', function (e) {
    touchStartX = e.changedTouches[0].clientX;
  }, { passive: true });
  hero.addEventListener('touchend', function (e) {
    var diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) { showSlide(diff > 0 ? current + 1 : current - 1); autoPlay(); }
  }, { passive: true });

  autoPlay();
})();

/* =====================
   ✅ BUSCA DE HOSPEDAGEM E COTAS
===================== */
function formatarData(valor) {
  if (!valor) return 'a definir';
  return new Date(valor + 'T12:00:00').toLocaleDateString('pt-BR');
}

function getReservasUrlBase() {
  var host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'reservas.html';
  return CONFIG.reservasUrl;
}

function navigateTo(url) {
  window.location.assign(url);
}

function buildHospedagemBuscaUrl() {
  var destino = (document.getElementById('destinoHospedagem') || {}).value || '';
  var entrada = (document.getElementById('checkin') || {}).value || '';
  var saida = (document.getElementById('checkout') || {}).value || '';
  var pessoas = (document.getElementById('pessoas') || {}).value || '';
  var cliente = (document.getElementById('clienteNome') || {}).value || '';
  var contato = (document.getElementById('clienteContato') || {}).value || '';
  var obs = (document.getElementById('clienteObs') || {}).value || '';
  var params = new URLSearchParams();
  if (destino) params.set('resort', destino);
  if (entrada) params.set('entrada', entrada);
  if (saida) params.set('saida', saida);
  if (pessoas) params.set('hospedes', pessoas);
  if (cliente) params.set('nome', cliente);
  if (contato) params.set('contato', contato);
  if (obs) params.set('obs', obs);
  return getReservasUrlBase() + (params.toString() ? '?' + params.toString() : '');
}

function buscarHospedagem() {
  var destino = (document.getElementById('destinoHospedagem') || {}).value || '';
  trackEvent('busca', { event_category: 'engajamento', event_label: 'hospedagem', destino: destino || 'todos' });
  navigateTo(buildHospedagemBuscaUrl());
}

function buscarCota() {
  var destino = (document.getElementById('cotaDestino') || {}).value || '';
  var dormitorios = (document.getElementById('cotaDormitorios') || {}).value || '';
  var semanas = (document.getElementById('cotaSemanas') || {}).value || '';
  var temporada = (document.getElementById('cotaTemporada') || {}).value || '';
  trackEvent('busca', { event_category: 'engajamento', event_label: 'cota', destino: destino || 'a definir' });
  var op = document.getElementById('oportunidades');
  if (op) op.scrollIntoView({ behavior: 'smooth', block: 'start' });
  openWhatsApp('cota', destino, dormitorios, semanas, temporada);
}

function abrirChatIA() {
  trackEvent('ia_click', { event_category: 'engajamento' });
  openExternalUrl(CONFIG.iaChatUrl);
}

function heroSearch() {
  var resort = document.getElementById('hs_resort').value || '';
  var entrada = document.getElementById('hs_entrada').value || '';
  var saida = document.getElementById('hs_saida').value || '';
  var pessoas = document.getElementById('hs_pessoas').value || '';
  var params = new URLSearchParams();
  if (resort) params.set('resort', resort);
  if (entrada) params.set('entrada', entrada);
  if (saida) params.set('saida', saida);
  if (pessoas) params.set('hospedes', pessoas);
  trackEvent('busca', { event_category: 'engajamento', event_label: 'hospedagem', destino: resort || 'todos' });
  navigateTo(getReservasUrlBase() + (params.toString() ? '?' + params.toString() : ''));
}

// ============================================================
// A/B TEST — Hero CTA (pure JS, no frameworks)
// ============================================================
(function abTest() {
  var AB_KEY = 'hospedah_ab_hero';
  var variant = localStorage.getItem(AB_KEY);
  if (!variant) {
    variant = Math.random() < 0.5 ? 'A' : 'B';
    localStorage.setItem(AB_KEY, variant);
  }
  var cta = document.getElementById('heroCTA');
  if (cta && variant === 'B') {
    cta.innerHTML = '📅 Ver disponibilidade';
  }
  if (window.dataLayer) dataLayer.push({ event: 'ab_test_view', variant: variant, test: 'hero_cta' });
})();

function heroCTAClick() {
  var variant = localStorage.getItem('hospedah_ab_hero') || 'A';
  if (window.dataLayer) dataLayer.push({ event: 'ab_test_convert', variant: variant, test: 'hero_cta' });
  heroSearch();
}

/* =====================
   TABS GALERIA
===================== */
document.addEventListener('DOMContentLoaded', function () {
  var tabs   = document.querySelectorAll('.tab');
  var blocks = document.querySelectorAll('.gallery-block');

  tabs.forEach(function (tab, idx) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t, i) {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
        t.setAttribute('tabindex', '-1');
        blocks[i].classList.remove('active');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      tab.setAttribute('tabindex', '0');
      blocks[idx].classList.add('active');
    });
    tab.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { var n = (idx+1)%tabs.length; tabs[n].click(); tabs[n].focus(); }
      if (e.key === 'ArrowLeft')  { var p = (idx+tabs.length-1)%tabs.length; tabs[p].click(); tabs[p].focus(); }
    });
  });
});

/* =====================
   CONTADOR DE VISITANTES — hero-viewers-pill
===================== */
(function () {
  var el = document.getElementById('heroViewersCount');
  if (!el) { return; }
  var count = Math.floor(Math.random() * 31) + 35; /* 35–65 */
  el.textContent = count;
  var timer = setInterval(function () {
    if (!document.body.contains(el)) { clearInterval(timer); return; }
    var delta = Math.random() < 0.5 ? 1 : -1;
    count = Math.min(65, Math.max(35, count + delta));
    el.textContent = count;
  }, 4500);
}());

/* =====================
   LIGHTBOX
===================== */
(function () {
  var lb      = document.getElementById('lightbox');
  var lbImg   = document.getElementById('lb-img');
  var current = 0;
  var imgs    = [];

  function open(arr, idx) {
    imgs = arr; current = idx;
    lbImg.src = imgs[current].src;
    lbImg.alt = imgs[current].alt;
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function close() {
    lb.classList.remove('open');
    document.body.style.overflow = '';
    lbImg.src = '';
  }
  function go(idx) {
    current = (idx + imgs.length) % imgs.length;
    lbImg.src = imgs[current].src;
    lbImg.alt = imgs[current].alt;
  }

  document.addEventListener('click', function (e) {
    if (e.target.matches('.gallery img')) {
      var all = Array.from(e.target.closest('.gallery').querySelectorAll('img'));
      open(all, all.indexOf(e.target));
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && document.activeElement.matches('.gallery img'))
      document.activeElement.click();
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape')     close();
    if (e.key === 'ArrowRight') go(current + 1);
    if (e.key === 'ArrowLeft')  go(current - 1);
  });
  document.getElementById('lb-close').addEventListener('click', close);
  lb.addEventListener('click', function (e) { if (e.target === lb) close(); });
  document.getElementById('lb-prev').addEventListener('click', function () { go(current - 1); });
  document.getElementById('lb-next').addEventListener('click', function () { go(current + 1); });
})();

/* =====================
   CARROSSEL DEPOIMENTOS
===================== */
(function () {
  var cards   = document.querySelectorAll('.depo-card');
  var dots    = document.querySelectorAll('.depo-dot');
  var current = 0;
  var max     = cards.length;
  var timer;

  function show(idx) {
    cards.forEach(function (c, i) { c.classList.toggle('active', i === idx); });
    dots.forEach(function  (d, i) { d.classList.toggle('active', i === idx); });
    current = idx;
  }
  function autoPlay() {
    clearInterval(timer);
    timer = setInterval(function () { show((current + 1) % max); }, 8500);
  }

  document.getElementById('depoNext').addEventListener('click', function () { show((current+1)%max); autoPlay(); });
  document.getElementById('depoPrev').addEventListener('click', function () { show((current+max-1)%max); autoPlay(); });
  dots.forEach(function (dot, i) {
    dot.addEventListener('click', function () { show(i); autoPlay(); });
    dot.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { show(i); autoPlay(); e.preventDefault(); }
    });
  });
  document.querySelector('.depo-carousel-wrap').addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { show((current+1)%max); autoPlay(); e.preventDefault(); }
    if (e.key === 'ArrowLeft')  { show((current+max-1)%max); autoPlay(); e.preventDefault(); }
  });

  autoPlay();
})();

/* =====================
   PRÉ-RESERVA
===================== */
function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escJs(str) { return String(str).replace(/'/g,"\\'"); }

function togglePeriodos() {
  var container = document.getElementById('periodosContainer');
  var btn = document.getElementById('btnTogglePeriodos');
  var aberto = container.classList.toggle('aberto');
  btn.textContent = aberto ? '➖ Ocultar períodos disponíveis' : '➕ Adicionar períodos disponíveis (opcional)';
}

function adicionarPeriodo() {
  var list = document.getElementById('periodosList');
  if (list.children.length >= 8) {
    document.getElementById('btnAddPeriodo').style.display = 'none';
    return;
  }
  var row = document.createElement('div');
  row.className = 'periodo-row';
  row.innerHTML =
    '<input type="text" placeholder="Ex.: de 04 a 10/05" class="emp-periodo-de">' +
    '<input type="text" placeholder="Ex.: R$ 1.200,00" class="emp-periodo-valor">' +
    '<button type="button" class="btn-rem-periodo" onclick="removerPeriodo(this)" title="Remover">✕</button>';
  list.appendChild(row);
  if (list.children.length >= 8) {
    document.getElementById('btnAddPeriodo').style.display = 'none';
  }
}

function removerPeriodo(btn) {
  var row = btn.parentElement;
  row.parentElement.removeChild(row);
  document.getElementById('btnAddPeriodo').style.display = '';
}

function enviarCadastroEmp(e) {
  e.preventDefault();
  var nome     = document.getElementById('empNome').value.trim();
  var tipo     = document.getElementById('empTipo').value;
  var dorm     = document.getElementById('empDorm').value;
  var cap      = document.getElementById('empCapacidade').value;
  var cidade   = document.getElementById('empCidade').value.trim();
  var contato  = document.getElementById('empContato').value.trim();
  var whatsapp = document.getElementById('empWhatsapp').value.trim();

  var periodosDes = document.querySelectorAll('.emp-periodo-de');
  var periodosVal = document.querySelectorAll('.emp-periodo-valor');
  var periodosStr = '';
  for (var i = 0; i < periodosDes.length; i++) {
    var de  = periodosDes[i].value.trim();
    var val = periodosVal[i].value.trim();
    if (de || val) {
      periodosStr += '\n   ' + (i + 1) + '. ' + (de || '—') + ' | ' + (val || '—');
    }
  }

  var msg =
    '🏢 *CADASTRO DE EMPREENDIMENTO - HOSPEDAH*\n\n' +
    '📌 *Nome:* ' + nome + '\n' +
    '🏨 *Tipo:* ' + tipo + '\n' +
    '🛏️ *Dormitórios:* ' + dorm + '\n' +
    '👥 *Capacidade:* ' + cap + ' pessoas\n' +
    (periodosStr ? '📅 *Períodos disponíveis:*' + periodosStr + '\n' : '') +
    '📍 *Cidade:* ' + cidade + '\n' +
    '👤 *Responsável:* ' + contato + '\n' +
    '📱 *WhatsApp:* ' + whatsapp;
  var msgEl = document.getElementById('msgCadastro');
  var waCadUrl = 'https://wa.me/5517982006382?text=' + encodeURIComponent(msg);
  msgEl.style.cssText = 'margin-top:10px;color:#25D366;font-size:13px;';
  msgEl.textContent = '✅ Redirecionando para o WhatsApp...';
  /* Abre na mesma chamada do clique — setTimeout bloqueia o popup no navegador */
  var waCadWin = window.open(waCadUrl, '_blank');
  if (!waCadWin) {
    window.location.href = waCadUrl;
  }
}

function buscar() {
  buscarHospedagem();
}
function consultar(nome, preco) {
  var cliente = document.getElementById('clienteNome').value.trim();
  var contato = document.getElementById('clienteContato').value.trim();
  var entrada = (document.getElementById('checkin') || document.getElementById('entrada')).value;
  var saida   = (document.getElementById('checkout') || document.getElementById('saida')).value;
  var pessoas = document.getElementById('pessoas').value;
  var dormEl  = document.getElementById('filtroDorm') || document.getElementById('cotaDormitorios');
  var dorm    = dormEl ? dormEl.value : '';
  if (!cliente || !contato) { alert('Preencha seu nome e WhatsApp.'); return; }

  // ✅ Evento de conversão Meta Pixel
  if (typeof fbq === 'function') fbq('track', 'InitiateCheckout', { content_name: nome, value: preco, currency: 'BRL' });
  if (window.dataLayer) dataLayer.push({ event: 'consultar_imovel', nome: nome });

  var msg = encodeURIComponent(
    'Olá! Gostaria de consultar disponibilidade:\n\n' +
    '👤 Nome: '         + cliente + '\n' +
    '📞 Contato: '      + contato + '\n' +
    '🏨 Imóvel: '       + nome    + '\n' +
    '📅 Entrada: '      + (entrada || 'A definir') + '\n' +
    '📅 Saída: '        + (saida   || 'A definir') + '\n' +
    '👥 Pessoas: '      + (pessoas || 'A definir') + '\n' +
    '🛏️ Dormitórios: '  + (dorm    || 'Qualquer') + '\n' +
    '💰 Valor base: R$ ' + Number(preco).toLocaleString('pt-BR') + '\n' +
    getUtmSuffix()
  );
  var waConsultUrl = 'https://wa.me/5517982006382?text=' + msg;
  var waConsultWin = window.open(waConsultUrl, '_blank');
  if (!waConsultWin) { window.location.href = waConsultUrl; }
}

/* =====================
   ORÇAMENTO
===================== */

/**
 * Notifica o admin via Z-API (Supabase Edge Function notificacao-reserva).
 * Chamada em segundo plano — não bloqueia o fluxo do usuário.
 * @param {{ nome_hospede:string, email_hospede:string, telefone:string,
 *           resort_nome:string, data_entrada:string|null, data_saida:string|null,
 *           num_hospedes:number, mensagem:string|null }} record
 */
function notificarAdminOrcamento(record) {
  try {
    var SB_URL = 'https://ydrmjoppjxtmnwtvtinb.supabase.co';
    var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlkcm1qb3Bwanh0bW53dHZ0aW5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNzA3MzksImV4cCI6MjA5MTg0NjczOX0.Gp4ed332v62sC5e5GXXbPqOIBNpS4EzMCFawnBJE_Cw';
    var payload = Object.assign({}, record, {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2)
    });
    fetch(SB_URL + '/functions/v1/notificacao-reserva', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + SB_KEY,
        'apikey': SB_KEY
      },
      body: JSON.stringify({ record: payload })
    }).catch(function (err) { console.warn('[HOSPEDAH] Falha ao notificar admin:', err); });
  } catch (err) { console.warn('[HOSPEDAH] notificarAdminOrcamento erro:', err); }
}

function enviarOrcamento(e) {
  if (e && e.preventDefault) e.preventDefault();

  /* ── 1. Coletar dados ── */
  var nome    = document.getElementById('orc_nome').value.trim();
  var wpp     = document.getElementById('orc_wpp').value.trim();
  var email   = document.getElementById('orc_email').value.trim();
  var resort  = document.getElementById('orc_resort').value;
  var pessoas = document.getElementById('orc_pessoas').value;
  var entrada = document.getElementById('orc_entrada').value;
  var saida   = document.getElementById('orc_saida').value;
  var obs     = document.getElementById('orc_obs').value.trim();

  if (!nome || !wpp || !resort || !pessoas || !entrada || !saida) {
    alert('Preencha todos os campos obrigatórios.'); return;
  }

  /* ── 2. Construir URL do WhatsApp PRIMEIRO — nada pode bloquear isso ── */
  var waMsg = encodeURIComponent(
    '🏨 *Solicitação de Orçamento — HOSPEDAH*\n\n' +
    '👤 Nome: '     + nome    + '\n' +
    '📞 WhatsApp: ' + wpp     + '\n' +
    (email ? '📧 E-mail: ' + email + '\n' : '') +
    '🏖️ Resort: '   + resort  + '\n' +
    '👥 Pessoas: '  + pessoas + '\n' +
    '📅 Entrada: '  + fmtDataOrc(entrada) + '\n' +
    '📅 Saída: '    + fmtDataOrc(saida)   + '\n' +
    (obs ? '📝 Obs: ' + obs + '\n' : '') +
    getUtmSuffix()
  );
  var waUrl = 'https://wa.me/5517982006382?text=' + waMsg;

  /* ── 3. Guardar dados para PDF / referral ── */
  window._orcDados = { nome: nome, wpp: wpp, email: email, resort: resort,
    pessoas: pessoas, entrada: entrada, saida: saida, obs: obs };

  /* ── 4. Exibir painel de sucesso e abrir WhatsApp ── */
  var wizard = document.getElementById('orcWizard');
  if (wizard) wizard.style.display = 'none';
  mostrarPainelSucesso(waUrl);

  var waWin = window.open(waUrl, '_blank');
  if (!waWin) {
    /* Pop-up bloqueado: o botão no painel de sucesso garante o envio */
    var btn = document.getElementById('orc_wpp_btn');
    if (btn) {
      btn.style.animation = 'pulse 1s infinite';
      btn.textContent = '📲 Clique aqui para enviar pelo WhatsApp';
    }
  }

  /* ── 5. Operações secundárias — cada uma isolada em try/catch ── */

  /* Analytics */
  try {
    if (typeof fbq === 'function') fbq('track', 'Lead', { content_name: resort });
    if (window.dataLayer) window.dataLayer.push({ event: 'orcamento_enviado', resort: resort });
  } catch (_) {}

  /* Formspree — notifica a equipe por e-mail */
  try {
    fetch('https://formspree.io/f/mzdoavpo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        tipo: 'orcamento', nome: nome, whatsapp: wpp, email: email,
        resort: resort, pessoas: pessoas, entrada: entrada, saida: saida,
        obs: obs, utm: getUtmStr()
      })
    }).catch(function () {});
  } catch (_) {}

  /* Salvar lead no abandono_reserva (CRM / retargeting) */
  try {
    if (typeof salvarLeadSupabase === 'function') {
      salvarLeadSupabase({ nome: nome, wpp: wpp, email: email, resort: resort,
        pessoas: pessoas, entrada: entrada, saida: saida, obs: obs });
    }
  } catch (_) {}

  /* Registrar na tabela leads para o painel administrativo */
  try {
    var client = window._sb;
    if (client) {
      var utm = getUtmStr() || '';
      var utmParts = {};
      utm.split('&').forEach(function (p) {
        var kv = p.split('=');
        if (kv.length === 2) utmParts[kv[0]] = kv[1];
      });
      client.from('leads').insert([{
        nome:         nome,
        whatsapp:     wpp,
        email:        email   || null,
        resort_nome:  resort,
        num_pessoas:  parseInt(pessoas, 10) || null,
        data_entrada: entrada || null,
        data_saida:   saida   || null,
        observacoes:  obs     || null,
        origem:       'orcamento',
        utm_source:   utmParts.utm_source   || null,
        utm_medium:   utmParts.utm_medium   || null,
        utm_campaign: utmParts.utm_campaign || null
      }]).catch(function (err) {
        console.warn('[HOSPEDAH] Falha ao salvar lead:', err);
      });
    }
  } catch (_) {}

  /* Notificar admin via Z-API / Edge Function */
  try {
    notificarAdminOrcamento({
      nome_hospede:  nome,
      email_hospede: email || '',
      telefone:      wpp,
      resort_nome:   resort,
      data_entrada:  entrada,
      data_saida:    saida,
      num_hospedes:  parseInt(pessoas, 10) || 1,
      mensagem:      obs || null
    });
  } catch (_) {}

  /* Nurturing — sequência de e-mail pós-captura */
  try {
    if (email) agendarNurturingEmail({ nome: nome, email: email, resort: resort, entrada: entrada });
  } catch (_) {}
}

function mostrarFallbackWhatsApp(waUrl) {
  var wizard = document.getElementById('orcWizard');
  var painel = document.getElementById('orc_success');

  /* Ocultar wizard mesmo no fallback para não duplicar a UI */
  if (wizard) wizard.style.display = 'none';

  if (!painel) return;

  painel.innerHTML = '';
  painel.style.display = 'block';

  var icon = document.createElement('div');
  icon.style.cssText = 'font-size:2em;margin-bottom:8px;';
  icon.textContent = '⚠️';
  painel.appendChild(icon);

  var title = document.createElement('h3');
  title.style.cssText = 'color:#e6a817;margin-bottom:8px;';
  title.textContent = 'Seu navegador bloqueou a abertura do WhatsApp';
  painel.appendChild(title);

  var desc = document.createElement('p');
  desc.style.cssText = 'color:var(--cor-sub,#aab4c4);font-size:.9em;margin-bottom:16px;';
  desc.textContent = 'Clique no botão abaixo para enviar seu orçamento diretamente pelo WhatsApp:';
  painel.appendChild(desc);

  var btn = document.createElement('a');
  btn.href = waUrl;
  btn.target = '_blank';
  btn.rel = 'noopener noreferrer';
  btn.style.cssText = 'display:inline-block;padding:12px 28px;background:#25D366;color:#fff;border-radius:8px;font-weight:700;font-size:1em;text-decoration:none;margin-bottom:8px;';
  btn.textContent = '📲 Abrir WhatsApp';
  painel.appendChild(btn);

  painel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function mostrarPainelSucesso(waUrl) {
  var painel = document.getElementById('orc_success');
  if (!painel) return;

  /* Atualizar href do botão WhatsApp com a URL real do orçamento */
  var wppBtn = document.getElementById('orc_wpp_btn');
  if (wppBtn && waUrl) {
    wppBtn.href = waUrl;

    /* Mostrar confirmação quando o usuário voltar ao site após abrir o WhatsApp */
    var wppButtonClicked = false;
    function showConfirm() {
      if (!wppButtonClicked) return;
      var confirmEl = document.getElementById('orc_confirm_msg');
      if (confirmEl) confirmEl.style.display = 'block';
      wppBtn.textContent = '📲 Reenviar pelo WhatsApp';
      wppBtn.style.background = '#128c5e';
      /* Removes the listeners after showing the confirmation */
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    }
    function onVisible() { if (!document.hidden) showConfirm(); }
    function onFocus() { showConfirm(); }

    wppBtn.addEventListener('click', function () {
      wppButtonClicked = true;
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('focus', onFocus);
    }, { once: true });
  }

  painel.style.display = 'block';
  painel.scrollIntoView({ behavior: 'smooth', block: 'center' });

  /* Gerar link de indicação único baseado no WhatsApp */
  var dados = window._orcDados || {};
  if (dados.wpp) {
    var refSlug = btoa(dados.wpp.replace(/\D/g, '').slice(-8)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
    var refUrl  = 'https://hospedah.tur.br/reservas.html?ref=' + refSlug;
    var refEl   = document.getElementById('orc_referral');
    if (refEl) {
      refEl.innerHTML = '';

      var title = document.createElement('strong');
      title.style.color = 'var(--dourado,#D4AF37)';
      title.textContent = '🎁 Seu link de indicação:';
      refEl.appendChild(title);
      refEl.appendChild(document.createElement('br'));

      var urlSpan = document.createElement('span');
      urlSpan.style.cssText = 'font-family:monospace;background:rgba(0,0,0,.3);padding:3px 8px;border-radius:5px;color:#fff;';
      urlSpan.textContent = refUrl;
      refEl.appendChild(urlSpan);
      refEl.appendChild(document.createElement('br'));

      var hint = document.createElement('small');
      hint.style.cssText = 'margin-top:6px;display:block;';
      hint.textContent = 'Compartilhe com amigos e família — quem reservar via seu link ganha R$30 de desconto e você acumula pontos de fidelidade!';
      refEl.appendChild(hint);

      var copyBtn = document.createElement('button');
      copyBtn.style.cssText = 'margin-top:8px;padding:6px 16px;background:var(--dourado,#D4AF37);color:#0B1C3D;border:none;border-radius:6px;font-weight:700;cursor:pointer;font-size:.82em;';
      copyBtn.textContent = '📋 Copiar link';
      copyBtn.addEventListener('click', function () {
        navigator.clipboard.writeText(refUrl)
          .then(function () { copyBtn.textContent = '✅ Copiado!'; })
          .catch(function () {});
      });
      refEl.appendChild(copyBtn);
    }
  }
}

/* =====================
   CADASTRO EMPREENDIMENTO
===================== */
function enviarCadastro(e) {
  e.preventDefault();
  var nome        = document.getElementById('multi_nome').value.trim();
  var proprietario = document.getElementById('multi_proprietario').value.trim();
  var tel         = document.getElementById('multi_tel').value.trim();
  var dorm        = document.getElementById('multi_dorm').value;
  var andar       = document.getElementById('multi_andar').value.trim();
  var vista       = document.getElementById('multi_vista').value.trim();
  var temporada   = document.getElementById('multi_temporada').value;
  var semanas     = document.getElementById('multi_semanas').value;
  var quitada     = document.getElementById('multi_quitada').value;
  var valor       = document.getElementById('multi_valor').value;
  if (!nome || !proprietario || !tel || !dorm || !andar || !vista || !temporada || !semanas || !quitada || !valor) {
    alert('Preencha todos os campos obrigatórios.'); return;
  }
  if (typeof fbq === 'function') fbq('track', 'Lead', { content_name: 'multipropriedade' });
  if (window.dataLayer) dataLayer.push({ event: 'cadastro_multipropriedade' });

  /* Formspree — notifica equipe e alimenta CRM */
  fetch('https://formspree.io/f/mzdoavpo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      tipo: 'gestao_multipropriedade', empreendimento: nome, proprietario: proprietario,
      telefone: tel, dormitorios: dorm, andar: andar, vista: vista,
      temporada: temporada, semanas: semanas, quitada: quitada, valor: valor, utm: getUtmStr()
    })
  }).catch(function() {});

  var msg = encodeURIComponent(
    '💎 *Gestão | Multipropriedades — HOSPEDAH*\n\n' +
    '🏢 Empreendimento: '   + nome         + '\n' +
    '👤 Proprietário: '     + proprietario + '\n' +
    '📞 Telefone: '         + tel          + '\n' +
    '🛏️ Dormitórios: '      + dorm         + '\n' +
    '🏬 Andar: '            + andar        + '\n' +
    '🌅 Vista da fachada: ' + vista        + '\n' +
    '📅 Temporada: '        + temporada    + '\n' +
    '📆 Semanas: '          + semanas      + '\n' +
    '✅ Quitada: '          + quitada      + '\n' +
    '💰 Valor: R$ '         + Number(valor).toLocaleString('pt-BR') + '\n' +
    getUtmSuffix()
  );
  var waMultiUrl = 'https://wa.me/5517982006382?text=' + msg;
  var waMultiWin = window.open(waMultiUrl, '_blank');
  if (!waMultiWin) { window.location.href = waMultiUrl; }
  e.target.reset();
}

/* =====================
   CONTATO
===================== */
function enviarContato(e) {
  e.preventDefault();
  var nome = document.getElementById('cont_nome').value.trim();
  var wpp  = document.getElementById('cont_wpp').value.trim();
  var msg2 = document.getElementById('cont_msg').value.trim();
  if (!nome || !wpp || !msg2) { alert('Preencha todos os campos.'); return; }
  if (typeof fbq === 'function') fbq('track', 'Contact');
  if (window.dataLayer) dataLayer.push({ event: 'contato_enviado' });

  var msg = encodeURIComponent(
    '📬 *Contato — HOSPEDAH*\n\n' +
    '👤 Nome: '     + nome + '\n' +
    '📞 WhatsApp: ' + wpp  + '\n' +
    '💬 Mensagem: ' + msg2 + '\n' +
    getUtmSuffix()
  );
  var waContUrl = 'https://wa.me/5517982006382?text=' + msg;
  var waContWin = window.open(waContUrl, '_blank');
  if (!waContWin) { window.location.href = waContUrl; }
  e.target.reset();
}

/* =====================
   ✅ BOTÃO WPP FLUTUANTE INTELIGENTE
===================== */
var wppVisible = false;
function toggleWppBubble() {
  var bubble = document.getElementById('wppBubble');
  wppVisible = !wppVisible;
  bubble.classList.toggle('show', wppVisible);
}
function trackWpp() {
  if (typeof fbq === 'function') fbq('track', 'Contact');
  if (window.dataLayer) dataLayer.push({ event: 'whatsapp_click', source: 'float_button' });
}
/* =====================
   📤 COMPARTILHAR SITE
===================== */
function compartilharSite() {
  var shareData = {
    title: 'HOSPEDAH | Resorts e Experiências Exclusivas',
    text: 'Conheça a HOSPEDAH! Resorts premium com atendimento exclusivo. Reserve agora!',
    url: 'https://hospedah.tur.br/'
  };
  if (navigator.share) {
    navigator.share(shareData).catch(function () {});
  } else if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shareData.url).then(function () {
      alert('Link copiado: ' + shareData.url);
    }).catch(function () {
      alert('Compartilhe: ' + shareData.url);
    });
  } else {
    alert('Compartilhe: ' + shareData.url);
  }
}
// Aparece automaticamente após 4 segundos
setTimeout(function () {
  if (!wppVisible) {
    document.getElementById('wppBubble').classList.add('show');
    wppVisible = true;
  }
}, 4000);
// Aparece ao rolar 40% da página
window.addEventListener('scroll', function () {
  if (!wppVisible && window.scrollY > document.body.scrollHeight * 0.4) {
    document.getElementById('wppBubble').classList.add('show');
    wppVisible = true;
  }
}, { passive: true });

/* =====================
   GTM — Scroll Depth (home)
===================== */
(function () {
  var milestones = [25, 50, 75, 90];
  var fired = {};
  window.addEventListener('scroll', function () {
    if (!window.dataLayer) return;
    var scrolled = window.scrollY + window.innerHeight;
    var total    = document.documentElement.scrollHeight;
    var pct      = Math.round((scrolled / total) * 100);
    milestones.forEach(function (m) {
      if (pct >= m && !fired[m]) {
        fired[m] = true;
        dataLayer.push({ event: 'scroll_depth', pagina: 'home', porcentagem: m });
      }
    });
  }, { passive: true });
})();

/* =====================
   INICIA
===================== */

/* =====================
   BANNER LGPD
===================== */
(function () {
  var banner  = document.getElementById('cookie-banner');
  var consent = localStorage.getItem('hospedah_consent');
  if (consent === 'accepted' || consent === 'declined') { return; }
  banner.classList.add('visible');
  document.getElementById('btnCookieAccept').addEventListener('click', function () {
    localStorage.setItem('hospedah_consent', 'accepted');
    banner.classList.remove('visible');
    initTracking();
  });
  document.getElementById('btnCookieDecline').addEventListener('click', function () {
    localStorage.setItem('hospedah_consent', 'declined');
    banner.classList.remove('visible');
  });
})();

/* =====================
   CALCULADORA DE NOITES
===================== */
/* Formata data ISO (YYYY-MM-DD) para o padrão brasileiro DD/MM/AAAA */
function fmtDataOrc(v) {
  if (!v) return '—';
  var p = v.split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}

function calcNights(startId, endId) {
  var s = document.getElementById(startId).value;
  var e = document.getElementById(endId).value;
  if (!s || !e) return 0;
  var diff = (new Date(e) - new Date(s)) / 86400000;
  return diff > 0 ? diff : 0;
}
function updateNightsBadge(nights, containerId) {
  var el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = nights > 0
    ? '<span class="nights-badge">\uD83C\uDF19 ' + nights + (nights === 1 ? ' noite selecionada' : ' noites selecionadas') + '</span>'
    : '';
}
document.addEventListener('DOMContentLoaded', function () {
  ['hs_entrada', 'hs_saida'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', function () {
      updateNightsBadge(calcNights('hs_entrada', 'hs_saida'), 'hs_nights_display');
    });
  });
  ['orc_entrada', 'orc_saida'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', function () {
      updateNightsBadge(calcNights('orc_entrada', 'orc_saida'), 'orc_nights_display');
    });
  });
});

/* =====================
   WIZARD DE ORÇAMENTO
===================== */
function orcNextStep(current) {
  if (current === 1) {
    var resort  = (document.getElementById('orc_resort') || {}).value;
    var entrada = (document.getElementById('orc_entrada') || {}).value;
    var saida   = (document.getElementById('orc_saida') || {}).value;
    var pessoas = (document.getElementById('orc_pessoas') || {}).value;
    if (!resort)  { alert('Selecione o resort desejado.'); return; }
    if (!entrada) { alert('Informe a data de check-in.');  return; }
    if (!saida)   { alert('Informe a data de check-out.'); return; }
    if (new Date(saida) <= new Date(entrada)) { alert('Check-out deve ser após check-in.'); return; }
    if (!pessoas || parseInt(pessoas) < 1) { alert('Informe o número de pessoas.'); return; }
    if (window.dataLayer) dataLayer.push({ event: 'wizard_step', etapa: 2, resort: resort });
  } else if (current === 2) {
    var nome = (document.getElementById('orc_nome') || {}).value.trim();
    var wpp  = (document.getElementById('orc_wpp')  || {}).value.trim();
    if (!nome) { alert('Informe seu nome completo.'); return; }
    if (!wpp)  { alert('Informe seu WhatsApp.'); return; }
    // Build summary for step 3
    var resort   = (document.getElementById('orc_resort') || {}).value;
    var entrada  = (document.getElementById('orc_entrada') || {}).value;
    var saida    = (document.getElementById('orc_saida') || {}).value;
    var pessoas  = (document.getElementById('orc_pessoas') || {}).value;
    var email    = (document.getElementById('orc_email') || {}).value.trim();
    var noites   = calcNights('orc_entrada', 'orc_saida');
    var sumEl    = document.getElementById('orcSummary');
    if (sumEl) {
      // Escape values via textContent assignment to avoid XSS
      function row(icon, label, val) {
        var d = document.createElement('div');
        d.className = 'orc-summary-row';
        var s = document.createElement('span');
        s.textContent = icon + ' ' + label;
        var strong = document.createElement('strong');
        strong.textContent = val;
        d.appendChild(s);
        d.appendChild(strong);
        return d;
      }
      sumEl.textContent = '';
      sumEl.appendChild(row('🏖️', 'Resort',    resort));
      sumEl.appendChild(row('📅', 'Check-in',  fmtDataOrc(entrada)));
      sumEl.appendChild(row('📅', 'Check-out', fmtDataOrc(saida)));
      sumEl.appendChild(row('🌙', 'Noites',    noites));
      sumEl.appendChild(row('👥', 'Pessoas',   pessoas));
      sumEl.appendChild(row('👤', 'Nome',      nome));
      sumEl.appendChild(row('📱', 'WhatsApp',  wpp));
      if (email) sumEl.appendChild(row('📧', 'E-mail', email));
    }
    if (window.dataLayer) dataLayer.push({ event: 'wizard_step', etapa: 3 });
  }
  orcGoToPanel(current + 1);
}

function orcPrevStep(current) {
  orcGoToPanel(current - 1);
}

function orcGoToPanel(step) {
  [1, 2, 3].forEach(function (n) {
    var panel = document.getElementById('orcPanel' + n);
    var dot   = document.getElementById('dot' + n);
    if (panel) panel.classList.toggle('active', n === step);
    if (dot) {
      dot.classList.toggle('active', n === step);
      dot.classList.toggle('done', n < step);
    }
  });
  /* marca as linhas entre steps como concluídas */
  var lines = document.querySelectorAll('#orcWizard .orc-step-line');
  lines.forEach(function (line, idx) {
    line.classList.toggle('done', idx + 1 < step);
  });
  var wizard = document.getElementById('orcWizard');
  if (wizard) wizard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* =====================
   NURTURING — agendar e-mail pós-captura
===================== */
function agendarNurturingEmail(dados) {
  if (!dados.email) return;
  var client = window._sb;
  if (!client) return;
  client.from('email_nurturing_queue').insert([{
    email:       dados.email,
    nome:        dados.nome   || '',
    resort:      dados.resort || '',
    data_entrada: dados.entrada || null,
    sequencia:   'orcamento',
    status:      'pendente',
    proxima_em:  new Date(Date.now() + 3600 * 1000).toISOString(), // 1h depois
  }]).catch(function(err) {
    console.warn('[HOSPEDAH] Falha ao agendar nurturing:', err);
  });
}

/* =====================
   FAQ ACCORDION
===================== */
(function () {
  var btns = document.querySelectorAll('.faq-btn');
  btns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var idx  = btn.getAttribute('data-faq');
      var body = document.getElementById('faq-body-' + idx);
      var open = btn.getAttribute('aria-expanded') === 'true';
      btns.forEach(function (b) {
        var i = b.getAttribute('data-faq');
        var bd = document.getElementById('faq-body-' + i);
        b.setAttribute('aria-expanded', 'false');
        bd.classList.remove('open');
        bd.style.maxHeight = '0';
      });
      if (!open) {
        btn.setAttribute('aria-expanded', 'true');
        body.classList.add('open');
        body.style.maxHeight = body.scrollHeight + 'px';
      }
    });
  });
})();

/* =====================
   UTM TRACKING
   Captura parâmetros UTM da URL, persiste em
   sessionStorage e os anexa a todas as mensagens
   do WhatsApp e envios para o Formspree.
===================== */
var _utmStr = (function () {
  try {
    var p = new URLSearchParams(location.search);
    var keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
    var parts = keys.filter(function (k) { return p.get(k); })
                    .map(function (k) { return k + '=' + p.get(k); });
    if (parts.length) sessionStorage.setItem('hospedah_utm', parts.join('&'));
  } catch (ex) {}
  return sessionStorage.getItem('hospedah_utm') || '';
})();

function getUtmStr() { return _utmStr; }

function getUtmSuffix() {
  if (!_utmStr) return '';
  var readable = _utmStr
    .replace(/utm_/g, '')
    .replace(/=/g, ': ')
    .replace(/&/g, ' | ');
  return '📊 Origem: ' + readable;
}

/* =====================
   EXIT-INTENT — CAPTURA DE E-MAIL
   Envia lead para Formspree e abre WhatsApp
===================== */
function exitIntentSubmit(e) {
  e.preventDefault();
  var email = document.getElementById('ep-email-input').value.trim();
  if (!email) return;
  if (typeof fbq === 'function') fbq('track', 'Lead', { content_name: 'exit_intent' });
  if (window.dataLayer) dataLayer.push({ event: 'exit_intent_lead', email: email });
  fetch('https://formspree.io/f/mzdoavpo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ tipo: 'exit_intent', email: email, utm: getUtmStr() })
  }).catch(function () {});
  /* Redireciona para WhatsApp após capturar o e-mail */
  var waExitUrl = 'https://wa.me/5517982006382?text=' +
    encodeURIComponent('Olá! Tenho interesse nas ofertas exclusivas da HOSPEDAH. Meu e-mail: ' + email);
  var waExitWin = window.open(waExitUrl, '_blank');
  if (!waExitWin) { window.location.href = waExitUrl; }
  document.getElementById('exit-overlay').classList.remove('visible');
  document.body.style.overflow = '';
  sessionStorage.setItem('hospedah_exit_dismissed', '1');
}

/* =====================
   ⚡ PROMOÇÃO RELÂMPAGO — Countdown
   Expira ao final do dia (meia-noite) e reinicia no dia seguinte.
===================== */
(function () {
  var banner    = document.getElementById('promo-flash');
  var closeBtn  = document.getElementById('promoFlashClose');
  var countEl   = document.getElementById('promo-countdown');
  var HIDE_KEY  = 'hospedah_promo_hidden';

  if (!banner || sessionStorage.getItem(HIDE_KEY)) return;

  /* Mostra o banner após 2 s para não competir com o cookie banner */
  setTimeout(function () { banner.classList.add('visible'); }, 2000);

  /* Countdown até meia-noite (início do dia seguinte) */
  function tick() {
    var now  = new Date();
    var end  = new Date(now);
    end.setDate(end.getDate() + 1);
    end.setHours(0, 0, 0, 0);
    var diff = Math.max(0, Math.floor((end - now) / 1000));
    var h    = Math.floor(diff / 3600);
    var m    = Math.floor((diff % 3600) / 60);
    var s    = diff % 60;
    countEl.textContent =
      (h < 10 ? '0' : '') + h + ':' +
      (m < 10 ? '0' : '') + m + ':' +
      (s < 10 ? '0' : '') + s;
  }
  tick();
  var timer = setInterval(tick, 1000);

  closeBtn.addEventListener('click', function () {
    banner.classList.remove('visible');
    sessionStorage.setItem(HIDE_KEY, '1');
    clearInterval(timer);
  });
})();

/* =====================
   🤖 CHAT IA FLUTUANTE — bolha de apresentação
===================== */
(function () {
  var bubble  = document.getElementById('chatFloatBubble');
  var btn     = document.getElementById('chatFloatBtn');
  if (!bubble || !btn) return;

  /* Mostra a bolha após 6 s (depois do WhatsApp) */
  setTimeout(function () { bubble.classList.add('show'); }, 6000);
})();

(function () {
  'use strict';

  /* ── helpers ── */
  function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function $(id) { return document.getElementById(id); }

  /* ══════════════════════════════════════════
     1. EXIT-INTENT POPUP
     Dispara quando o cursor sai pela parte
     superior da janela (tentativa de fechar).
  ══════════════════════════════════════════ */
  (function exitIntent() {
    var overlay   = $('exit-overlay');
    var closeBtn  = $('ep-close-btn');
    var skipBtn   = $('ep-skip-btn');
    var shown     = false;
    var dismissed = sessionStorage.getItem('hospedah_exit_dismissed');

    function show() {
      if (shown || dismissed) return;
      shown = true;
      overlay.classList.add('visible');
      document.body.style.overflow = 'hidden';
    }
    function hide() {
      overlay.classList.remove('visible');
      document.body.style.overflow = '';
      sessionStorage.setItem('hospedah_exit_dismissed', '1');
    }

    /* Desktop: mouse sai pelo topo */
    document.addEventListener('mouseleave', function (e) {
      if (e.clientY < 5) show();
    });

    /* Mobile: usuário fica inativo 40 s */
    var mobileTimer;
    function resetMobileTimer() {
      clearTimeout(mobileTimer);
      mobileTimer = setTimeout(show, 40000);
    }
    ['touchstart', 'touchmove', 'scroll'].forEach(function (ev) {
      document.addEventListener(ev, resetMobileTimer, { passive: true });
    });
    resetMobileTimer();

    closeBtn.addEventListener('click', hide);
    skipBtn.addEventListener('click', hide);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) hide();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') hide();
    });
  })();

  /* ══════════════════════════════════════════
     3. PROVA SOCIAL — Toasts de reservas
  ══════════════════════════════════════════ */
  (function socialProof() {
    var container = $('social-proof-container');

    var events = [
      { nome: 'Fernanda S.',  cidade: 'São Paulo',      resort: 'Hot Beach Suites',     min: rand(2, 8)  },
      { nome: 'Ricardo M.',   cidade: 'Campinas',        resort: 'Olímpia Park Resort',  min: rand(1, 5)  },
      { nome: 'Juliana C.',   cidade: 'Ribeirão Preto',  resort: 'Wyndham Royal Resort', min: rand(3, 10) },
      { nome: 'Carlos A.',    cidade: 'São José dos Campos', resort: 'Solar das Águas', min: rand(1, 7)  },
      { nome: 'Beatriz L.',   cidade: 'Santos',          resort: 'Praia de Juquehy',     min: rand(5, 12) },
      { nome: 'Marcos T.',    cidade: 'Bauru',           resort: 'São Pedro Thermas',    min: rand(2, 9)  },
      { nome: 'Patrícia R.',  cidade: 'Sorocaba',        resort: 'Hot Beach Suites',     min: rand(1, 6)  },
      { nome: 'Eduardo F.',   cidade: 'Botucatu',        resort: 'Wyndham Royal Resort', min: rand(4, 11) },
    ];

    var idx = 0;

    function showToast() {
      var ev = events[idx % events.length];
      idx++;

      var toast = document.createElement('div');
      toast.className = 'sp-toast';

      var letter = ev.nome.charAt(0).toUpperCase();
      toast.innerHTML =
        '<div class="sp-avatar-letter">' + letter + '</div>' +
        '<div class="sp-text">' +
          '<strong>' + ev.nome + ' — ' + ev.cidade + '</strong>' +
          'Reservou o <em>' + ev.resort + '</em>' +
          '<div class="sp-time">há ' + ev.min + ' min&nbsp;✅</div>' +
        '</div>';

      container.appendChild(toast);

      /* Remove o toast após a animação de saída (6 s total) */
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 6200);
    }

    /* Primeira notificação após 8 s, depois a cada 18-30 s */
    setTimeout(function first() {
      showToast();
      setTimeout(function loop() {
        showToast();
        setTimeout(loop, rand(18000, 30000));
      }, rand(18000, 30000));
    }, 8000);
  })();

})();

(function () {
  'use strict';

  var SUPABASE_URL = 'https://ydrmjoppjxtmnwtvtinb.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlkcm1qb3Bwanh0bW53dHZ0aW5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNzA3MzksImV4cCI6MjA5MTg0NjczOX0.Gp4ed332v62sC5e5GXXbPqOIBNpS4EzMCFawnBJE_Cw';
  var sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  window._sb = sb; // expõe globalmente para agendarNurturingEmail e outros módulos

  /* ── 1. AggregateRating dinâmico no Schema.org ── */
  function atualizarAggregateRating() {
    sb.from('avaliacoes')
      .select('nota')
      .eq('aprovada', true)
      .then(function (res) {
        var data = res.data;
        if (!data || !data.length) return;
        var total  = data.length;
        var media  = (data.reduce(function (s, r) { return s + Number(r.nota); }, 0) / total).toFixed(1);
        var el     = document.getElementById('schema-aggregate');
        if (!el) return;
        el.textContent = JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'TravelAgency',
          '@id': 'https://hospedah.tur.br/#organization',
          'name': 'HOSPEDAH — Especialista em Hospedagens e Resorts',
          'alternateName': 'HOSPEDAH',
          'url': 'https://hospedah.tur.br',
          'aggregateRating': {
            '@type': 'AggregateRating',
            'ratingValue': media,
            'reviewCount': total,
            'bestRating': 5,
            'worstRating': 1
          }
        });
      })
      .catch(function () {});
  }

  /* ── 2. Social proof com dados reais da atividade_publica ── */
  function injetarSocialProofReal() {
    sb.from('atividade_publica')
      .select('resort_nome, cidade_hospede, criado_em')
      .order('criado_em', { ascending: false })
      .limit(20)
      .then(function (res) {
        var data = res.data;
        if (!data || !data.length) return;
        var container = document.getElementById('social-proof-container');
        if (!container) return;

        var idx   = 0;
        var total = data.length;

        function showRealToast() {
          var item   = data[idx % total];
          idx++;
          var now    = new Date();
          var criado = new Date(item.criado_em);
          var diffMin = Math.round((now - criado) / 60000);
          var label  = diffMin < 60
            ? 'há ' + diffMin + ' min'
            : diffMin < 1440
              ? 'há ' + Math.round(diffMin / 60) + 'h'
              : 'há ' + Math.round(diffMin / 1440) + ' dia(s)';

          var toast  = document.createElement('div');
          toast.className = 'sp-toast';
          var letra  = '★';
          toast.innerHTML =
            '<div class="sp-avatar-letter">' + letra + '</div>' +
            '<div class="sp-text">' +
              '<strong>' + escHtmlSP(item.resort_nome) + '</strong>' +
              'Nova reserva confirmada! ✅' +
              '<div class="sp-time">' + label + '</div>' +
            '</div>';
          container.appendChild(toast);
          setTimeout(function () {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
          }, 6200);
        }

        /* Intercala provas sociais reais com intervalo de 25–40 s */
        setTimeout(function realLoop() {
          showRealToast();
          setTimeout(realLoop, 25000 + Math.floor(Math.random() * 15000));
        }, 35000); /* começa após as estáticas dos primeiros 30 s */
      })
      .catch(function () {});
  }

  function escHtmlSP(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ── 3. Salvar lead no Supabase para CRM e retargeting ── */
  window.salvarLeadSupabase = function (dados) {
    try {
      var sid = sessionStorage.getItem('hospedah_abandon_sid_idx');
      if (!sid) {
        var arr = new Uint8Array(12);
        crypto.getRandomValues(arr);
        sid = Array.from(arr).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
        sessionStorage.setItem('hospedah_abandon_sid_idx', sid);
      }
      sb.from('abandono_reserva').upsert([{
        session_id:     sid,
        resort_nome:    dados.resort || null,
        email_hospede:  dados.email  || null,
        telefone:       dados.wpp    || null,
        data_entrada:   dados.entrada || null,
        data_saida:     dados.saida   || null,
        atualizado_em:  new Date().toISOString()
      }], { onConflict: 'session_id' }).catch(function () {});
    } catch (_) {}
  };

  /* Também salva no blur do campo e-mail do orçamento */
  document.addEventListener('DOMContentLoaded', function () {
    var orcEmail = document.getElementById('orc_email');
    var orcWpp   = document.getElementById('orc_wpp');
    function salvarParcial() {
      var email   = orcEmail ? orcEmail.value.trim() : '';
      var wpp     = orcWpp   ? orcWpp.value.trim()   : '';
      var resort  = (document.getElementById('orc_resort')  || {}).value || '';
      var entrada = (document.getElementById('orc_entrada') || {}).value || '';
      var saida   = (document.getElementById('orc_saida')   || {}).value || '';
      if (email || wpp) {
        window.salvarLeadSupabase({ email: email, wpp: wpp, resort: resort, entrada: entrada, saida: saida });
      }
    }
    if (orcEmail) orcEmail.addEventListener('blur', salvarParcial);
    if (orcWpp)   orcWpp.addEventListener('blur', salvarParcial);
  });

  /* ── Inicializar ── */
  atualizarAggregateRating();
  injetarSocialProofReal();
})();

/* ── 4. Geração de Proposta em PDF com jsPDF ── */
function gerarPropostaPDF() {
  if (typeof window.jspdf === 'undefined') {
    alert('Carregando biblioteca PDF, tente novamente em 2 segundos.');
    return;
  }
  var dados = window._orcDados || {};
  var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });

  /* Fundo escuro premium */
  doc.setFillColor(11, 28, 61);
  doc.rect(0, 0, 210, 297, 'F');

  /* Faixa dourada no topo */
  doc.setFillColor(212, 175, 55);
  doc.rect(0, 0, 210, 2, 'F');

  /* Título */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(212, 175, 55);
  doc.text('HOSPEDAH', 105, 22, { align: 'center' });

  doc.setFontSize(11);
  doc.setTextColor(200, 210, 230);
  doc.text('Resorts & Experiências Exclusivas', 105, 30, { align: 'center' });

  /* Linha dourada separadora */
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(0.4);
  doc.line(20, 35, 190, 35);

  /* Título da proposta */
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('PROPOSTA DE ORÇAMENTO', 105, 47, { align: 'center' });

  /* Data */
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 190, 210);
  doc.text('Gerado em ' + new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }), 105, 54, { align: 'center' });

  /* Dados */
  var campos = [
    ['Nome', dados.nome],
    ['WhatsApp', dados.wpp],
    ['E-mail', dados.email],
    ['Resort', dados.resort],
    ['Pessoas', dados.pessoas],
    ['Check-in', dados.entrada],
    ['Check-out', dados.saida],
    ['Observacoes', dados.obs]
  ];

  doc.setFillColor(20, 40, 80);
  doc.roundedRect(18, 62, 174, 120, 4, 4, 'F');

  var y = 74;
  campos.forEach(function (c) {
    if (!c[1]) return;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(212, 175, 55);
    doc.text(c[0] + ':', 26, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(220, 230, 245);
    var lines = doc.splitTextToSize(String(c[1]), 120);
    doc.text(lines, 80, y);
    y += 10 + (lines.length - 1) * 5;
  });

  /* Rodapé */
  doc.setFillColor(212, 175, 55);
  doc.rect(0, 295, 210, 2, 'F');

  doc.setFontSize(8);
  doc.setTextColor(180, 190, 210);
  doc.text('hospedah.tur.br  |  WhatsApp: (17) 98200-6382  |  HOSPEDAH — Todos os direitos reservados', 105, 291, { align: 'center' });

  doc.save('Proposta_HOSPEDAH_' + (dados.nome || 'cliente').replace(/\s+/g, '_') + '.pdf');
}

/* ── GAVETA PERFIL PREMIUM ── */
(function () {
  var overlay   = document.getElementById('perfilOverlay');
  var drawer    = document.getElementById('perfilDrawer');
  var btnClose  = document.getElementById('perfilClose');
  var btnPerfil = document.getElementById('bn-perfil');
  var loaded    = false;

  function openPerfil() {
    drawer.classList.add('open');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    if (!loaded) { loaded = true; carregarPerfil(); }
  }
  function closePerfil() {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  if (btnPerfil) btnPerfil.addEventListener('click', function (e) { e.preventDefault(); openPerfil(); });
  if (btnClose)  btnClose.addEventListener('click', closePerfil);
  if (overlay)   overlay.addEventListener('click', closePerfil);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePerfil(); });

  /* Suporte a swipe-down para fechar (somente quando o drawer está no topo) */
  var touchStartY = 0;
  drawer.addEventListener('touchstart', function (e) { touchStartY = e.touches[0].clientY; }, { passive: true });
  drawer.addEventListener('touchend', function (e) {
    if (drawer.scrollTop === 0 && e.changedTouches[0].clientY - touchStartY > 80) closePerfil();
  }, { passive: true });

  function getSbClient() {
    var SB_URL = 'https://ydrmjoppjxtmnwtvtinb.supabase.co';
    var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlkcm1qb3Bwanh0bW53dHZ0aW5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNzA3MzksImV4cCI6MjA5MTg0NjczOX0.Gp4ed332v62sC5e5GXXbPqOIBNpS4EzMCFawnBJE_Cw';
    return supabase.createClient(SB_URL, SB_KEY);
  }

  function mostrarBtnLogin(footer) {
    footer.innerHTML = '';
    var link = document.createElement('a');
    link.href = '/portal/index.html';
    link.className = 'perfil-btn perfil-btn-login';
    link.textContent = '👤 Entrar / Criar conta';
    footer.appendChild(link);
    /* Esconde ações rápidas para visitantes */
    var qa = document.getElementById('perfilQuickActions');
    if (qa) qa.style.display = 'none';
  }

  function carregarPerfil() {
    var footer = document.getElementById('perfilFooter');
    var client;
    try { client = getSbClient(); } catch (err) { mostrarBtnLogin(footer); return; }
    client.auth.getSession().then(function (res) {
      var user = res.data && res.data.session && res.data.session.user;
      if (user) {
        var meta = user.user_metadata || {};
        var nome = meta.full_name || meta.name || user.email.split('@')[0];
        document.getElementById('perfilNome').textContent  = nome;
        document.getElementById('perfilEmail').textContent = user.email;

        /* Badge de plano */
        var badge = document.getElementById('perfilBadge');
        if (badge) { badge.textContent = '✦ Premium'; badge.style.display = 'inline-block'; }

        /* Avatar */
        if (meta.avatar_url) {
          var img = document.createElement('img');
          img.src = meta.avatar_url;
          img.alt = 'Avatar';
          img.style.cssText = 'width:56px;height:56px;border-radius:50%;object-fit:cover;';
          var av = document.getElementById('perfilAvatarImg');
          av.innerHTML = '';
          av.appendChild(img);
        }

        /* Exibe ações rápidas */
        var qa = document.getElementById('perfilQuickActions');
        if (qa) qa.style.display = 'grid';

        /* Botão de sair */
        footer.innerHTML = '';
        var btnSair = document.createElement('button');
        btnSair.className = 'perfil-btn perfil-btn-logout';
        btnSair.textContent = '🚪 Sair da conta';
        btnSair.addEventListener('click', function () {
          btnSair.textContent = 'Saindo…';
          btnSair.disabled = true;
          client.auth.signOut().then(function () {
            window.location.reload();
          }).catch(function () {
            btnSair.textContent = '🚪 Sair da conta';
            btnSair.disabled = false;
          });
        });
        footer.appendChild(btnSair);
      } else {
        mostrarBtnLogin(footer);
      }
    }).catch(function () { mostrarBtnLogin(footer); });
  }
})();

(function () {
  var hcBtn  = document.getElementById('hospedah-chat-btn');
  var hcBox  = document.getElementById('hospedah-chat');
  var hcMsgs = document.getElementById('hc-messages');
  var hcEtapa   = 0;
  var hcNome    = '';
  var hcAssunto = '';
  var hcPerfil  = {};
  var hcMensagens  = [];
  var hcWaiting    = false;
  var hcConversaId = 'widget_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

  hcBtn.addEventListener('click', function () {
    var shown = hcBox.style.display === 'flex';
    hcBox.style.display = shown ? 'none' : 'flex';
    hcBox.style.flexDirection = 'column';
    if (!shown) document.getElementById('hc-user-input').focus();
  });

  document.getElementById('hc-close-btn').addEventListener('click', function () {
    hcBox.style.display = 'none';
  });

  function hcAddMsg(text, type) {
    var div = document.createElement('div');
    div.className = 'hc-msg hc-' + type;
    if (type === 'bot') {
      // Renderizar markdown básico nas respostas da IA (bold e quebras de linha)
      var safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      safe = safe.replace(/\n/g, '<br>');
      div.innerHTML = safe;
    } else {
      div.textContent = text;
    }
    hcMsgs.appendChild(div);
    hcMsgs.scrollTop = hcMsgs.scrollHeight;
  }

  function hcAddTyping() {
    var div = document.createElement('div');
    div.className = 'hc-msg hc-typing';
    div.id = 'hc-typing-ind';
    div.innerHTML = '<span></span><span></span><span></span>';
    hcMsgs.appendChild(div);
    hcMsgs.scrollTop = hcMsgs.scrollHeight;
  }

  function hcRemoveTyping() {
    var el = document.getElementById('hc-typing-ind');
    if (el) el.parentNode.removeChild(el);
  }

  function hcSetInput(disabled) {
    document.getElementById('hc-user-input').disabled = disabled;
    document.getElementById('hc-send-btn').disabled   = disabled;
    if (!disabled) document.getElementById('hc-user-input').focus();
  }

  /* Gera recomendação de resort com base no perfil capturado */
  function hcRecomendar(p) {
    var msg = 'Com base no seu perfil, aqui estão as melhores opções 👇\n\n';
    var temOpcao = false;
    if (p.orcamento === 'baixo') {
      msg += '🎢 **Olimpia Park Resort** — melhor custo-benefício, parque aquático incluso\n\n';
      temOpcao = true;
    }
    if (p.orcamento === 'alto') {
      msg += '👑 **Wyndham Royal** — alto padrão, próximo ao Thermas dos Laranjais\n\n';
      temOpcao = true;
    }
    if (p.tipo === 'familia') {
      msg += '🏖️ **Hot Beach Suites** — ideal para famílias, cozinha completa, acesso ao parque\n\n';
      temOpcao = true;
    }
    if (p.parque) {
      msg += '♨️ **São Pedro Thermas** — águas termais naturais, piscinas aquecidas\n\n';
      temOpcao = true;
    }
    if (!temOpcao) {
      msg += '☀️ **Solar das Águas** — resort completo, muitas piscinas, ideal para famílias\n\n';
    }
    msg += '⚠️ Valores de refeições e parques são contratados diretamente com o resort.\n\nPosso verificar disponibilidade! Quando você quer viajar? 😊';
    return msg;
  }

  /* Chama a IA Gemini — usa streaming quando disponível para respostas em tempo real */
  function hcChamarIA(userMsg) {
    if (!window.HOSPEDAH_AI) return Promise.resolve(null);
    hcMensagens.push({ role: 'user', content: userMsg, ts: new Date().toISOString() });
    if (hcMensagens.length > 20) { hcMensagens = hcMensagens.slice(-20); }
    var userMsgIdx = hcMensagens.length - 1;
    var intencao = { pagina_origem: 'index', perfil_tipo: hcPerfil.tipo, perfil_orcamento: hcPerfil.orcamento, perfil_parque: hcPerfil.parque };
    if (window.HOSPEDAH_AI.chamarStream) {
      return new Promise(function (resolve) {
        hcRemoveTyping();
        var div = document.createElement('div');
        div.className = 'hc-msg hc-bot';
        hcMsgs.appendChild(div);
        hcMsgs.scrollTop = hcMsgs.scrollHeight;
        window.HOSPEDAH_AI.chamarStream(
          { nome: hcNome, assunto: hcAssunto },
          hcMensagens,
          intencao,
          0.7,
          '',
          function (chunk, accumulated) {
            div.innerHTML = window.HOSPEDAH_AI.renderMarkdown(accumulated);
            hcMsgs.scrollTop = hcMsgs.scrollHeight;
          },
          function (finalText) {
            if (!finalText) {
              if (div.parentNode) div.parentNode.removeChild(div);
              /* Streaming falhou — tentar versão não-streaming antes de desistir */
              hcRemoveTyping();
              hcAddTyping();
              window.HOSPEDAH_AI.chamar(
                { nome: hcNome, assunto: hcAssunto },
                hcMensagens,
                intencao,
                0.7
              ).then(function (resp) {
                if (resp) {
                  hcMensagens.push({ role: 'assistant', content: resp, ts: new Date().toISOString() });
                  resolve(resp);
                } else {
                  hcMensagens.splice(userMsgIdx, 1);
                  resolve(null);
                }
              }).catch(function () {
                hcMensagens.splice(userMsgIdx, 1);
                resolve(null);
              });
            } else {
              hcMensagens.push({ role: 'assistant', content: finalText, ts: new Date().toISOString() });
              resolve('STREAMED');
            }
          }
        );
      });
    }
    return window.HOSPEDAH_AI.chamar(
      { nome: hcNome, assunto: hcAssunto },
      hcMensagens,
      intencao,
      0.7
    ).then(function (resp) {
      if (resp) {
        hcMensagens.push({ role: 'assistant', content: resp, ts: new Date().toISOString() });
      } else {
        hcMensagens.splice(userMsgIdx, 1); // descarta a mensagem do usuário em caso de falha para não poluir o histórico
      }
      return resp;
    });
  }

  function hcHandleResp(resp) {
    hcRemoveTyping();
    if (resp === 'STREAMED') {
      /* mensagem já renderizada durante streaming — nada a fazer */
    } else if (resp) {
      hcAddMsg(resp, 'bot');
    } else {
      hcAddMsg('Desculpe, não consegui responder agora. Fale pelo WhatsApp 📱 (17) 98200-6382', 'bot');
    }
    hcWaiting = false;
    hcSetInput(false);
  }

  window.hcSend = function () {
    if (hcWaiting) return;
    var input = document.getElementById('hc-user-input');
    var txt = input.value.trim();
    if (!txt) return;
    hcAddMsg(txt, 'user');
    input.value = '';

    /* etapa 0 — coletar nome sem chamar a IA */
    if (hcEtapa === 0) {
      hcNome = txt; hcEtapa++;
      hcSetInput(true);
      setTimeout(function () {
        hcAddMsg('Prazer, ' + hcNome + '! 😊 Já tem algum resort em mente, ou prefere uma indicação personalizada?', 'bot');
        hcSetInput(false);
      }, 500);
      return;
    }

    /* etapa 1 — primeira pergunta real: salvar como assunto e enviar à IA */
    if (hcEtapa === 1) { hcAssunto = hcAssunto || txt; hcEtapa++; }

    /* etapa 2+ — Gemini responde */
    hcWaiting = true;
    hcSetInput(true);
    hcAddTyping();
    hcChamarIA(txt).then(hcHandleResp).catch(function () { hcHandleResp(null); });
  };

  setTimeout(function () {
    hcAddMsg('Olá 👋 Sou o Concierge IA da HOSPEDAH, com respostas em tempo real!', 'bot');
    setTimeout(function () { hcAddMsg('Qual seu nome? 😊', 'bot'); }, 800);
  }, 1200);
}());

/* ── BOTÃO FLUTUANTE DE COMPARTILHAMENTO (mobile) ── */
(function () {
  var btn   = document.getElementById('share-float-btn');
  var toast = document.getElementById('share-float-toast');
  if (!btn) return;

  var toastTimer = null;
  var TOAST_ANIM_MS = 2000; /* deve coincidir com a duração da animação shareToastFade (2s) */

  function showToast(msg) {
    toast.textContent = msg;
    toast.style.display = 'block';
    // Reinicia a animação
    toast.style.animation = 'none';
    void toast.offsetWidth; /* reflow */
    toast.style.animation = 'shareToastFade ' + (TOAST_ANIM_MS / 1000) + 's ease forwards';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.style.display = 'none'; }, TOAST_ANIM_MS + 100);
  }

  btn.addEventListener('click', function () {
    var shareData = {
      title: document.title,
      text: 'Confira os melhores resorts com a HOSPEDAH! 🏖️',
      url: window.location.href
    };
    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      navigator.share(shareData).catch(function () { /* usuário cancelou */ });
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(window.location.href).then(function () {
        showToast('Link copiado! 🔗');
      }).catch(function () { showToast('Copie: ' + window.location.href); });
    } else {
      showToast('Copie o link da barra de endereço 🔗');
    }
  });
}());

/* ── FEED DO INSTAGRAM ── */
(function () {
  var grid = document.getElementById('insta-feed-grid');
  if (!grid) return;

  /* URL da Edge Function — fallback silencioso se não configurada */
  var EDGE_URL = 'https://ydrmjoppjxtmnwtvtinb.supabase.co/functions/v1/instagram-feed?limit=6';

  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderPosts(posts) {
    if (!posts || posts.length === 0) {
      grid.innerHTML = '<div class="insta-feed-empty">'
        + '<svg class="insta-feed-empty-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="56" height="56" aria-hidden="true">'
        + '<defs><linearGradient id="ig-empty-grad" x1="0%" y1="100%" x2="100%" y2="0%">'
        + '<stop offset="0%" stop-color="#FCAF45"/><stop offset="50%" stop-color="#E1306C"/><stop offset="100%" stop-color="#833AB4"/>'
        + '</linearGradient></defs>'
        + '<rect x="2" y="2" width="20" height="20" rx="5" ry="5" stroke="url(#ig-empty-grad)" stroke-width="1.5"/>'
        + '<circle cx="12" cy="12" r="5" stroke="url(#ig-empty-grad)" stroke-width="1.5"/>'
        + '<circle cx="17.5" cy="6.5" r="1.5" fill="url(#ig-empty-grad)"/>'
        + '</svg>'
        + '<p class="insta-feed-error">Nenhum post disponível no momento.</p>'
        + '<p class="insta-feed-empty-hint">Visite o perfil para ver as últimas publicações.</p>'
        + '</div>';
      return;
    }
    grid.innerHTML = posts.map(function (p) {
      var imgSrc    = p.media_type === 'VIDEO' ? (p.thumbnail_url || p.media_url) : p.media_url;
      var caption   = escHtml(p.caption);
      var videoBadge = p.media_type === 'VIDEO' ? '<span class="insta-video-badge" aria-hidden="true">▶ Vídeo</span>' : '';
      var overlay   = caption
        ? '<div class="insta-post-overlay"><p class="insta-post-caption">' + caption + '</p></div>'
        : '';
      return '<a class="insta-post" href="' + escHtml(p.permalink) + '" target="_blank" rel="noopener" aria-label="Ver post no Instagram">'
        + '<img src="' + escHtml(imgSrc) + '" alt="Post do Instagram" loading="lazy">'
        + videoBadge
        + overlay
        + '</a>';
    }).join('');
  }

  fetch(EDGE_URL)
    .then(function (res) { return res.json(); })
    .then(function (data) { renderPosts(data.posts); })
    .catch(function () {
      /* Falha de rede — exibe estado vazio para o visitante poder acessar o perfil */
      renderPosts([]);
    });
}());

/* ── SÃO PEDRO THERMAS: Tabs + Vídeo Modal HD ── */
(function () {
  var spTabs   = Array.from(document.querySelectorAll('.sp-gallery-tab'));
  var spPanels = Array.from(document.querySelectorAll('.sp-gallery-panel'));

  function spSwitchTab(name) {
    spTabs.forEach(function (btn) {
      var active = btn.id === 'sp-tab-' + name;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
      btn.tabIndex = active ? 0 : -1;
    });
    spPanels.forEach(function (p) {
      p.classList.toggle('active', p.id === 'sp-' + name + '-panel');
    });
    if (name !== 'videos') {
      document.querySelectorAll('#sp-videos-panel video').forEach(function (v) { v.pause(); });
    }
  }

  spTabs.forEach(function (btn) {
    btn.addEventListener('click', function () {
      spSwitchTab(btn.id.replace('sp-tab-', ''));
    });
  });

  var spTablist = document.querySelector('.sp-gallery-tabs');
  if (spTablist) {
    spTablist.addEventListener('keydown', function (e) {
      var idx = spTabs.findIndex(function (t) { return t === document.activeElement; });
      if (idx === -1) return;
      if (e.key === 'ArrowRight' && idx < spTabs.length - 1) {
        spTabs[idx + 1].focus(); spTabs[idx + 1].click(); e.preventDefault();
      } else if (e.key === 'ArrowLeft' && idx > 0) {
        spTabs[idx - 1].focus(); spTabs[idx - 1].click(); e.preventDefault();
      }
    });
  }

  var spModal  = document.getElementById('sp-video-modal');
  var spPlayer = document.getElementById('sp-vm-player');
  var spTitle  = document.getElementById('sp-vm-title');
  var spClose  = document.getElementById('sp-vm-close');
  var _spFocus = null;

  function spOpenModal(src, title) {
    _spFocus = document.activeElement;
    spPlayer.src = src;
    spTitle.textContent = title || '';
    spModal.classList.add('open');
    document.body.style.overflow = 'hidden';
    spPlayer.play().catch(function () {});
    spClose.focus();
  }
  function spCloseModal() {
    spPlayer.pause();
    spPlayer.removeAttribute('src');
    spPlayer.load();
    spTitle.textContent = '';
    spModal.classList.remove('open');
    document.body.style.overflow = '';
    if (_spFocus) _spFocus.focus();
  }

  spClose.addEventListener('click', spCloseModal);
  spModal.addEventListener('click', function (e) {
    if (e.target === spModal) spCloseModal();
  });
  document.querySelectorAll('.sp-play-hd-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      spOpenModal(btn.dataset.src, btn.dataset.title);
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && spModal.classList.contains('open')) spCloseModal();
  });

  if ('IntersectionObserver' in window) {
    var spIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) entry.target.pause();
      });
    }, { threshold: 0.15 });
    document.querySelectorAll('#sp-videos-panel video').forEach(function (v) { spIO.observe(v); });
  }
}());
