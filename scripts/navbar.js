/**
 * HOSPEDAH — Componente de navbar/footer compartilhado
 *
 * Uso: incluir APÓS o </body>:
 *   <script src="/scripts/navbar.js" data-page="busca"></script>
 *
 * O atributo data-page ativa o item correto no menu.
 * Valores aceitos: home | busca | reservas | avaliacoes | chat | cadastro
 *
 * A função hospedahNavbar() pode ser chamada manualmente se necessário.
 */
(function () {
  'use strict';

  var NAV_ITEMS = [
    { label: '🏠 Início',       href: '/index.html',      key: 'home'      },
    { label: '🔍 Buscar',       href: '/busca.html',      key: 'busca'     },
    { label: '📅 Reservar',     href: '/reservas.html',   key: 'reservas'  },
    { label: '⭐ Avaliações',   href: '/avaliacoes.html', key: 'avaliacoes' },
    { label: '🤖 Chat IA',      href: '/chat.html',       key: 'chat'      },
    { label: '🏡 Cadastrar',    href: '/cadastro.html',   key: 'cadastro'  },
  ];

  var FOOTER_HTML = '<footer class="hsh-footer">' +
    '&copy; 2026 <strong>HOSPEDAH</strong> &mdash; Todos os direitos reservados.' +
    '<br><small>' +
    '<a href="https://wa.me/5517982006382" target="_blank" rel="noopener">WhatsApp Fl&aacute;vio</a> &nbsp;|&nbsp;' +
    '<a href="https://wa.me/5517992068296" target="_blank" rel="noopener">WhatsApp Juliana</a> &nbsp;|&nbsp;' +
    '<a href="/privacidade.html">Pol&iacute;tica de Privacidade</a>' +
    '</small>' +
    '<div class="hsh-footer-seal">&#128274; <strong>Site Seguro</strong> &nbsp;&middot;&nbsp; SSL Criptografado &nbsp;&middot;&nbsp; &#128737; Dados Protegidos</div>' +
    '</footer>';

  var FOOTER_CSS = [
    '.hsh-footer { text-align:center; padding:32px 24px 24px; color:var(--cor-sub,#aab4c4); font-size:.82em; background:var(--azul,#0B1C3D); border-top:1px solid var(--borda,rgba(212,175,55,.15)); margin-top:auto; }',
    '.hsh-footer a { color:var(--dourado,#D4AF37); text-decoration:none; }',
    '.hsh-footer a:hover { text-decoration:underline; }',
    '.hsh-footer-seal { margin-top:10px; font-size:.9em; color:var(--cor-sub,#aab4c4); }',
    '.hsh-header { display:flex; align-items:center; justify-content:space-between; padding:0 28px; min-height:72px; background:linear-gradient(135deg,#0B1C3D,#142850); border-bottom:2px solid rgba(212,175,55,.45); position:sticky; top:0; z-index:1000; backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); box-shadow:0 2px 24px rgba(0,0,0,.45); gap:16px; flex-wrap:wrap; }',
    '.hsh-logo { display:inline-flex; align-items:center; text-decoration:none; flex-shrink:0; }',
    '.hsh-logo-wordmark { font-family:"Playfair Display","Georgia",serif; font-size:1.75em; font-weight:700; letter-spacing:4px; text-transform:uppercase; background:linear-gradient(135deg,#F5D060 0%,#D4AF37 45%,#b8961e 100%); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; filter:drop-shadow(0 1px 6px rgba(212,175,55,.4)); line-height:1; user-select:none; }',
    '.hsh-nav { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }',
    '.hsh-nav a { color:rgba(232,234,240,.85); text-decoration:none; padding:6px 14px; border-radius:20px; font-size:.84em; font-weight:500; border:1px solid rgba(212,175,55,.18); transition:background .2s,color .2s,border-color .2s,box-shadow .2s; white-space:nowrap; }',
    '.hsh-nav a:hover { background:rgba(212,175,55,.15); color:#D4AF37; border-color:rgba(212,175,55,.45); box-shadow:0 0 12px rgba(212,175,55,.15); }',
    '.hsh-nav a.active { background:rgba(212,175,55,.18); color:#D4AF37; border-color:rgba(212,175,55,.5); font-weight:700; }',
    '.hsh-nav a[aria-current="page"] { background:rgba(212,175,55,.18); color:#D4AF37; border-color:rgba(212,175,55,.5); font-weight:700; }',
    '@media(max-width:680px){ .hsh-nav { display:none; } .hsh-header { padding:0 16px; min-height:64px; } .hsh-logo-wordmark { font-size:1.4em; letter-spacing:3px; } }',
  ].join('\n');

  function currentPage() {
    // Prefer explicit data-page attribute on the <script> tag
    var scripts = document.querySelectorAll('script[data-page]');
    if (scripts.length) return scripts[scripts.length - 1].getAttribute('data-page');
    // Fallback: derive from URL
    var path = window.location.pathname;
    if (/busca/.test(path))      return 'busca';
    if (/reservas/.test(path))   return 'reservas';
    if (/avaliacoes/.test(path)) return 'avaliacoes';
    if (/chat/.test(path))       return 'chat';
    if (/cadastro/.test(path))   return 'cadastro';
    return 'home';
  }

  function buildHeaderHTML(activePage) {
    var links = NAV_ITEMS.map(function (item) {
      var cls = item.key === activePage ? ' class="active" aria-current="page"' : '';
      return '<a href="' + item.href + '"' + cls + '>' + item.label + '</a>';
    }).join('');
    return '<header class="hsh-header">' +
      '<a href="/index.html" class="hsh-logo" aria-label="HOSPEDAH in&iacute;cio"><span class="hsh-logo-wordmark">HOSPEDAH</span></a>' +
      '<nav class="hsh-nav" aria-label="Menu principal">' + links + '</nav>' +
      '</header>';
  }

  function injectStyles(css) {
    if (document.getElementById('hsh-navbar-styles')) return;
    var style = document.createElement('style');
    style.id = 'hsh-navbar-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function hospedahNavbar() {
    injectStyles(FOOTER_CSS);

    var activePage = currentPage();

    // Inject header — look for placeholder or prepend to body
    var placeholder = document.getElementById('hospedah-nav');
    var headerHTML  = buildHeaderHTML(activePage);
    if (placeholder) {
      placeholder.outerHTML = headerHTML;
    } else {
      document.body.insertAdjacentHTML('afterbegin', headerHTML);
    }

    // Inject footer — look for placeholder or append to body
    var footerPlaceholder = document.getElementById('hospedah-footer');
    if (footerPlaceholder) {
      footerPlaceholder.outerHTML = FOOTER_HTML;
    } else {
      // Only inject if no <footer> already exists
      if (!document.querySelector('footer')) {
        document.body.insertAdjacentHTML('beforeend', FOOTER_HTML);
      }
    }
  }

  // Auto-run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hospedahNavbar);
  } else {
    hospedahNavbar();
  }

  // Expose globally for manual use
  window.hospedahNavbar = hospedahNavbar;
})();
