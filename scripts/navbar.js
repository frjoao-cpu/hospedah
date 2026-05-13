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
    '.hsh-header { display:flex; align-items:center; justify-content:space-between; padding:0 24px; height:56px; background:linear-gradient(135deg,var(--azul,#0B1C3D),var(--azul2,#142850)); border-bottom:1px solid var(--borda,rgba(212,175,55,.15)); position:sticky; top:0; z-index:900; }',
    '.hsh-logo { display:inline-flex; align-items:center; text-decoration:none; }',
    '.hsh-logo img { display:block; height:32px; width:auto; }',
    '.hsh-nav { display:flex; gap:4px; align-items:center; }',
    '.hsh-nav a { color:var(--cor-texto,#e8eaf0); text-decoration:none; padding:6px 10px; border-radius:7px; font-size:.82em; font-weight:500; transition:background .2s,color .2s; white-space:nowrap; }',
    '.hsh-nav a:hover { background:rgba(212,175,55,.12); color:var(--dourado,#D4AF37); }',
    '.hsh-nav a.active { background:rgba(212,175,55,.18); color:var(--dourado,#D4AF37); font-weight:700; }',
    '@media(max-width:680px){ .hsh-nav { display:none; } }',
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
      '<a href="/index.html" class="hsh-logo" aria-label="HOSPEDAH in&iacute;cio"><img src="/assets/logo-navbar.svg" alt="HOSPEDAH" width="160" height="32"></a>' +
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
