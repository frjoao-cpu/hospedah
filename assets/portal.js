'use strict';

(function () {
  var DASHBOARD_PATH = '/portal/dashboard.html';
  var LOGIN_PATH = '/portal/index.html';
  var RESET_PATH = '/portal/reset-password.html';

  function getPage() {
    var parts = window.location.pathname.split('/');
    return parts[parts.length - 1] || 'index.html';
  }

  function getSupabaseClient() {
    if (!window.supabase || !window.HOSPEDAH_SB_URL || !window.HOSPEDAH_SB_ANON) {
      return null;
    }
    if (!window.__hospedahPortalClient) {
      window.__hospedahPortalClient = window.supabase.createClient(
        window.HOSPEDAH_SB_URL,
        window.HOSPEDAH_SB_ANON
      );
    }
    return window.__hospedahPortalClient;
  }

  function getOrigin() {
    if (window.location.origin && window.location.origin !== 'null') {
      return window.location.origin;
    }
    return 'https://hospedah.tur.br';
  }

  function setFeedback(id, message, type) {
    var el = document.getElementById(id);
    if (!el) {
      return;
    }
    el.textContent = message || '';
    el.classList.remove('is-error', 'is-success');
    if (type) {
      el.classList.add(type === 'error' ? 'is-error' : 'is-success');
    }
  }

  function redirect(path) {
    if (window.location.pathname !== path) {
      window.location.href = path;
    }
  }

  function normalizePoints(rawPoints) {
    var points = Number(rawPoints || 0);
    if (Number.isNaN(points) || points < 0) {
      return 0;
    }
    return points;
  }

  function loyaltyLevel(points) {
    if (points >= 1500) {
      return 'Diamond';
    }
    if (points >= 1000) {
      return 'Platinum';
    }
    if (points >= 700) {
      return 'Gold';
    }
    if (points >= 350) {
      return 'Silver';
    }
    return 'Bronze';
  }

  function initTabs() {
    var tabs = document.querySelectorAll('.portal-tab');
    if (!tabs.length) {
      return;
    }

    tabs.forEach(function (tabButton) {
      tabButton.addEventListener('click', function () {
        tabs.forEach(function (btn) {
          btn.classList.remove('is-active');
          btn.setAttribute('aria-selected', 'false');
        });

        var selected = tabButton.getAttribute('data-tab');
        var panels = document.querySelectorAll('[data-panel]');
        panels.forEach(function (panel) {
          panel.classList.toggle('is-hidden', panel.getAttribute('data-panel') !== selected);
        });

        tabButton.classList.add('is-active');
        tabButton.setAttribute('aria-selected', 'true');
      });
    });
  }

  async function ensureSessionForDashboard(client) {
    var sessionData = await client.auth.getSession();
    if (!sessionData || !sessionData.data || !sessionData.data.session) {
      redirect(LOGIN_PATH);
      return null;
    }
    return sessionData.data.session;
  }

  async function maybeRedirectAuthenticatedFromLogin(client) {
    var sessionData = await client.auth.getSession();
    if (sessionData && sessionData.data && sessionData.data.session) {
      redirect(DASHBOARD_PATH);
    }
  }

  function bindGoogleOAuth(client) {
    var buttons = document.querySelectorAll('.js-google-auth');
    buttons.forEach(function (button) {
      button.addEventListener('click', async function () {
        setFeedback('authFeedback', 'Redirecionando para o Google...', 'success');
        var result = await client.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: getOrigin() + DASHBOARD_PATH
          }
        });
        if (result.error) {
          setFeedback('authFeedback', result.error.message, 'error');
        }
      });
    });
  }

  function bindLogin(client) {
    var form = document.getElementById('loginForm');
    if (!form) {
      return;
    }

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      var email = document.getElementById('loginEmail').value.trim();
      var password = document.getElementById('loginPassword').value;

      setFeedback('authFeedback', 'Entrando...', 'success');
      var result = await client.auth.signInWithPassword({
        email: email,
        password: password
      });

      if (result.error) {
        setFeedback('authFeedback', result.error.message, 'error');
        return;
      }

      redirect(DASHBOARD_PATH);
    });
  }

  function bindSignup(client) {
    var form = document.getElementById('signupForm');
    if (!form) {
      return;
    }

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      var name = document.getElementById('signupName').value.trim();
      var email = document.getElementById('signupEmail').value.trim();
      var password = document.getElementById('signupPassword').value;

      setFeedback('authFeedback', 'Criando conta...', 'success');
      var result = await client.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            full_name: name,
            loyalty_points: 0
          },
          emailRedirectTo: getOrigin() + DASHBOARD_PATH
        }
      });

      if (result.error) {
        setFeedback('authFeedback', result.error.message, 'error');
        return;
      }

      setFeedback('authFeedback', 'Conta criada! Verifique seu e-mail para confirmar o acesso.', 'success');
      form.reset();
    });
  }

  async function hydrateDashboard(client, session) {
    var user = session.user;
    var metadata = user.user_metadata || {};
    var name = metadata.full_name || user.email || 'Hóspede';
    var phone = metadata.phone || '';
    var points = normalizePoints(metadata.loyalty_points);

    var guestName = document.getElementById('guestName');
    var guestEmail = document.getElementById('guestEmail');
    var profileName = document.getElementById('profileName');
    var profilePhone = document.getElementById('profilePhone');
    var loyaltyPoints = document.getElementById('loyaltyPoints');
    var loyaltyLevelEl = document.getElementById('loyaltyLevel');

    if (guestName) {
      guestName.textContent = name;
    }
    if (guestEmail) {
      guestEmail.textContent = user.email || '';
    }
    if (profileName) {
      profileName.value = metadata.full_name || '';
    }
    if (profilePhone) {
      profilePhone.value = phone;
    }
    if (loyaltyPoints) {
      loyaltyPoints.textContent = String(points);
    }
    if (loyaltyLevelEl) {
      loyaltyLevelEl.textContent = loyaltyLevel(points);
    }

    var logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
      logoutButton.addEventListener('click', async function () {
        await client.auth.signOut();
        redirect(LOGIN_PATH);
      });
    }

    var profileForm = document.getElementById('profileForm');
    if (profileForm) {
      profileForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        var fullName = document.getElementById('profileName').value.trim();
        var updatedPhone = document.getElementById('profilePhone').value.trim();

        var result = await client.auth.updateUser({
          data: {
            full_name: fullName,
            phone: updatedPhone,
            loyalty_points: points
          }
        });

        if (result.error) {
          setFeedback('profileFeedback', result.error.message, 'error');
          return;
        }

        if (guestName) {
          guestName.textContent = fullName || (user.email || 'Hóspede');
        }
        setFeedback('profileFeedback', 'Perfil atualizado com sucesso.', 'success');
      });
    }
  }

  async function bindResetFlows(client) {
    var requestForm = document.getElementById('resetRequestForm');
    if (requestForm) {
      requestForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        var email = document.getElementById('resetEmail').value.trim();
        var result = await client.auth.resetPasswordForEmail(email, {
          redirectTo: getOrigin() + RESET_PATH
        });

        if (result.error) {
          setFeedback('resetFeedback', result.error.message, 'error');
          return;
        }

        setFeedback('resetFeedback', 'Enviamos um link de recuperação para seu e-mail.', 'success');
      });
    }

    var params = new URLSearchParams(window.location.search);
    var code = params.get('code');
    if (code) {
      var exchange = await client.auth.exchangeCodeForSession(code);
      if (exchange.error) {
        setFeedback('resetFeedback', 'Não foi possível validar o link de recuperação.', 'error');
      }
    }

    var passwordForm = document.getElementById('resetPasswordForm');
    if (passwordForm) {
      passwordForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        var newPassword = document.getElementById('newPassword').value;
        var confirmPassword = document.getElementById('confirmPassword').value;

        if (newPassword !== confirmPassword) {
          setFeedback('resetFeedback', 'As senhas não conferem.', 'error');
          return;
        }

        var result = await client.auth.updateUser({
          password: newPassword
        });

        if (result.error) {
          setFeedback('resetFeedback', result.error.message, 'error');
          return;
        }

        setFeedback('resetFeedback', 'Senha atualizada. Faça login novamente.', 'success');
        setTimeout(function () {
          redirect(LOGIN_PATH);
        }, 1000);
      });
    }
  }

  async function init() {
    var client = getSupabaseClient();
    if (!client) {
      setFeedback('authFeedback', 'Falha ao iniciar autenticação do portal.', 'error');
      setFeedback('resetFeedback', 'Falha ao iniciar autenticação do portal.', 'error');
      return;
    }

    var page = getPage();
    initTabs();

    client.auth.onAuthStateChange(function (event) {
      if (event === 'SIGNED_OUT' && page === 'dashboard.html') {
        redirect(LOGIN_PATH);
      }
    });

    if (page === 'index.html') {
      await maybeRedirectAuthenticatedFromLogin(client);
      bindGoogleOAuth(client);
      bindLogin(client);
      bindSignup(client);
      return;
    }

    if (page === 'dashboard.html') {
      var session = await ensureSessionForDashboard(client);
      if (!session) {
        return;
      }
      await hydrateDashboard(client, session);
      return;
    }

    if (page === 'reset-password.html') {
      await bindResetFlows(client);
    }
  }

  init();
})();
