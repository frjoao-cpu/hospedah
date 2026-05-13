(function () {
  'use strict';

  var PATH = window.location.pathname || '';
  var IS_AUTH_PAGE = PATH.indexOf('/portal/index.html') !== -1 || PATH.endsWith('/portal/');
  var IS_DASHBOARD = PATH.indexOf('/portal/dashboard.html') !== -1;
  var IS_RESET = PATH.indexOf('/portal/reset-password.html') !== -1;

  function $(id) { return document.getElementById(id); }

  function getSupabaseClient() {
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error('Supabase SDK indisponível.');
    }
    var url = window.HOSPEDAH_SB_URL;
    var anon = window.HOSPEDAH_SB_ANON;
    if (!url || !anon) {
      throw new Error('Configuração do Supabase ausente.');
    }
    return window.supabase.createClient(url, anon);
  }

  var sb;
  try {
    sb = getSupabaseClient();
  } catch (err) {
    sb = null;
    console.warn(err.message);
  }

  function setFeedback(id, message, type) {
    var el = $(id);
    if (!el) return;
    el.className = 'portal-feedback';
    if (type) el.classList.add(type);
    el.textContent = message || '';
  }

  function toggleLoading(button, loadingText, normalText, isLoading) {
    if (!button) return;
    button.disabled = !!isLoading;
    button.textContent = isLoading ? loadingText : normalText;
  }

  function getFieldErrorEl(fieldId) {
    return document.querySelector('[data-error-for="' + fieldId + '"]');
  }

  function setFieldError(fieldId, message) {
    var errEl = getFieldErrorEl(fieldId);
    if (errEl) errEl.textContent = message || '';
  }

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
  }

  function validateLoginForm() {
    var ok = true;
    var email = $('loginEmail').value.trim();
    var password = $('loginPassword').value;

    if (!validateEmail(email)) {
      setFieldError('loginEmail', 'Informe um e-mail válido.');
      ok = false;
    } else {
      setFieldError('loginEmail', '');
    }

    if (!password || password.length < 6) {
      setFieldError('loginPassword', 'A senha deve ter ao menos 6 caracteres.');
      ok = false;
    } else {
      setFieldError('loginPassword', '');
    }

    return ok;
  }

  function validateSignupForm() {
    var ok = true;
    var name = $('signupName').value.trim();
    var email = $('signupEmail').value.trim();
    var whatsapp = $('signupWhatsapp').value.replace(/\D/g, '');
    var password = $('signupPassword').value;
    var confirm = $('signupConfirmPassword').value;
    var terms = $('signupTerms').checked;

    if (name.length < 3) {
      setFieldError('signupName', 'Informe seu nome completo.');
      ok = false;
    } else {
      setFieldError('signupName', '');
    }

    if (!validateEmail(email)) {
      setFieldError('signupEmail', 'Informe um e-mail válido.');
      ok = false;
    } else {
      setFieldError('signupEmail', '');
    }

    if (whatsapp.length < 10) {
      setFieldError('signupWhatsapp', 'Informe um WhatsApp com DDD.');
      ok = false;
    } else {
      setFieldError('signupWhatsapp', '');
    }

    if (!password || password.length < 6) {
      setFieldError('signupPassword', 'A senha deve ter no mínimo 6 caracteres.');
      ok = false;
    } else {
      setFieldError('signupPassword', '');
    }

    if (confirm !== password) {
      setFieldError('signupConfirmPassword', 'As senhas não coincidem.');
      ok = false;
    } else {
      setFieldError('signupConfirmPassword', '');
    }

    if (!terms) {
      setFieldError('signupTerms', 'Você precisa aceitar os termos.');
      ok = false;
    } else {
      setFieldError('signupTerms', '');
    }

    return ok;
  }

  function setupTabs() {
    var tabs = document.querySelectorAll('.auth-tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (btn) {
          btn.classList.remove('active');
          btn.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');

        var panel = tab.getAttribute('data-tab');
        ['login', 'signup'].forEach(function (name) {
          var current = $('panel-' + name);
          if (current) current.classList.toggle('active', panel === name);
        });
        setFeedback('portalAuthFeedback', '');
      });
    });
  }

  function attachRealtimeValidation(formId) {
    var form = $(formId);
    if (!form) return;
    form.querySelectorAll('input').forEach(function (input) {
      input.addEventListener('input', function () {
        if (formId === 'loginForm') validateLoginForm();
        if (formId === 'signupForm') validateSignupForm();
      });
    });
  }

  function getRedirectToDashboard() {
    return window.location.origin + '/portal/dashboard.html';
  }

  function setupAuthPage() {
    setupTabs();
    attachRealtimeValidation('loginForm');
    attachRealtimeValidation('signupForm');

    var loginForm = $('loginForm');
    var signupForm = $('signupForm');
    var googleBtn = $('googleLoginBtn');
    var forgotBtn = $('forgotPasswordBtn');

    if (loginForm) {
      loginForm.addEventListener('submit', function (event) {
        event.preventDefault();
        if (!validateLoginForm()) return;
        if (!sb) {
          setFeedback('portalAuthFeedback', 'Serviço de autenticação indisponível.', 'error');
          return;
        }

        var submit = $('loginSubmit');
        toggleLoading(submit, 'Entrando...', 'Entrar', true);
        setFeedback('portalAuthFeedback', '');

        sb.auth.signInWithPassword({
          email: $('loginEmail').value.trim(),
          password: $('loginPassword').value,
        }).then(function (result) {
          if (result.error) throw result.error;
          window.location.href = '/portal/dashboard.html';
        }).catch(function (err) {
          setFeedback('portalAuthFeedback', err.message || 'Não foi possível entrar.', 'error');
        }).finally(function () {
          toggleLoading(submit, 'Entrando...', 'Entrar', false);
        });
      });
    }

    if (signupForm) {
      signupForm.addEventListener('submit', function (event) {
        event.preventDefault();
        if (!validateSignupForm()) return;
        if (!sb) {
          setFeedback('portalAuthFeedback', 'Serviço de autenticação indisponível.', 'error');
          return;
        }

        var submit = $('signupSubmit');
        toggleLoading(submit, 'Criando conta...', 'Criar conta', true);
        setFeedback('portalAuthFeedback', '');

        sb.auth.signUp({
          email: $('signupEmail').value.trim(),
          password: $('signupPassword').value,
          options: {
            emailRedirectTo: getRedirectToDashboard(),
            data: {
              full_name: $('signupName').value.trim(),
              whatsapp: $('signupWhatsapp').value.trim()
            }
          }
        }).then(function (result) {
          if (result.error) throw result.error;
          setFeedback('portalAuthFeedback', 'Conta criada com sucesso! Verifique seu e-mail para confirmar.', 'success');
          signupForm.reset();
        }).catch(function (err) {
          setFeedback('portalAuthFeedback', err.message || 'Não foi possível criar a conta.', 'error');
        }).finally(function () {
          toggleLoading(submit, 'Criando conta...', 'Criar conta', false);
        });
      });
    }

    if (googleBtn) {
      googleBtn.addEventListener('click', function () {
        if (!sb) {
          setFeedback('portalAuthFeedback', 'Serviço de autenticação indisponível.', 'error');
          return;
        }
        toggleLoading(googleBtn, 'Redirecionando...', 'Continuar com Google', true);
        sb.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: getRedirectToDashboard() }
        }).catch(function (err) {
          setFeedback('portalAuthFeedback', err.message || 'Falha ao autenticar com Google.', 'error');
          toggleLoading(googleBtn, 'Redirecionando...', 'Continuar com Google', false);
        });
      });
    }

    if (forgotBtn) {
      forgotBtn.addEventListener('click', function () {
        if (!sb) {
          setFeedback('portalAuthFeedback', 'Serviço de autenticação indisponível.', 'error');
          return;
        }
        var email = $('loginEmail').value.trim();
        if (!validateEmail(email)) {
          setFeedback('portalAuthFeedback', 'Informe um e-mail válido para recuperar a senha.', 'error');
          return;
        }

        sb.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + '/portal/reset-password.html'
        }).then(function (result) {
          if (result.error) throw result.error;
          setFeedback('portalAuthFeedback', 'Enviamos um link de recuperação para seu e-mail.', 'success');
        }).catch(function (err) {
          setFeedback('portalAuthFeedback', err.message || 'Não foi possível enviar o link.', 'error');
        });
      });
    }
  }

  function loyaltyTier(points) {
    if (points >= 6000) return { name: 'Diamond', next: 8000, benefits: ['Upgrade prioritário', 'Transfer VIP', 'Atendimento dedicado 24h'] };
    if (points >= 3500) return { name: 'Gold', next: 6000, benefits: ['Late checkout', 'Cupom de 8%', 'Prioridade no atendimento'] };
    if (points >= 1500) return { name: 'Silver', next: 3500, benefits: ['Cupom de 5%', 'Condições exclusivas no WhatsApp'] };
    return { name: 'Bronze', next: 1500, benefits: ['Acesso ao portal e ofertas sazonais'] };
  }

  function renderReservationCard(item) {
    var statusClass = item.status === 'confirmada' ? 'badge-confirmada' : item.status === 'pendente' ? 'badge-pendente' : 'badge-concluida';
    return '<article class="portal-item-card">' +
      '<h3>' + item.resort + '</h3>' +
      '<p><strong>Período:</strong> ' + item.periodo + '</p>' +
      '<span class="badge ' + statusClass + '">' + item.status + '</span>' +
      (item.whatsapp ? '<a class="wpp-action" href="' + item.whatsapp + '" target="_blank" rel="noopener">💬 Falar sobre esta reserva</a>' : '') +
    '</article>';
  }

  function qrSvg(value) {
    var safe = String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return '<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="QR code do voucher">' +
      '<rect width="120" height="120" fill="#ffffff"></rect>' +
      '<rect x="8" y="8" width="26" height="26" fill="#0B1C3D"></rect>' +
      '<rect x="86" y="8" width="26" height="26" fill="#0B1C3D"></rect>' +
      '<rect x="8" y="86" width="26" height="26" fill="#0B1C3D"></rect>' +
      '<rect x="48" y="44" width="10" height="10" fill="#0B1C3D"></rect>' +
      '<rect x="62" y="44" width="10" height="10" fill="#0B1C3D"></rect>' +
      '<rect x="48" y="58" width="10" height="10" fill="#0B1C3D"></rect>' +
      '<rect x="62" y="58" width="10" height="10" fill="#0B1C3D"></rect>' +
      '<text x="60" y="116" text-anchor="middle" font-size="6" fill="#0B1C3D">' + safe + '</text>' +
    '</svg>';
  }

  function updateDashboardMenu() {
    var buttons = document.querySelectorAll('.portal-menu-item[data-section]');
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var section = btn.getAttribute('data-section');
        buttons.forEach(function (item) { item.classList.remove('active'); });
        btn.classList.add('active');
        document.querySelectorAll('.portal-section').forEach(function (pane) {
          pane.classList.toggle('active', pane.id === 'section-' + section);
        });
      });
    });
  }

  function protectDashboard() {
    if (!sb) {
      window.location.replace('/portal/index.html');
      return Promise.reject(new Error('Sem cliente Supabase.'));
    }
    return sb.auth.getSession().then(function (res) {
      var user = res.data && res.data.session && res.data.session.user;
      if (!user) {
        window.location.replace('/portal/index.html');
        throw new Error('Sessão não encontrada.');
      }
      return user;
    });
  }

  function loadDashboardData(user) {
    var meta = user.user_metadata || {};
    var name = meta.full_name || meta.name || (user.email ? user.email.split('@')[0] : 'Hóspede');
    var points = Number(meta.loyalty_points || 1820);

    $('portalUserName').textContent = name;
    $('portalUserEmail').textContent = user.email || '';
    $('portalGreeting').textContent = 'Olá, ' + name + '!';
    $('portalAvatar').textContent = name.trim().charAt(0).toUpperCase() || '👤';

    var activeReservations = [
      {
        resort: 'Hot Beach Suites',
        periodo: '22/08/2026 a 26/08/2026',
        status: 'confirmada',
        whatsapp: 'https://wa.me/5517982006382?text=Ol%C3%A1!%20Quero%20falar%20da%20reserva%20Hot%20Beach.'
      },
      {
        resort: 'Praia de Juquehy',
        periodo: '15/12/2026 a 19/12/2026',
        status: 'pendente',
        whatsapp: 'https://wa.me/5517982006382?text=Ol%C3%A1!%20Quero%20confirmar%20a%20reserva%20em%20Juquehy.'
      }
    ];

    var historyReservations = [
      { resort: 'Wyndham Royal Resort', periodo: '10/01/2026 a 14/01/2026', status: 'concluida' },
      { resort: 'Solar das Águas', periodo: '18/07/2025 a 22/07/2025', status: 'concluida' }
    ];

    var vouchers = [
      { title: 'Voucher Check-in', code: 'HSPD-CHK-2026-01' },
      { title: 'Voucher Transfer', code: 'HSPD-TRF-2026-02' },
      { title: 'Voucher Welcome Drink', code: 'HSPD-WLC-2026-03' }
    ];

    $('summaryActiveBookings').textContent = String(activeReservations.length);
    $('summaryPoints').textContent = String(points);
    $('summaryVouchers').textContent = String(vouchers.length);

    $('reservationsList').innerHTML = activeReservations.map(renderReservationCard).join('');
    $('historyList').innerHTML = historyReservations.map(renderReservationCard).join('');

    var tier = loyaltyTier(points);
    var pct = Math.max(6, Math.min(100, Math.round((points / tier.next) * 100)));
    $('loyaltyTier').textContent = tier.name;
    $('loyaltyProgress').style.width = pct + '%';
    $('loyaltyPointsInfo').textContent = points + ' pontos • Próximo nível em ' + Math.max(0, tier.next - points) + ' pontos';
    $('loyaltyBenefits').innerHTML = tier.benefits.map(function (item) {
      return '<li>' + item + '</li>';
    }).join('');

    $('vouchersGrid').innerHTML = vouchers.map(function (voucher) {
      return '<article class="voucher-card">' +
        '<h3>' + voucher.title + '</h3>' +
        '<div class="voucher-qr">' + qrSvg(voucher.code) + '</div>' +
        '<p class="voucher-code">' + voucher.code + '</p>' +
      '</article>';
    }).join('');

    $('profileName').value = name;
    $('profileWhatsapp').value = meta.whatsapp || '';
  }

  function setupSettingsForms() {
    var profileForm = $('profileForm');
    var passwordForm = $('passwordForm');

    if (profileForm) {
      profileForm.addEventListener('submit', function (event) {
        event.preventDefault();
        if (!sb) {
          setFeedback('portalDashboardFeedback', 'Serviço de autenticação indisponível.', 'error');
          return;
        }

        var name = $('profileName').value.trim();
        var whatsapp = $('profileWhatsapp').value.trim();
        if (name.length < 3 || whatsapp.length < 10) {
          setFeedback('portalDashboardFeedback', 'Preencha nome e WhatsApp válidos.', 'error');
          return;
        }

        sb.auth.updateUser({
          data: {
            full_name: name,
            whatsapp: whatsapp
          }
        }).then(function (result) {
          if (result.error) throw result.error;
          $('portalUserName').textContent = name;
          setFeedback('portalDashboardFeedback', 'Perfil atualizado com sucesso.', 'success');
        }).catch(function (err) {
          setFeedback('portalDashboardFeedback', err.message || 'Falha ao atualizar perfil.', 'error');
        });
      });
    }

    if (passwordForm) {
      passwordForm.addEventListener('submit', function (event) {
        event.preventDefault();
        if (!sb) {
          setFeedback('portalDashboardFeedback', 'Serviço de autenticação indisponível.', 'error');
          return;
        }

        var password = $('newPassword').value;
        var confirm = $('confirmNewPassword').value;

        if (!password || password.length < 6) {
          setFeedback('portalDashboardFeedback', 'A nova senha deve ter no mínimo 6 caracteres.', 'error');
          return;
        }
        if (password !== confirm) {
          setFeedback('portalDashboardFeedback', 'As senhas não coincidem.', 'error');
          return;
        }

        sb.auth.updateUser({ password: password }).then(function (result) {
          if (result.error) throw result.error;
          passwordForm.reset();
          setFeedback('portalDashboardFeedback', 'Senha atualizada com sucesso.', 'success');
        }).catch(function (err) {
          setFeedback('portalDashboardFeedback', err.message || 'Falha ao atualizar senha.', 'error');
        });
      });
    }
  }

  function setupLogout() {
    var btn = $('portalLogoutBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (!sb) {
        window.location.replace('/portal/index.html');
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Saindo...';
      sb.auth.signOut().finally(function () {
        window.location.replace('/portal/index.html');
      });
    });
  }

  function setupResetPage() {
    var requestForm = $('resetRequestForm');
    var updateForm = $('resetUpdateForm');
    var hash = window.location.hash || '';
    var hasRecoveryToken = hash.indexOf('access_token=') !== -1 || hash.indexOf('type=recovery') !== -1;

    if (requestForm) requestForm.style.display = hasRecoveryToken ? 'none' : 'grid';
    if (updateForm) updateForm.style.display = hasRecoveryToken ? 'grid' : 'none';

    if (requestForm) {
      requestForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var email = $('resetEmail').value.trim();
        if (!validateEmail(email)) {
          setFeedback('portalResetFeedback', 'Informe um e-mail válido.', 'error');
          return;
        }
        if (!sb) {
          setFeedback('portalResetFeedback', 'Serviço de autenticação indisponível.', 'error');
          return;
        }

        var submit = $('resetRequestSubmit');
        toggleLoading(submit, 'Enviando...', 'Enviar link de recuperação', true);

        sb.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + '/portal/reset-password.html'
        }).then(function (result) {
          if (result.error) throw result.error;
          setFeedback('portalResetFeedback', 'Link de recuperação enviado. Confira seu e-mail.', 'success');
          requestForm.reset();
        }).catch(function (err) {
          setFeedback('portalResetFeedback', err.message || 'Não foi possível enviar o link.', 'error');
        }).finally(function () {
          toggleLoading(submit, 'Enviando...', 'Enviar link de recuperação', false);
        });
      });
    }

    if (updateForm) {
      updateForm.addEventListener('submit', function (event) {
        event.preventDefault();
        if (!sb) {
          setFeedback('portalResetFeedback', 'Serviço de autenticação indisponível.', 'error');
          return;
        }

        var password = $('resetNewPassword').value;
        var confirm = $('resetConfirmPassword').value;
        if (!password || password.length < 6) {
          setFeedback('portalResetFeedback', 'A senha deve ter no mínimo 6 caracteres.', 'error');
          return;
        }
        if (password !== confirm) {
          setFeedback('portalResetFeedback', 'As senhas não coincidem.', 'error');
          return;
        }

        var submit = $('resetUpdateSubmit');
        toggleLoading(submit, 'Atualizando...', 'Atualizar senha', true);

        sb.auth.updateUser({ password: password }).then(function (result) {
          if (result.error) throw result.error;
          setFeedback('portalResetFeedback', 'Senha redefinida com sucesso. Faça login novamente.', 'success');
          updateForm.reset();
          setTimeout(function () {
            window.location.href = '/portal/index.html';
          }, 1500);
        }).catch(function (err) {
          setFeedback('portalResetFeedback', err.message || 'Falha ao redefinir senha.', 'error');
        }).finally(function () {
          toggleLoading(submit, 'Atualizando...', 'Atualizar senha', false);
        });
      });
    }
  }

  function initAuthSessionRedirect() {
    if (!sb || !IS_AUTH_PAGE) return;
    sb.auth.getSession().then(function (res) {
      var user = res.data && res.data.session && res.data.session.user;
      if (user) window.location.replace('/portal/dashboard.html');
    }).catch(function () {});
  }

  function initDashboardPage() {
    updateDashboardMenu();
    setupLogout();
    setupSettingsForms();
    protectDashboard().then(function (user) {
      loadDashboardData(user);
    }).catch(function () {});
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (IS_AUTH_PAGE) {
      setupAuthPage();
      initAuthSessionRedirect();
    }
    if (IS_DASHBOARD) {
      initDashboardPage();
    }
    if (IS_RESET) {
      setupResetPage();
    }
  });
})();
