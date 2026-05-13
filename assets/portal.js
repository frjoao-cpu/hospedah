(function () {
  'use strict';

  /* ── Resort cover images (mapped from data.json ogImage values) ── */
  var RESORT_IMAGES = {
    'hot beach':    'https://i.imgur.com/AmFSwwd.jpeg',
    'hotbeach':     'https://i.imgur.com/AmFSwwd.jpeg',
    'são pedro':    'https://i.imgur.com/pyEKOtQ.jpeg',
    'saopedro':     'https://i.imgur.com/pyEKOtQ.jpeg',
    'olimpia':      'https://i.imgur.com/AseZPzL.jpeg',
    'wyndham':      'https://i.imgur.com/iDMQ2XA.jpeg',
    'solar':        'https://i.imgur.com/S4tSUzG.jpeg',
    'juquehy':      'https://i.imgur.com/SxlktwS.jpeg',
    'ipioca':       'https://i.imgur.com/o4Esa54.jpg',
    'porto':        'https://i.imgur.com/x23SHdy.jpeg',
    'default':      'https://i.imgur.com/AmFSwwd.jpeg'
  };

  function getResortImage(name) {
    if (!name) return RESORT_IMAGES['default'];
    var lower = name.toLowerCase();
    for (var key in RESORT_IMAGES) {
      if (lower.indexOf(key) !== -1) return RESORT_IMAGES[key];
    }
    return RESORT_IMAGES['default'];
  }

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

  function renderReservationCard(row) {
    var img = getResortImage(row.resort);
    var statusClass = (row.status || '').toLowerCase().replace(/[^a-z]/g, '');
    var badgeClass = statusClass === 'confirmada' ? 'confirmada' : 'prereserva';
    return '<article class="portal-item">' +
      '<img class="portal-item-thumb" src="' + img + '" alt="' + (row.resort || 'Resort') + '" loading="lazy">' +
      '<div class="portal-item-body">' +
      '<h3>' + (row.resort || 'Resort') + '</h3>' +
      '<p>📅 Check-in: <strong>' + (row.checkin || '—') + '</strong></p>' +
      '<p>📅 Check-out: <strong>' + (row.checkout || '—') + '</strong></p>' +
      '<span class="portal-status-badge ' + badgeClass + '">' + (row.status || 'Pendente') + '</span>' +
      '</div></article>';
  }

  function renderVoucherCard(voucher) {
    var img = getResortImage(voucher.resort);
    return '<article class="voucher-card">' +
      '<img class="voucher-banner" src="' + img + '" alt="' + (voucher.resort || 'Resort') + '">' +
      '<div class="voucher-body">' +
      '<h3>🎫 ' + voucher.title + '</h3>' +
      '<span class="voucher-code">' + voucher.code + '</span>' +
      '<div class="qr-box">' + makeQrSvg(voucher.code) + '</div>' +
      '</div></article>';
  }

  async function loadDashboardData(user) {
    var reservationsWrap = document.getElementById('portalReservations');
    var vouchersWrap     = document.getElementById('portalVouchers');
    var tierTrack        = document.getElementById('tierTrack');
    var tierPoints       = document.getElementById('tierPoints');
    var tierNextLabel    = document.getElementById('tierNextLabel');
    var tierFill         = document.getElementById('tierProgressFill');
    var userInfo         = document.getElementById('portalUserInfo');
    var userTier         = document.getElementById('portalUserTier');

    var displayName = (user.user_metadata && user.user_metadata.full_name) || user.email || 'Hóspede';
    if (userInfo) userInfo.textContent = displayName;

    /* Show loading state */
    if (reservationsWrap) {
      reservationsWrap.innerHTML = '<div class="portal-loading"><div class="portal-spinner"></div><span>Carregando reservas…</span></div>';
    }

    var reservationRows = [];
    try {
      var reservationRes = await client
        .from('reservas')
        .select('resort, checkin, checkout, status')
        .eq('user_id', user.id)
        .order('checkin', { ascending: false })
        .limit(6);
      if (!reservationRes.error && reservationRes.data && reservationRes.data.length) {
        reservationRows = reservationRes.data;
      }
    } catch (err) {
      reservationRows = [];
    }

    /* Fallback demo data */
    if (!reservationRows.length) {
      reservationRows = [
        { resort: 'Hot Beach Suites',   checkin: '2026-07-18', checkout: '2026-07-22', status: 'Confirmada' },
        { resort: 'Ipioca Beach Resort', checkin: '2026-10-02', checkout: '2026-10-06', status: 'Pré-reserva' }
      ];
    }

    /* Reservations */
    if (reservationsWrap) {
      if (reservationRows.length) {
        reservationsWrap.innerHTML = reservationRows.map(renderReservationCard).join('');
      } else {
        reservationsWrap.innerHTML = '<div class="portal-empty"><div class="portal-empty-icon">🏨</div><p>Você ainda não tem reservas.</p><a href="/reservas.html">Fazer reserva</a></div>';
      }
    }

    /* Fidelidade */
    var points = reservationRows.length * 450;
    var tiers = [
      { name: 'Bronze',   icon: '🥉', min: 0,    max: 1199 },
      { name: 'Prata',    icon: '🥈', min: 1200, max: 2499 },
      { name: 'Ouro',     icon: '🥇', min: 2500, max: 4499 },
      { name: 'Diamante', icon: '💎', min: 4500, max: 9999 }
    ];

    var currentTier = tiers[0];
    var nextTier    = tiers[1];
    for (var i = 0; i < tiers.length; i++) {
      if (points >= tiers[i].min) {
        currentTier = tiers[i];
        nextTier    = tiers[i + 1] || null;
      }
    }

    if (userTier) {
      userTier.textContent = currentTier.icon + ' ' + currentTier.name;
    }

    if (tierPoints) tierPoints.textContent = points;
    if (tierNextLabel && nextTier) {
      tierNextLabel.textContent = 'Próximo: ' + nextTier.name + ' (' + nextTier.min + ' pts)';
    }
    if (tierFill) {
      var range = nextTier ? (nextTier.min - currentTier.min) : 1;
      var pct = nextTier && range > 0 ? Math.min(100, ((points - currentTier.min) / range) * 100) : 100;
      tierFill.style.width = pct.toFixed(1) + '%';
    }
    if (tierTrack) {
      tierTrack.innerHTML = tiers.map(function (tier) {
        var active = points >= tier.min;
        return '<div class="tier-step' + (active ? ' active' : '') + '">' +
          '<strong>' + tier.icon + ' ' + tier.name + '</strong>' +
          '<small>' + tier.min + '+ pts</small>' +
          '</div>';
      }).join('');
    }

    /* Vouchers */
    var voucherRows = reservationRows.map(function (item, index) {
      return {
        title:  'Voucher #' + (index + 1) + ' — ' + (item.resort || 'HOSPEDAH'),
        resort: item.resort,
        code:   (item.resort || 'HOSPEDAH').replace(/\s+/g, '').toUpperCase().slice(0, 8) + '-' + (index + 1) + '-' + user.id.slice(0, 6)
      };
    });

    if (vouchersWrap) {
      if (voucherRows.length) {
        vouchersWrap.innerHTML = voucherRows.map(renderVoucherCard).join('');
      } else {
        vouchersWrap.innerHTML = '<div class="portal-empty"><div class="portal-empty-icon">🎫</div><p>Nenhum voucher disponível.</p></div>';
      }
    }
  }

  function initAuthTabs() {
    var tabButtons = document.querySelectorAll('.portal-tab');
    var loginForm  = document.getElementById('loginForm');
    var signupForm = document.getElementById('signupForm');
    tabButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var isLogin = btn.getAttribute('data-tab') === 'login';
        tabButtons.forEach(function (item) {
          var active = item === btn;
          item.classList.toggle('active', active);
          item.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        if (loginForm)  loginForm.classList.toggle('hidden',  !isLogin);
        if (signupForm) signupForm.classList.toggle('hidden', isLogin);
      });
    });
  }

  async function initAuthPage() {
    initAuthTabs();
    var message   = document.getElementById('portalAuthMessage');
    var loginForm  = document.getElementById('loginForm');
    var signupForm = document.getElementById('signupForm');
    var googleBtn  = document.getElementById('btnGoogleAuth');

    var activeUser = await getSessionUser();
    if (activeUser) {
      window.location.replace('/portal/dashboard.html');
      return;
    }

    if (loginForm) {
      loginForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        var email    = document.getElementById('loginEmail').value.trim().toLowerCase();
        var password = document.getElementById('loginPassword').value;
        if (!isValidEmail(email) || !password) {
          setMessage(message, 'Preencha e-mail e senha válidos.', 'error');
          return;
        }
        var submitBtn = loginForm.querySelector('button[type="submit"]');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Entrando…'; }
        var loginRes = await client.auth.signInWithPassword({ email: email, password: password });
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Entrar na minha conta'; }
        if (loginRes.error) {
          var msg = loginRes.error.message;
          if (msg === 'Invalid login credentials') msg = 'E-mail ou senha incorretos.';
          setMessage(message, msg, 'error');
          return;
        }
        window.location.replace('/portal/dashboard.html');
      });
    }

    if (signupForm) {
      signupForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        var name     = document.getElementById('signupName').value.trim();
        var email    = document.getElementById('signupEmail').value.trim().toLowerCase();
        var password = document.getElementById('signupPassword').value;
        if (!name || !isValidEmail(email) || password.length < 6) {
          setMessage(message, 'Informe nome, e-mail válido e senha com 6+ caracteres.', 'error');
          return;
        }
        var submitBtn = signupForm.querySelector('button[type="submit"]');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Criando conta…'; }
        var signUpRes = await client.auth.signUp({
          email: email,
          password: password,
          options: { data: { full_name: name }, emailRedirectTo: window.location.origin + '/portal/dashboard.html' }
        });
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Criar minha conta'; }
        if (signUpRes.error) {
          var errMsg = signUpRes.error.message;
          if (errMsg && errMsg.toLowerCase().indexOf('already registered') !== -1) {
            errMsg = 'Este e-mail já está cadastrado. Use a aba "Entrar".';
          }
          setMessage(message, errMsg, 'error');
          return;
        }
        setMessage(message, '✅ Conta criada! Verifique seu e-mail para confirmar o acesso.', 'success');
      });
    }

    if (googleBtn) {
      googleBtn.addEventListener('click', async function () {
        googleBtn.disabled = true;
        googleBtn.textContent = 'Conectando…';
        var googleAuthNoteElement = document.getElementById('googleAuthNote');
        try {
          var oauthRes = await client.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin + '/portal/dashboard.html' }
          });
          if (oauthRes.error) {
            throw oauthRes.error;
          }
          /* Success: hide the config note */
          if (googleAuthNoteElement) googleAuthNoteElement.style.display = 'none';
        } catch (oauthErr) {
          var rawErrMsg = '';
          if (oauthErr) {
            rawErrMsg = oauthErr.message || oauthErr.msg || String(oauthErr);
          }
          var errMsg = rawErrMsg;
          var lc = errMsg.toLowerCase();
          var isProviderDisabled =
            lc.indexOf('provider') !== -1 ||
            lc.indexOf('not enabled') !== -1 ||
            lc.indexOf('unsupported') !== -1 ||
            (oauthErr && (oauthErr.status === 400 || oauthErr.code === 400));
          if (isProviderDisabled) {
            errMsg = '⚠️ Login com Google indisponível. Use e-mail e senha.';
            if (googleAuthNoteElement) googleAuthNoteElement.textContent = 'Para ativar: Supabase → Authentication → Providers → Google';
          }
          setMessage(message, errMsg, 'error');
          googleBtn.disabled = false;
          googleBtn.textContent = 'Entrar com Google';
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
    var configMessage      = document.getElementById('portalConfigMessage');
    if (updatePasswordForm) {
      updatePasswordForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        var password = document.getElementById('newPassword').value;
        if (!password || password.length < 6) {
          setMessage(configMessage, 'A senha deve ter ao menos 6 caracteres.', 'error');
          return;
        }
        var submitBtn = updatePasswordForm.querySelector('button[type="submit"]');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Salvando…'; }
        var response = await client.auth.updateUser({ password: password });
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '🔐 Salvar nova senha'; }
        if (response.error) {
          setMessage(configMessage, 'Não foi possível atualizar a senha: ' + response.error.message, 'error');
          return;
        }
        setMessage(configMessage, '✅ Senha atualizada com sucesso.', 'success');
        updatePasswordForm.reset();
      });
    }

    await loadDashboardData(user);
  }

  async function initResetPage() {
    var user    = await getSessionUser();
    var message = document.getElementById('portalResetMessage');
    var form    = document.getElementById('resetPasswordForm');

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
        setMessage(message, '✅ Senha atualizada! Redirecionando…', 'success');
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
