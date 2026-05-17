'use strict';

/* ==========================================================================
   HOSPEDAH AUTH GUARD (front-end)
   --------------------------------------------------------------------------
   - Rotas públicas explícitas não exigem login.
   - Somente páginas administrativas/privadas devem chamar enforceProtectedRoute().
   - O acesso ADM público ocorre via painel.html ("⚙️ Abrir painel completo") ou
     pela URL direta: seusite.com/sistema.html (rota protegida).
   - Se não houver sessão válida em rota protegida, redireciona para o login ADM.
   - Suporta validação opcional de role (ex.: admin/proprietario).
   ========================================================================== */
(function () {
  var PUBLIC_ROUTES = [
    'index.html',
    'busca.html',
    'cadastro.html',
    'jornal.html',
    'reservas.html',
    'avaliacoes.html',
    'chat.html',
    'referral.html',
    'painel.html'
  ];

  function getCurrentRouteFile() {
    var path = window.location.pathname || '';
    var file = path.substring(path.lastIndexOf('/') + 1);
    return file || 'index.html';
  }

  function isSupabaseAuthRedirect() {
    var search = window.location.search || '';
    var hash = window.location.hash || '';
    return search.indexOf('code=') !== -1 ||
      search.indexOf('token=') !== -1 ||
      search.indexOf('type=recovery') !== -1 ||
      hash.indexOf('access_token=') !== -1 ||
      hash.indexOf('type=recovery') !== -1;
  }

  function buildNextParam() {
    var file = getCurrentRouteFile();
    return file + (window.location.search || '') + (window.location.hash || '');
  }

  function redirectToLogin(loginPath) {
    var route = getCurrentRouteFile();
    if (route === loginPath) return;
    var next = encodeURIComponent(buildNextParam());
    window.location.replace(loginPath + '?next=' + next);
  }

  async function enforceProtectedRoute(options) {
    var opts = options || {};
    var client = opts.client;
    var loginPath = opts.loginPath || 'painel.html';
    var allowedRoles = opts.allowedRoles || null;
    var route = getCurrentRouteFile();

    // Rotas públicas liberadas de forma explícita.
    if (PUBLIC_ROUTES.indexOf(route) !== -1) return true;

    // Mantém o fluxo de magic link/reset sem redirecionamento prematuro
    // apenas na rota de login.
    if (isSupabaseAuthRedirect() && route === loginPath) return true;

    if (!client || !client.auth || typeof client.auth.getSession !== 'function') {
      console.error('Auth guard sem cliente Supabase válido para a rota:', route);
      redirectToLogin(loginPath);
      return false;
    }

    // Cache de sessão por 5 minutos no sessionStorage
    var GUARD_CACHE_MS = 5 * 60 * 1000;
    var GUARD_CACHE_KEY = 'hospedah_auth_guard';
    try {
      var raw = sessionStorage.getItem(GUARD_CACHE_KEY);
      if (raw) {
        var entry = JSON.parse(raw);
        if (entry && (Date.now() - entry.ts) < GUARD_CACHE_MS && entry.result === true &&
            (!allowedRoles || !allowedRoles.length || allowedRoles.indexOf(entry.role) !== -1)) {
          return true;
        }
      }
    } catch (e) { /* ignora erro de parse */ }

    try {
      var sessionRes = await client.auth.getSession();
      var session = sessionRes && sessionRes.data && sessionRes.data.session;
      var user = session && session.user;

      if (!user) {
        redirectToLogin(loginPath);
        return false;
      }

      if (!allowedRoles || !allowedRoles.length) {
        try { sessionStorage.setItem(GUARD_CACHE_KEY, JSON.stringify({ result: true, role: null, ts: Date.now() })); } catch (e) { /**/ }
        return true;
      }

      var roleRes = await client.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (roleRes && roleRes.error) {
        console.warn('Falha ao validar role em rota protegida:', roleRes.error);
        redirectToLogin(loginPath);
        return false;
      }
      var role = roleRes && roleRes.data && roleRes.data.role;
      var isRoleAllowed = allowedRoles.indexOf(role) !== -1;

      if (!isRoleAllowed) {
        redirectToLogin(loginPath);
        return false;
      }

      try { sessionStorage.setItem(GUARD_CACHE_KEY, JSON.stringify({ result: true, role: role, ts: Date.now() })); } catch (e) { /**/ }
      return true;
    } catch (err) {
      console.warn('Falha ao validar sessão em rota protegida:', err);
      redirectToLogin(loginPath);
      return false;
    }
  }

  window.HospedahAuthGuard = {
    PUBLIC_ROUTES: PUBLIC_ROUTES,
    enforceProtectedRoute: enforceProtectedRoute
  };
})();
