(function () {
  'use strict';

  var state = {
    client: null,
    session: null,
    user: null,
    loyaltyPoints: 0,
    reservations: []
  };

  function qs(selector) {
    return document.querySelector(selector);
  }

  function qsa(selector) {
    return Array.prototype.slice.call(document.querySelectorAll(selector));
  }

  function showAlert(message, type) {
    var alert = qs('[data-portal-alert]');
    if (!alert) return;
    alert.textContent = message;
    alert.className = 'portal-alert show ' + (type || 'ok');
  }

  function clearAlert() {
    var alert = qs('[data-portal-alert]');
    if (!alert) return;
    alert.className = 'portal-alert';
    alert.textContent = '';
  }

  function getClient() {
    if (state.client) return state.client;
    if (!window.supabase || !window.HOSPEDAH_SB_URL || !window.HOSPEDAH_SB_ANON) {
      throw new Error('Supabase indisponível no momento.');
    }
    state.client = window.supabase.createClient(window.HOSPEDAH_SB_URL, window.HOSPEDAH_SB_ANON);
    return state.client;
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function getTier(points) {
    if (points >= 2000) return 'Diamond';
    if (points >= 1200) return 'Gold';
    if (points >= 600) return 'Silver';
    return 'Bronze';
  }

  async function requireSession() {
    var sb = getClient();
    var data = await sb.auth.getSession();
    var session = data && data.data ? data.data.session : null;
    var pathname = window.location.pathname || '';
    var onDashboard = pathname.indexOf('/portal/dashboard.html') !== -1;
    var onLogin = pathname.indexOf('/portal/index.html') !== -1;

    if (!session && onDashboard) {
      window.location.replace('/portal/index.html?next=dashboard.html');
      return null;
    }

    if (session && onLogin) {
      window.location.replace('/portal/dashboard.html');
      return null;
    }

    state.session = session;
    state.user = session ? session.user : null;
    return session;
  }

  async function signIn(event) {
    event.preventDefault();
    clearAlert();
    var email = (qs('#loginEmail') || {}).value || '';
    var password = (qs('#loginPassword') || {}).value || '';

    if (!validEmail(email)) {
      showAlert('Informe um e-mail válido.', 'error');
      return;
    }
    if (password.length < 6) {
      showAlert('A senha deve ter ao menos 6 caracteres.', 'error');
      return;
    }

    var sb = getClient();
    var result = await sb.auth.signInWithPassword({ email: email, password: password });
    if (result.error) {
      showAlert(result.error.message || 'Não foi possível fazer login.', 'error');
      return;
    }

    showAlert('Login realizado com sucesso!', 'ok');
    window.location.assign('/portal/dashboard.html');
  }

  async function signUp(event) {
    event.preventDefault();
    clearAlert();

    var name = (qs('#signupName') || {}).value || '';
    var email = (qs('#signupEmail') || {}).value || '';
    var password = (qs('#signupPassword') || {}).value || '';
    var confirm = (qs('#signupPasswordConfirm') || {}).value || '';

    if (name.trim().length < 3) {
      showAlert('Informe seu nome completo.', 'error');
      return;
    }
    if (!validEmail(email)) {
      showAlert('Informe um e-mail válido.', 'error');
      return;
    }
    if (password.length < 6) {
      showAlert('A senha deve ter ao menos 6 caracteres.', 'error');
      return;
    }
    if (password !== confirm) {
      showAlert('As senhas não coincidem.', 'error');
      return;
    }

    var sb = getClient();
    var result = await sb.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          full_name: name
        }
      }
    });

    if (result.error) {
      showAlert(result.error.message || 'Não foi possível concluir o cadastro.', 'error');
      return;
    }

    showAlert('Cadastro criado. Verifique seu e-mail para confirmar o acesso.', 'ok');
  }

  async function signInGoogle() {
    clearAlert();
    var sb = getClient();
    var result = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/portal/dashboard.html'
      }
    });

    if (result.error) {
      showAlert(result.error.message || 'Não foi possível entrar com Google.', 'error');
    }
  }

  function setupTabs() {
    var buttons = qsa('[data-auth-tab]');
    var panels = qsa('[data-auth-panel]');
    if (!buttons.length || !panels.length) return;

    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        var target = button.getAttribute('data-auth-tab');
        buttons.forEach(function (item) { item.classList.remove('active'); });
        panels.forEach(function (panel) { panel.classList.remove('active'); });
        button.classList.add('active');
        var panel = qs('[data-auth-panel="' + target + '"]');
        if (panel) panel.classList.add('active');
      });
    });
  }

  async function loadReservations() {
    var sb = getClient();
    try {
      var query = await sb
        .from('reservas')
        .select('id,resort,checkin,checkout,status,created_at')
        .order('created_at', { ascending: false })
        .limit(8);

      if (query.error) throw query.error;
      state.reservations = query.data || [];
    } catch (error) {
      state.reservations = [
        { id: 'PEND-01', resort: 'Hot Beach Suites', checkin: '2026-08-14', checkout: '2026-08-18', status: 'pendente' },
        { id: 'CONF-02', resort: 'São Pedro Thermas', checkin: '2026-11-02', checkout: '2026-11-06', status: 'confirmada' }
      ];
    }
  }

  function renderReservations() {
    var tbody = qs('#guestReservations');
    if (!tbody) return;

    var rows = state.reservations.map(function (item) {
      return '<tr>' +
        '<td>' + String(item.id || '-') + '</td>' +
        '<td>' + String(item.resort || '-') + '</td>' +
        '<td>' + String(item.checkin || '-') + '</td>' +
        '<td>' + String(item.checkout || '-') + '</td>' +
        '<td>' + String(item.status || '-') + '</td>' +
      '</tr>';
    });

    tbody.innerHTML = rows.join('');
    var count = qs('#reservationCount');
    if (count) count.textContent = String(state.reservations.length);
  }

  function renderLoyalty() {
    state.loyaltyPoints = state.reservations.length * 350;
    var tier = getTier(state.loyaltyPoints);

    var points = qs('#loyaltyPoints');
    var tierEl = qs('#loyaltyTier');
    if (points) points.textContent = String(state.loyaltyPoints);
    if (tierEl) tierEl.textContent = tier;

    qsa('.loyalty-badge').forEach(function (item) {
      item.classList.remove('active');
      if (item.getAttribute('data-tier') === tier) {
        item.classList.add('active');
      }
    });
  }

  function renderVouchers() {
    var container = qs('#voucherList');
    if (!container) return;

    var vouchers = [
      { code: 'WELCOME10', title: '10% OFF na primeira reserva', points: 300 },
      { code: 'UPGRADE15', title: 'Upgrade VIP em estadias selecionadas', points: 900 },
      { code: 'SPA25', title: 'R$ 25 de crédito em SPA parceiro', points: 1400 }
    ];

    container.innerHTML = vouchers.map(function (voucher) {
      var qr = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(voucher.code);
      return '<article class="voucher-card">' +
        '<h3>' + voucher.title + '</h3>' +
        '<p class="portal-muted">Código: <strong>' + voucher.code + '</strong></p>' +
        '<p class="portal-muted">Resgate com ' + voucher.points + ' pts</p>' +
        '<img src="' + qr + '" alt="QR Code do voucher ' + voucher.code + '" loading="lazy">' +
      '</article>';
    }).join('');
  }

  function renderProfile() {
    var name = qs('#guestName');
    var email = qs('#guestEmail');
    var settingName = qs('#settingName');
    var settingEmail = qs('#settingEmail');

    var fullName = (state.user && state.user.user_metadata && state.user.user_metadata.full_name) ||
      (state.user && state.user.email ? state.user.email.split('@')[0] : 'Hóspede');

    var mail = state.user ? state.user.email : 'visitante@hospedah.tur.br';

    if (name) name.textContent = fullName;
    if (email) email.textContent = mail;
    if (settingName) settingName.value = fullName;
    if (settingEmail) settingEmail.value = mail;
  }

  async function saveSettings(event) {
    event.preventDefault();
    clearAlert();

    var fullName = ((qs('#settingName') || {}).value || '').trim();
    var sb = getClient();
    var result = await sb.auth.updateUser({
      data: {
        full_name: fullName
      }
    });

    if (result.error) {
      showAlert(result.error.message || 'Não foi possível salvar as configurações.', 'error');
      return;
    }

    showAlert('Configurações salvas com sucesso!', 'ok');
    renderProfile();
  }

  async function resetPassword(event) {
    event.preventDefault();
    clearAlert();

    var password = ((qs('#newPassword') || {}).value || '').trim();
    var confirm = ((qs('#confirmNewPassword') || {}).value || '').trim();
    if (password.length < 6) {
      showAlert('A nova senha deve ter pelo menos 6 caracteres.', 'error');
      return;
    }
    if (password !== confirm) {
      showAlert('As senhas não coincidem.', 'error');
      return;
    }

    var sb = getClient();
    var result = await sb.auth.updateUser({ password: password });
    if (result.error) {
      showAlert(result.error.message || 'Não foi possível redefinir sua senha.', 'error');
      return;
    }

    showAlert('Senha redefinida com sucesso! Redirecionando para login...', 'ok');
    window.setTimeout(function () {
      window.location.assign('/portal/index.html');
    }, 1500);
  }

  async function logout() {
    var sb = getClient();
    await sb.auth.signOut();
    window.location.assign('/portal/index.html');
  }

  async function initDashboard() {
    await requireSession();
    if (!state.session) return;
    renderProfile();
    await loadReservations();
    renderReservations();
    renderLoyalty();
    renderVouchers();

    var form = qs('#settingsForm');
    var btnLogout = qs('#btnPortalLogout');
    if (form) form.addEventListener('submit', saveSettings);
    if (btnLogout) btnLogout.addEventListener('click', logout);
  }

  async function initAuthPage() {
    await requireSession();
    setupTabs();

    var loginForm = qs('#loginForm');
    var signupForm = qs('#signupForm');
    var googleButtons = qsa('[data-google-auth]');

    if (loginForm) loginForm.addEventListener('submit', signIn);
    if (signupForm) signupForm.addEventListener('submit', signUp);
    googleButtons.forEach(function (button) {
      button.addEventListener('click', signInGoogle);
    });
  }

  async function initResetPage() {
    var form = qs('#resetForm');
    if (form) form.addEventListener('submit', resetPassword);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var page = document.body.getAttribute('data-portal-page');

    try {
      if (page === 'auth') {
        initAuthPage();
      }
      if (page === 'dashboard') {
        initDashboard();
      }
      if (page === 'reset') {
        initResetPage();
      }
    } catch (error) {
      showAlert(error.message || 'Erro ao carregar portal.', 'error');
    }
  });
})();
