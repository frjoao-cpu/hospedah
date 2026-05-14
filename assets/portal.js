(function () {
  'use strict';

  /* ── Resort cover images (mapped from data.json ogImage values) ── */
  var DEFAULT_RESORT_IMAGE = 'https://i.imgur.com/AmFSwwd.jpeg';
  var RESORT_IMAGES = {
    'hot beach':    'https://i.imgur.com/AmFSwwd.jpeg',
    'hotbeach':     'https://i.imgur.com/AmFSwwd.jpeg',
    'são pedro':    'https://i.imgur.com/pyEKOtQ.jpeg',
    'sao pedro':    'https://i.imgur.com/pyEKOtQ.jpeg',
    'saopedro':     'https://i.imgur.com/pyEKOtQ.jpeg',
    'thermas':      'https://i.imgur.com/pyEKOtQ.jpeg',
    'olimpia':      'https://i.imgur.com/AseZPzL.jpeg',
    'olímpia':      'https://i.imgur.com/AseZPzL.jpeg',
    'wyndham':      'https://i.imgur.com/iDMQ2XA.jpeg',
    'solar':        'https://i.imgur.com/S4tSUzG.jpeg',
    'águas':        'https://i.imgur.com/S4tSUzG.jpeg',
    'aguas':        'https://i.imgur.com/S4tSUzG.jpeg',
    'juquehy':      'https://i.imgur.com/SxlktwS.jpeg',
    'ipioca':       'https://i.imgur.com/o4Esa54.jpg',
    'porto':        'https://i.imgur.com/x23SHdy.jpeg',
    'porto 2':      'https://i.imgur.com/x23SHdy.jpeg',
    'portoi2':      'https://i.imgur.com/x23SHdy.jpeg',
    'default':      DEFAULT_RESORT_IMAGE
  };

  function getResortImage(name) {
    if (!name) return RESORT_IMAGES['default'];
    var lower = String(name).toLowerCase().trim();
    for (var key in RESORT_IMAGES) {
      if (key !== 'default' && lower.indexOf(key) !== -1) return RESORT_IMAGES[key];
    }
    return RESORT_IMAGES['default'];
  }

  function escapeAttr(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function imgFallbackAttr() {
    return ' onerror="this.onerror=null;this.src=\'' + DEFAULT_RESORT_IMAGE + '\';"';
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

  function portalUrl(path) {
    return window.location.origin + path;
  }

  function translateAuthError(message) {
    var errorMessage = message || 'Não foi possível concluir a autenticação.';
    var normalized = errorMessage.toLowerCase();
    if (normalized.indexOf('failed to fetch') !== -1 || normalized.indexOf('falhou em buscar') !== -1 || normalized.indexOf('networkerror') !== -1 || normalized.indexOf('network request failed') !== -1) {
      return 'Erro de conexão com o servidor. Verifique sua internet e tente novamente.';
    }
    if (normalized.indexOf('invalid login credentials') !== -1) {
      return 'E-mail ou senha incorretos. Confira os dados ou use "Esqueci minha senha".';
    }
    if (normalized.indexOf('email not confirmed') !== -1) {
      return 'E-mail não confirmado. Verifique sua caixa de entrada (incluindo spam) ou use o link mágico.';
    }
    if (normalized.indexOf('already registered') !== -1 || normalized.indexOf('already been registered') !== -1) {
      return 'Este e-mail já está cadastrado. Use a aba "Entrar" ou recupere a senha.';
    }
    if (normalized.indexOf('rate limit') !== -1 || normalized.indexOf('too many') !== -1) {
      return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.';
    }
    if (normalized.indexOf('provider') !== -1 || normalized.indexOf('not enabled') !== -1 || normalized.indexOf('unsupported') !== -1) {
      return 'Login com Google temporariamente indisponível. Use e-mail e senha ou link mágico.';
    }
    return errorMessage;
  }

  function getHashParamString() {
    var hashParams = window.location.hash ? window.location.hash.slice(1) : '';
    return hashParams.charAt(0) === '?' ? hashParams.slice(1) : hashParams;
  }

  function getAuthRedirectError() {
    var sources = [window.location.search, getHashParamString()];
    for (var i = 0; i < sources.length; i++) {
      var params = new URLSearchParams(sources[i]);
      var error = params.get('error_description') || params.get('error');
      if (error) return translateAuthError(error.replace(/\+/g, ' '));
    }
    return '';
  }

  async function exchangeCodeFromUrl() {
    var code = new URLSearchParams(window.location.search).get('code');
    if (!code) return null;
    if (!client.auth.exchangeCodeForSession) {
      console.warn('Supabase client sem exchangeCodeForSession; confirme o carregamento de @supabase/supabase-js v2.');
      return null;
    }
    var codeRes = await client.auth.exchangeCodeForSession(code);
    if (codeRes.error) throw codeRes.error;
    return codeRes.data && codeRes.data.session && codeRes.data.session.user;
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
    try {
      var exchangedUser = await exchangeCodeFromUrl();
      if (exchangedUser) return exchangedUser;
      var sessionRes = await client.auth.getSession();
      if (sessionRes && sessionRes.data && sessionRes.data.session && sessionRes.data.session.user) {
        return sessionRes.data.session.user;
      }
      var userRes = await client.auth.getUser();
      return (userRes && userRes.data && userRes.data.user) || null;
    } catch (e) {
      return null;
    }
  }

  function renderReservationCard(row) {
    var img = getResortImage(row.resort);
    var statusClass = (row.status || '').toLowerCase().replace(/[^a-z]/g, '');
    var badgeClass = statusClass === 'confirmada' ? 'confirmada' : 'prereserva';
    var resortName = escapeAttr(row.resort || 'Resort');
    return '<article class="portal-item">' +
      '<img class="portal-item-thumb" src="' + img + '" alt="' + resortName + '" loading="lazy"' + imgFallbackAttr() + '>' +
      '<div class="portal-item-body">' +
      '<h3>' + resortName + '</h3>' +
      '<p>📅 Check-in: <strong>' + escapeAttr(row.checkin || '—') + '</strong></p>' +
      '<p>📅 Check-out: <strong>' + escapeAttr(row.checkout || '—') + '</strong></p>' +
      '<span class="portal-status-badge ' + badgeClass + '">' + escapeAttr(row.status || 'Pendente') + '</span>' +
      '</div></article>';
  }

  function renderVoucherCard(voucher) {
    var img = getResortImage(voucher.resort);
    var resortName = escapeAttr(voucher.resort || 'Resort');
    return '<article class="voucher-card">' +
      '<img class="voucher-banner" src="' + img + '" alt="' + resortName + '" loading="lazy"' + imgFallbackAttr() + '>' +
      '<div class="voucher-body">' +
      '<h3>🎫 ' + escapeAttr(voucher.title || '') + '</h3>' +
      '<span class="voucher-code">' + escapeAttr(voucher.code || '') + '</span>' +
      '<div class="qr-box">' + makeQrSvg(voucher.code || '') + '</div>' +
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

  function initPasswordToggles() {
    document.querySelectorAll('.portal-eye-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetInput = document.getElementById(btn.getAttribute('data-target'));
        if (!targetInput) return;
        var isHidden = targetInput.type === 'password';
        targetInput.type = isHidden ? 'text' : 'password';
        btn.setAttribute('aria-label', isHidden ? 'Ocultar senha' : 'Mostrar senha');
        btn.textContent = isHidden ? '🙈' : '👁';
      });
    });
  }

  function initStrengthMeter() {
    var passwordInput = document.getElementById('signupPassword');
    var fill = document.getElementById('signupStrengthFill');
    var label = document.getElementById('signupStrengthLabel');
    if (!passwordInput || !fill || !label) return;
    passwordInput.addEventListener('input', function () {
      var val = passwordInput.value;
      var score = 0;
      if (val.length >= 6) score++;
      if (val.length >= 10) score++;
      if (/[A-Z]/.test(val)) score++;
      if (/[0-9]/.test(val)) score++;
      if (/[^A-Za-z0-9]/.test(val)) score++;
      var levels = [
        { pct: '0%',   color: 'transparent', text: '' },
        { pct: '25%',  color: '#e74c3c',      text: 'Fraca' },
        { pct: '50%',  color: '#f39c12',      text: 'Razoável' },
        { pct: '75%',  color: '#f0c93a',      text: 'Boa' },
        { pct: '90%',  color: '#22c55e',      text: 'Forte' },
        { pct: '100%', color: '#16a34a',      text: 'Excelente' }
      ];
      var lv = levels[Math.min(score, levels.length - 1)];
      fill.style.width = val.length ? lv.pct : '0%';
      fill.style.background = lv.color;
      label.textContent = val.length ? lv.text : '';
      label.style.color = lv.color;
    });
  }

  async function initAuthPage() {
    var message   = document.getElementById('portalAuthMessage');
    var loginForm  = document.getElementById('loginForm');
    var signupForm = document.getElementById('signupForm');
    var googleBtn  = document.getElementById('btnGoogleAuth');
    var magicBtn   = document.getElementById('btnMagicLink');
    var resetBtn   = document.getElementById('btnPasswordReset');

    var redirectError = getAuthRedirectError();
    if (redirectError) {
      setMessage(message, redirectError, 'error');
    }

    try {
      var activeUser = await getSessionUser();
      if (activeUser) {
        window.location.replace('/portal/dashboard.html');
        return;
      }
    } catch (e) {
      /* Session check failed — show login form anyway */
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
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '⏳ Entrando…'; }
        try {
          var loginRes = await client.auth.signInWithPassword({ email: email, password: password });
          if (loginRes.error) {
            setMessage(message, translateAuthError(loginRes.error.message), 'error');
            return;
          }
          window.location.replace('/portal/dashboard.html');
        } catch (err) {
          setMessage(message, 'Erro de conexão. Verifique sua internet e tente novamente.', 'error');
        } finally {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '🔐 Entrar na minha conta'; }
        }
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
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '⏳ Criando conta…'; }
        try {
          var signUpRes = await client.auth.signUp({
            email: email,
            password: password,
            options: { data: { full_name: name }, emailRedirectTo: portalUrl('/portal/dashboard.html') }
          });
          if (signUpRes.error) {
            setMessage(message, translateAuthError(signUpRes.error.message), 'error');
            return;
          }
          if (signUpRes.data && signUpRes.data.session) {
            window.location.replace('/portal/dashboard.html');
            return;
          }
          setMessage(message, '✅ Conta criada! Verifique seu e-mail para confirmar o acesso.', 'success');
        } catch (err) {
          setMessage(message, 'Erro de conexão. Verifique sua internet e tente novamente.', 'error');
        } finally {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '🚀 Criar minha conta'; }
        }
      });
    }

    if (magicBtn) {
      magicBtn.addEventListener('click', async function () {
        var loginFormEl   = document.getElementById('loginForm');
        var isLoginActive = loginFormEl && !loginFormEl.classList.contains('hidden');
        var emailInput    = isLoginActive
          ? document.getElementById('loginEmail')
          : document.getElementById('signupEmail');
        var email = emailInput ? emailInput.value.trim().toLowerCase() : '';
        if (!isValidEmail(email)) {
          setMessage(message, 'Digite seu e-mail no campo acima para receber o link mágico.', 'error');
          return;
        }
        magicBtn.disabled = true;
        magicBtn.textContent = '⏳ Enviando link…';
        try {
          var otpRes = await client.auth.signInWithOtp({
            email: email,
            options: { emailRedirectTo: portalUrl('/portal/dashboard.html') }
          });
          if (otpRes.error) { throw otpRes.error; }
          setMessage(message, '✉️ Link mágico enviado para ' + email + '. Verifique sua caixa de entrada.', 'success');
        } catch (otpErr) {
          var otpErrMsg = (otpErr && otpErr.message) ? otpErr.message : 'Erro ao enviar link. Tente novamente.';
          setMessage(message, translateAuthError(otpErrMsg), 'error');
        } finally {
          magicBtn.disabled = false;
          magicBtn.textContent = '✉️ Link mágico por e-mail';
        }
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', async function () {
        var loginFormEl = document.getElementById('loginForm');
        var isLoginActive = loginFormEl && !loginFormEl.classList.contains('hidden');
        var emailInput = isLoginActive
          ? document.getElementById('loginEmail')
          : document.getElementById('signupEmail');
        var email = emailInput ? emailInput.value.trim().toLowerCase() : '';
        if (!isValidEmail(email)) {
          setMessage(message, 'Digite um e-mail válido para receber o link de recuperação de senha.', 'error');
          return;
        }
        resetBtn.disabled = true;
        resetBtn.textContent = '⏳ Enviando recuperação…';
        try {
          var resetRes = await client.auth.resetPasswordForEmail(email, {
            redirectTo: portalUrl('/portal/reset-password.html')
          });
          if (resetRes.error) { throw resetRes.error; }
          setMessage(message, '🔁 Enviamos o link de recuperação para ' + email + '.', 'success');
        } catch (resetErr) {
          var resetErrMsg = (resetErr && resetErr.message) ? resetErr.message : 'Erro ao enviar recuperação. Tente novamente.';
          setMessage(message, translateAuthError(resetErrMsg), 'error');
        } finally {
          resetBtn.disabled = false;
          resetBtn.textContent = '🔁 Esqueci minha senha';
        }
      });
    }

    if (googleBtn) {
      googleBtn.addEventListener('click', async function () {
        googleBtn.disabled = true;
        googleBtn.textContent = 'Conectando…';
        try {
          var oauthRes = await client.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin + '/portal/dashboard.html' }
          });
          if (oauthRes.error) {
            throw oauthRes.error;
          }
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
            errMsg = 'Login com Google temporariamente indisponível. Use e-mail e senha ou link mágico.';
          }
          setMessage(message, translateAuthError(errMsg), 'error');
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
        logoutBtn.disabled = true;
        logoutBtn.textContent = '⏳ Saindo…';
        try {
          await client.auth.signOut();
        } catch (e) {
          /* Force redirect even if signOut fails */
        }
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
        try {
          var response = await client.auth.updateUser({ password: password });
          if (response.error) {
            setMessage(configMessage, 'Não foi possível atualizar a senha: ' + response.error.message, 'error');
            return;
          }
          setMessage(configMessage, '✅ Senha atualizada com sucesso.', 'success');
          updatePasswordForm.reset();
        } catch (err) {
          setMessage(configMessage, 'Erro de conexão. Verifique sua internet e tente novamente.', 'error');
        } finally {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '🔐 Salvar nova senha'; }
        }
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
        var submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Salvando…'; }
        try {
          var resetRes = await client.auth.updateUser({ password: password });
          if (resetRes.error) {
            setMessage(message, resetRes.error.message, 'error');
            return;
          }
          setMessage(message, '✅ Senha atualizada! Redirecionando…', 'success');
          window.setTimeout(function () {
            window.location.replace('/portal/dashboard.html');
          }, 1200);
        } catch (err) {
          setMessage(message, 'Erro de conexão. Verifique sua internet e tente novamente.', 'error');
        } finally {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Atualizar senha'; }
        }
      });
    }
  }

  async function init() {
    /* Always initialize UI interactions first — independent of Supabase */
    var page = document.body.getAttribute('data-portal-page');
    if (page === 'auth') {
      initAuthTabs();
      initStrengthMeter();
    }
    /* Password toggles apply on any page that has eye buttons */
    initPasswordToggles();

    try {
      client = getClient();
    } catch (err) {
      setMessage(findFirstMessageElement(), err.message, 'error');
      console.error(err);
      return;
    }

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
