'use strict';

/* ==========================================================================
   HOSPEDAH AUTH GUARD (front-end)
   --------------------------------------------------------------------------
   - Rotas públicas explicitamente liberadas.
   - Demais rotas são tratadas como protegidas.
   - Se não houver sessão válida, redireciona para a página de login.
   - Suporta validação opcional de role (ex.: admin/proprietario).
   ========================================================================== */
(function () {
  var PUBLIC_ROUTES = ['index.html', 'busca.html', 'cadastro.html', 'jornal.html'];

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

    // Mantém o fluxo de magic link/reset sem redirecionamento prematuro.
    if (isSupabaseAuthRedirect()) return true;

    if (!client || !client.auth || typeof client.auth.getSession !== 'function') {
      redirectToLogin(loginPath);
      return false;
    }

    try {
      var sessionRes = await client.auth.getSession();
      var session = sessionRes && sessionRes.data && sessionRes.data.session;
      var user = session && session.user;

      if (!user) {
        redirectToLogin(loginPath);
        return false;
      }

      if (!allowedRoles || !allowedRoles.length) return true;

      var roleRes = await client.from('profiles').select('role').eq('id', user.id).maybeSingle();
      var role = roleRes && roleRes.data && roleRes.data.role;
      var isRoleAllowed = allowedRoles.indexOf(role) !== -1;

      if (!isRoleAllowed) {
        await client.auth.signOut();
        redirectToLogin(loginPath);
        return false;
      }

      return true;
    } catch (err) {
      redirectToLogin(loginPath);
      return false;
    }
  }

  window.HospedahAuthGuard = {
    PUBLIC_ROUTES: PUBLIC_ROUTES,
    enforceProtectedRoute: enforceProtectedRoute
  };
})();
