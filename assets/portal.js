(function () {
  'use strict';

  function getClient() {
    if (!window.supabase || !window.HOSPEDAH_SB_URL || !window.HOSPEDAH_SB_ANON) {
      throw new Error('Supabase indisponível.');
    }
    return window.supabase.createClient(window.HOSPEDAH_SB_URL, window.HOSPEDAH_SB_ANON);
  }

  var client;

  function setMessage(el, text, type) {
    if (!el) return;
    el.textContent = text || '';
    el.classList.remove('success', 'error');
    if (type) el.classList.add(type);
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function findFirstMessageElement() {
    return document.getElementById('portalAuthMessage') ||
      document.getElementById('portalResetMessage') ||
      document.getElementById('portalConfigMessage');
  }

  function makeQrSvg(code) {
    var bits = Array.from(code).map(function (c) { return c.charCodeAt(0); });
    var size = 17;
    var pixel = 7;
    var markup = '<svg viewBox="0 0 ' + (size * pixel) + ' ' + (size * pixel) + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="QR do voucher"><rect width="100%" height="100%" fill="#fff"/>';
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var value = bits[(x + y) % bits.length] || 0;
        if ((value + x * 3 + y * 5) % 2 === 0) {
          markup += '<rect x="' + (x * pixel) + '" y="' + (y * pixel) + '" width="' + pixel + '" height="' + pixel + '" fill="#0B1C3D"/>';
        }
      }
    }
    return markup + '</svg>';
  }

  function showSection(name) {
    var links = document.querySelectorAll('.portal-nav-link');
    var sections = ['reservas', 'fidelidade', 'vouchers', 'config'];
    links.forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-section') === name);
    });
    sections.forEach(function (id) {
      var el = document.getElementById('section-' + id);
      if (el) el.classList.toggle('hidden', id !== name);
    });
  }

  async function getSessionUser() {
    var sessionRes = await client.auth.getSession();
    return sessionRes && sessionRes.data && sessionRes.data.session && sessionRes.data.session.user;
  }

  async function loadDashboardData(user) {
    var reservationsWrap = document.getElementById('portalReservations');
    var vouchersWrap = document.getElementById('portalVouchers');
    var tierTrack = document.getElementById('tierTrack');
    var userInfo = document.getElementById('portalUserInfo');
    if (userInfo) userInfo.textContent = user.email || 'Usuário autenticado';

    var reservationRows = [];
    try {
      var reservationRes = await client
        .from('reservas')
        .select('resort, checkin, checkout, status')
        .eq('user_id', user.id)
        .order('checkin', { ascending: false })
        .limit(6);
      if (!reservationRes.error && reservationRes.data) {
        reservationRows = reservationRes.data;
      }
    } catch (err) {
      reservationRows = [];
    }

    if (!reservationRows.length) {
      reservationRows = [
        { resort: 'Hot Beach Suites', checkin: '2026-07-18', checkout: '2026-07-22', status: 'Confirmada' },
        { resort: 'Ipioca Beach Resort', checkin: '2026-10-02', checkout: '2026-10-06', status: 'Pré-reserva' }
      ];
    }

    if (reservationsWrap) {
      reservationsWrap.innerHTML = reservationRows.map(function (row) {
        return '<article class="portal-item"><h3>' + row.resort + '</h3><p>Check-in: ' + row.checkin + '</p><p>Check-out: ' + row.checkout + '</p><p>Status: ' + row.status + '</p></article>';
      }).join('');
    }

    var points = reservationRows.length * 450;
    var tiers = [
      { name: 'Bronze', min: 0 },
      { name: 'Prata', min: 1200 },
      { name: 'Ouro', min: 2500 },
      { name: 'Diamante', min: 4500 }
    ];

    if (tierTrack) {
      tierTrack.innerHTML = tiers.map(function (tier) {
        var active = points >= tier.min;
        return '<div class="tier-step' + (active ? ' active' : '') + '"><strong>' + tier.name + '</strong> · ' + tier.min + '+ pts</div>';
      }).join('');
    }

    var voucherRows = reservationRows.map(function (item, index) {
      return {
        title: 'Voucher #' + (index + 1),
        code: (item.resort || 'HOSPEDAH').replace(/\s+/g, '').toUpperCase().slice(0, 8) + '-' + (index + 1) + '-' + user.id.slice(0, 6)
      };
    });

    if (vouchersWrap) {
      vouchersWrap.innerHTML = voucherRows.map(function (voucher) {
        return '<article class="portal-item"><h3>' + voucher.title + '</h3><p>' + voucher.code + '</p><div class="qr-box">' + makeQrSvg(voucher.code) + '</div></article>';
      }).join('');
    }
  }

  function initAuthTabs() {
    var tabButtons = document.querySelectorAll('.portal-tab');
    var loginForm = document.getElementById('loginForm');
    var signupForm = document.getElementById('signupForm');
    tabButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var isLogin = btn.getAttribute('data-tab') === 'login';
        tabButtons.forEach(function (item) {
          var active = item === btn;
          item.classList.toggle('active', active);
          item.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        if (loginForm) loginForm.classList.toggle('hidden', !isLogin);
        if (signupForm) signupForm.classList.toggle('hidden', isLogin);
      });
    });
  }

  async function initAuthPage() {
    initAuthTabs();
    var message = document.getElementById('portalAuthMessage');
    var loginForm = document.getElementById('loginForm');
    var signupForm = document.getElementById('signupForm');
    var googleBtn = document.getElementById('btnGoogleAuth');

    var activeUser = await getSessionUser();
    if (activeUser) {
      window.location.replace('/portal/dashboard.html');
      return;
    }

    if (loginForm) {
      loginForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        var email = document.getElementById('loginEmail').value.trim().toLowerCase();
        var password = document.getElementById('loginPassword').value;
        if (!isValidEmail(email) || !password) {
          setMessage(message, 'Preencha e-mail e senha válidos.', 'error');
          return;
        }
        var loginRes = await client.auth.signInWithPassword({ email: email, password: password });
        if (loginRes.error) {
          setMessage(message, loginRes.error.message, 'error');
          return;
        }
        window.location.replace('/portal/dashboard.html');
      });
    }

    if (signupForm) {
      signupForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        var name = document.getElementById('signupName').value.trim();
        var email = document.getElementById('signupEmail').value.trim().toLowerCase();
        var password = document.getElementById('signupPassword').value;
        if (!name || !isValidEmail(email) || password.length < 6) {
          setMessage(message, 'Informe nome, e-mail válido e senha com 6+ caracteres.', 'error');
          return;
        }
        var signUpRes = await client.auth.signUp({
          email: email,
          password: password,
          options: { data: { full_name: name }, emailRedirectTo: window.location.origin + '/portal/dashboard.html' }
        });
        if (signUpRes.error) {
          setMessage(message, signUpRes.error.message, 'error');
          return;
        }
        setMessage(message, 'Conta criada! Verifique seu e-mail para confirmar o acesso.', 'success');
      });
    }

    if (googleBtn) {
      googleBtn.addEventListener('click', async function () {
        var oauthRes = await client.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin + '/portal/dashboard.html' }
        });
        if (oauthRes.error) {
          setMessage(message, oauthRes.error.message, 'error');
        }
      });
    }
  }

  async function initDashboardPage() {
    var user = await getSessionUser();
    if (!user) {
      window.location.replace('/portal/index.html');
      return;
    }

    var navLinks = document.querySelectorAll('.portal-nav-link');
    navLinks.forEach(function (btn) {
      btn.addEventListener('click', function () {
        showSection(btn.getAttribute('data-section'));
      });
    });

    var logoutBtn = document.getElementById('portalLogout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async function () {
        await client.auth.signOut();
        window.location.replace('/portal/index.html');
      });
    }

    var updatePasswordForm = document.getElementById('updatePasswordForm');
    var configMessage = document.getElementById('portalConfigMessage');
    if (updatePasswordForm) {
      updatePasswordForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        var password = document.getElementById('newPassword').value;
        if (!password || password.length < 6) return;
        var response = await client.auth.updateUser({ password: password });
        if (response.error) {
          setMessage(configMessage, 'Não foi possível atualizar a senha: ' + response.error.message, 'error');
          return;
        }
        setMessage(configMessage, 'Senha atualizada com sucesso.', 'success');
        updatePasswordForm.reset();
      });
    }

    await loadDashboardData(user);
  }

  async function initResetPage() {
    var user = await getSessionUser();
    var message = document.getElementById('portalResetMessage');
    var form = document.getElementById('resetPasswordForm');

    if (!user) {
      setMessage(message, 'Abra este link pelo e-mail de recuperação enviado pela HOSPEDAH.', 'error');
      return;
    }

    if (form) {
      form.addEventListener('submit', async function (event) {
        event.preventDefault();
        var password = document.getElementById('resetNewPassword').value;
        if (!password || password.length < 6) {
          setMessage(message, 'A senha deve ter ao menos 6 caracteres.', 'error');
          return;
        }
        var resetRes = await client.auth.updateUser({ password: password });
        if (resetRes.error) {
          setMessage(message, resetRes.error.message, 'error');
          return;
        }
        setMessage(message, 'Senha atualizada! Redirecionando...', 'success');
        window.setTimeout(function () {
          window.location.replace('/portal/dashboard.html');
        }, 1200);
      });
    }
  }

  async function init() {
    try {
      client = getClient();
    } catch (err) {
      setMessage(findFirstMessageElement(), err.message, 'error');
      console.error(err);
      return;
    }

    var page = document.body.getAttribute('data-portal-page');
    if (page === 'auth') {
      await initAuthPage();
      return;
    }
    if (page === 'dashboard') {
      await initDashboardPage();
      return;
    }
    if (page === 'reset-password') {
      await initResetPage();
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    init().catch(function () {
      setMessage(findFirstMessageElement(), 'Não foi possível inicializar o portal.', 'error');
    });
  });
})();
