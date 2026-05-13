'use strict';

(function () {
  var PATHNAME = window.location.pathname || '';
  var IS_DASHBOARD = /\/portal\/dashboard\.html$/.test(PATHNAME);
  var IS_LOGIN = /\/portal\/(index\.html)?$/.test(PATHNAME) || /\/portal\/$/.test(PATHNAME);
  var IS_RESET = /\/portal\/reset-password\.html$/.test(PATHNAME);

  var portalToastTimeout = null;

  function getPortalToast() {
    return document.getElementById('portalToast');
  }

  function showToast(message, type) {
    var toast = getPortalToast();
    if (!toast) return;
    if (portalToastTimeout) {
      window.clearTimeout(portalToastTimeout);
      portalToastTimeout = null;
    }
    toast.textContent = message;
    toast.classList.add('is-visible');
    toast.style.borderColor = type === 'error' ? 'rgba(228, 93, 110, 0.7)' : 'rgba(212, 175, 55, 0.5)';
    portalToastTimeout = window.setTimeout(function () {
      toast.classList.remove('is-visible');
    }, 3000);
  }

  function withLoading(button, isLoading) {
    if (!button) return;
    button.classList.toggle('is-loading', isLoading);
    button.disabled = isLoading;
  }

  function setFieldHelp(id, text, isError) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || '';
    el.style.color = isError ? '#ffb2be' : '#a9b3ca';
  }

  function formatWhatsapp(value) {
    var digits = (value || '').replace(/\D/g, '').slice(0, 11);
    if (!digits) return '';
    if (digits.length <= 2) return '(' + digits;
    if (digits.length <= 6) return '(' + digits.slice(0, 2) + ') ' + digits.slice(2);
    if (digits.length <= 10) return '(' + digits.slice(0, 2) + ') ' + digits.slice(2, 6) + '-' + digits.slice(6);
    return '(' + digits.slice(0, 2) + ') ' + digits.slice(2, 7) + '-' + digits.slice(7);
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value || '');
  }

  function passwordStrength(password) {
    var pwd = password || '';
    var score = 0;
    if (pwd.length >= 8) score += 1;
    if (/[A-Z]/.test(pwd)) score += 1;
    if (/[a-z]/.test(pwd)) score += 1;
    if (/\d/.test(pwd)) score += 1;
    if (/[^\w\s]/.test(pwd)) score += 1;
    return score;
  }

  function applyPasswordStrengthUI(passwordInputId, barId, textId) {
    var input = document.getElementById(passwordInputId);
    var bar = document.getElementById(barId);
    var text = document.getElementById(textId);
    if (!input || !bar || !text) return;

    var score = passwordStrength(input.value);
    var width = Math.max(8, score * 20);
    var label = 'Fraca';
    var color = '#e45d6e';

    if (score >= 4) {
      label = 'Forte';
      color = '#21c17a';
    } else if (score >= 3) {
      label = 'Média';
      color = '#f4be4f';
    }

    bar.style.width = width + '%';
    bar.style.background = color;
    text.textContent = 'Força da senha: ' + label;
  }

  function setupPasswordToggles() {
    var toggleButtons = document.querySelectorAll('[data-password-toggle]');
    toggleButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetId = btn.getAttribute('data-password-toggle');
        var input = document.getElementById(targetId);
        if (!input) return;
        input.type = input.type === 'password' ? 'text' : 'password';
      });
    });
  }

  function setupTabs() {
    var tabButtons = document.querySelectorAll('[data-tab-target]');
    if (!tabButtons.length) return;

    tabButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        var target = button.getAttribute('data-tab-target');
        var panel = document.getElementById(target);
        if (!panel) return;

        document.querySelectorAll('.portal-tab').forEach(function (tabBtn) {
          tabBtn.classList.remove('is-active');
          tabBtn.setAttribute('aria-selected', 'false');
        });
        document.querySelectorAll('.portal-tab-panel').forEach(function (tabPanel) {
          tabPanel.classList.remove('is-active');
          tabPanel.hidden = true;
        });

        var associatedTab = document.querySelector('[aria-controls="' + target + '"]');
        if (associatedTab) {
          associatedTab.classList.add('is-active');
          associatedTab.setAttribute('aria-selected', 'true');
        }
        panel.hidden = false;
        panel.classList.add('is-active');

        var firstField = panel.querySelector('input');
        if (firstField) firstField.focus();
      });
    });
  }

  function mapAuthError(error) {
    var msg = (error && error.message ? error.message : 'Não foi possível concluir a operação.').toLowerCase();
    if (msg.indexOf('invalid login credentials') !== -1) return 'E-mail ou senha inválidos.';
    if (msg.indexOf('email not confirmed') !== -1) return 'Confirme seu e-mail antes de entrar.';
    if (msg.indexOf('password should be at least') !== -1) return 'A senha precisa ter ao menos 8 caracteres.';
    if (msg.indexOf('user already registered') !== -1) return 'Este e-mail já está cadastrado. Tente entrar.';
    if (msg.indexOf('network') !== -1) return 'Falha de conexão. Verifique sua internet.';
    return error && error.message ? error.message : 'Não foi possível concluir a operação.';
  }

  function getSupabaseClient() {
    if (!window.supabase || !window.HOSPEDAH_SB_URL || !window.HOSPEDAH_SB_ANON) {
      showToast('Falha ao carregar o serviço de autenticação.', 'error');
      return null;
    }
    return window.supabase.createClient(window.HOSPEDAH_SB_URL, window.HOSPEDAH_SB_ANON);
  }

  function getOrigin() {
    return window.location.origin || '';
  }

  function getDashboardUrl() {
    return getOrigin() + '/portal/dashboard.html';
  }

  function getResetUrl() {
    return getOrigin() + '/portal/reset-password.html';
  }

  async function requireSession(sb) {
    var sessionRes = await sb.auth.getSession();
    var session = sessionRes && sessionRes.data ? sessionRes.data.session : null;
    if (!session || !session.user) {
      window.location.replace('/portal/index.html');
      return null;
    }
    return session;
  }

  async function redirectIfSession(sb) {
    var sessionRes = await sb.auth.getSession();
    var session = sessionRes && sessionRes.data ? sessionRes.data.session : null;
    if (session && session.user) {
      window.location.replace('/portal/dashboard.html');
      return true;
    }
    return false;
  }

  function openModal(modal) {
    if (!modal) return;
    modal.hidden = false;
    var input = modal.querySelector('input');
    if (input) input.focus();
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.hidden = true;
  }

  function normalizeStatus(status) {
    return (status || '').toString().trim().toLowerCase();
  }

  function statusClass(status) {
    var normalized = normalizeStatus(status);
    if (normalized === 'confirmado') return 'status-confirmado';
    if (normalized === 'pendente') return 'status-pendente';
    return 'status-cancelado';
  }

  function formatDateBr(isoDate) {
    if (!isoDate) return '—';
    var date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('pt-BR');
  }

  function formatMoney(value) {
    var number = Number(value || 0);
    return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function createSimpleQrSvg(content) {
    var size = 21;
    var cell = 6;
    var svg = '<svg viewBox="0 0 ' + (size * cell) + ' ' + (size * cell) + '" xmlns="http://www.w3.org/2000/svg">';
    svg += '<rect width="100%" height="100%" fill="#ffffff"/>';

    for (var y = 0; y < size; y += 1) {
      for (var x = 0; x < size; x += 1) {
        var seed = content.charCodeAt((x * y + x + y) % content.length);
        var isFinder = (x < 6 && y < 6) || (x > 14 && y < 6) || (x < 6 && y > 14);
        var shouldDraw = isFinder || ((seed + x * 7 + y * 11) % 3 === 0);
        if (shouldDraw) {
          svg += '<rect x="' + (x * cell) + '" y="' + (y * cell) + '" width="' + cell + '" height="' + cell + '" fill="#111827"/>';
        }
      }
    }

    svg += '</svg>';
    return svg;
  }

  async function fetchRowsByUser(sb, table, columns, userId) {
    var candidateColumns = ['user_id', 'cliente_id', 'profile_id'];
    for (var i = 0; i < candidateColumns.length; i += 1) {
      var column = candidateColumns[i];
      var response = await sb.from(table).select(columns).eq(column, userId).order('created_at', { ascending: false });
      if (!response.error) {
        return response.data || [];
      }
      var message = (response.error && response.error.message) || '';
      if (message.toLowerCase().indexOf('column') === -1) {
        break;
      }
    }
    return [];
  }

  function setupAuthPage(sb) {
    setupTabs();

    var loginForm = document.getElementById('loginForm');
    var signupForm = document.getElementById('signupForm');
    var forgotBtn = document.getElementById('forgotPasswordBtn');
    var googleBtn = document.getElementById('googleLoginBtn');
    var resetModal = document.getElementById('resetModal');
    var resetClose = document.getElementById('resetModalClose');
    var resetRequestForm = document.getElementById('resetRequestForm');

    var signupEmail = document.getElementById('signupEmail');
    var signupName = document.getElementById('signupName');
    var signupWhatsapp = document.getElementById('signupWhatsapp');
    var signupPassword = document.getElementById('signupPassword');
    var signupConfirm = document.getElementById('signupConfirmPassword');
    var loginEmail = document.getElementById('loginEmail');

    if (signupPassword) {
      signupPassword.addEventListener('input', function () {
        applyPasswordStrengthUI('signupPassword', 'passwordStrengthBar', 'passwordStrengthText');
      });
      applyPasswordStrengthUI('signupPassword', 'passwordStrengthBar', 'passwordStrengthText');
    }

    if (signupEmail) {
      signupEmail.addEventListener('input', function () {
        var valid = isValidEmail(signupEmail.value);
        setFieldHelp('signupEmailHelp', valid || !signupEmail.value ? '' : 'Digite um e-mail válido.', !valid && !!signupEmail.value);
      });
    }

    if (loginEmail) {
      loginEmail.addEventListener('input', function () {
        var valid = isValidEmail(loginEmail.value);
        setFieldHelp('loginEmailHelp', valid || !loginEmail.value ? '' : 'E-mail inválido.', !valid && !!loginEmail.value);
      });
    }

    if (signupName) {
      signupName.addEventListener('input', function () {
        var valid = (signupName.value || '').trim().split(/\s+/).length >= 2;
        setFieldHelp('signupNameHelp', valid || !signupName.value ? '' : 'Informe nome e sobrenome.', !valid && !!signupName.value);
      });
    }

    if (signupWhatsapp) {
      signupWhatsapp.addEventListener('input', function () {
        signupWhatsapp.value = formatWhatsapp(signupWhatsapp.value);
        var digits = signupWhatsapp.value.replace(/\D/g, '');
        var valid = digits.length === 10 || digits.length === 11;
        setFieldHelp('signupWhatsappHelp', valid || !digits.length ? '' : 'WhatsApp deve ter DDD + número.', !valid && !!digits.length);
      });
    }

    if (signupConfirm && signupPassword) {
      signupConfirm.addEventListener('input', function () {
        var same = signupConfirm.value === signupPassword.value;
        setFieldHelp('signupConfirmHelp', same || !signupConfirm.value ? '' : 'As senhas precisam ser iguais.', !same && !!signupConfirm.value);
      });
    }

    if (forgotBtn && resetModal) {
      forgotBtn.addEventListener('click', function () {
        openModal(resetModal);
      });
    }

    if (resetClose && resetModal) {
      resetClose.addEventListener('click', function () {
        closeModal(resetModal);
      });
      resetModal.addEventListener('click', function (event) {
        if (event.target === resetModal) closeModal(resetModal);
      });
    }

    if (googleBtn) {
      googleBtn.addEventListener('click', async function () {
        withLoading(googleBtn, true);
        var response = await sb.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: getDashboardUrl()
          }
        });
        if (response.error) {
          showToast(mapAuthError(response.error), 'error');
          withLoading(googleBtn, false);
        }
      });
    }

    if (loginForm) {
      loginForm.addEventListener('submit', async function (event) {
        event.preventDefault();

        var email = (document.getElementById('loginEmail').value || '').trim();
        var password = document.getElementById('loginPassword').value || '';
        var loginBtn = document.getElementById('loginSubmitBtn');

        if (!isValidEmail(email)) {
          showToast('Digite um e-mail válido.', 'error');
          return;
        }

        if (password.length < 6) {
          showToast('Senha inválida.', 'error');
          return;
        }

        withLoading(loginBtn, true);
        var response = await sb.auth.signInWithPassword({ email: email, password: password });
        withLoading(loginBtn, false);

        if (response.error) {
          showToast(mapAuthError(response.error), 'error');
          return;
        }

        showToast('Login realizado com sucesso!');
        window.setTimeout(function () {
          window.location.href = '/portal/dashboard.html';
        }, 450);
      });
    }

    if (signupForm) {
      signupForm.addEventListener('submit', async function (event) {
        event.preventDefault();

        var name = (document.getElementById('signupName').value || '').trim();
        var email = (document.getElementById('signupEmail').value || '').trim();
        var whatsapp = (document.getElementById('signupWhatsapp').value || '').replace(/\D/g, '');
        var password = document.getElementById('signupPassword').value || '';
        var confirmPassword = document.getElementById('signupConfirmPassword').value || '';
        var acceptedTerms = document.getElementById('signupTerms').checked;
        var signupBtn = document.getElementById('signupSubmitBtn');

        if (name.split(/\s+/).length < 2) {
          showToast('Informe nome completo para cadastro.', 'error');
          return;
        }
        if (!isValidEmail(email)) {
          showToast('Digite um e-mail válido.', 'error');
          return;
        }
        if (whatsapp.length < 10) {
          showToast('Informe WhatsApp com DDD.', 'error');
          return;
        }
        if (passwordStrength(password) < 3) {
          showToast('Crie uma senha mais forte para segurança da conta.', 'error');
          return;
        }
        if (password !== confirmPassword) {
          showToast('As senhas não conferem.', 'error');
          return;
        }
        if (!acceptedTerms) {
          showToast('Você precisa aceitar os termos para continuar.', 'error');
          return;
        }

        withLoading(signupBtn, true);
        var signUpResponse = await sb.auth.signUp({
          email: email,
          password: password,
          options: {
            data: {
              full_name: name,
              whatsapp: whatsapp
            }
          }
        });
        withLoading(signupBtn, false);

        if (signUpResponse.error) {
          showToast(mapAuthError(signUpResponse.error), 'error');
          return;
        }

        showToast('Conta criada com sucesso! Verifique seu e-mail para confirmar.');
        window.setTimeout(function () {
          var loginTab = document.getElementById('tab-login');
          if (loginTab) loginTab.click();
        }, 450);
      });
    }

    if (resetRequestForm) {
      resetRequestForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        var email = (document.getElementById('resetEmail').value || '').trim();
        var btn = document.getElementById('resetRequestBtn');

        if (!isValidEmail(email)) {
          showToast('Digite um e-mail válido para recuperação.', 'error');
          return;
        }

        withLoading(btn, true);
        var response = await sb.auth.resetPasswordForEmail(email, {
          redirectTo: getResetUrl()
        });
        withLoading(btn, false);

        if (response.error) {
          showToast(mapAuthError(response.error), 'error');
          return;
        }

        showToast('Enviamos o link de redefinição para seu e-mail.');
        closeModal(resetModal);
      });
    }
  }

  function setupDrawer() {
    var hamburger = document.getElementById('portalHamburger');
    var sidebar = document.getElementById('portalSidebar');
    var overlay = document.getElementById('portalDrawerOverlay');

    if (!hamburger || !sidebar || !overlay) return;

    function openDrawer() {
      sidebar.classList.add('is-open');
      overlay.hidden = false;
      hamburger.setAttribute('aria-expanded', 'true');
    }

    function closeDrawer() {
      sidebar.classList.remove('is-open');
      overlay.hidden = true;
      hamburger.setAttribute('aria-expanded', 'false');
    }

    hamburger.addEventListener('click', function () {
      if (sidebar.classList.contains('is-open')) {
        closeDrawer();
      } else {
        openDrawer();
      }
    });

    overlay.addEventListener('click', closeDrawer);
    window.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeDrawer();
    });

    document.querySelectorAll('.portal-menu-item').forEach(function (item) {
      item.addEventListener('click', closeDrawer);
    });
  }

  function setupSections() {
    var menuItems = document.querySelectorAll('.portal-menu-item[data-section]');
    if (!menuItems.length) return;

    menuItems.forEach(function (item) {
      item.addEventListener('click', function () {
        var target = item.getAttribute('data-section');
        menuItems.forEach(function (btn) {
          btn.classList.remove('is-active');
        });
        item.classList.add('is-active');

        document.querySelectorAll('.portal-section').forEach(function (section) {
          section.hidden = true;
          section.classList.remove('is-active');
        });
        var selected = document.getElementById('section-' + target);
        if (selected) {
          selected.hidden = false;
          selected.classList.add('is-active');
          var heading = selected.querySelector('h1, h2');
          if (heading) {
            heading.setAttribute('tabindex', '-1');
            heading.focus();
          }
        }
      });
    });
  }

  function nextStayText(reservas) {
    var future = reservas.filter(function (item) {
      return new Date(item.check_in).getTime() >= Date.now();
    }).sort(function (a, b) {
      return new Date(a.check_in) - new Date(b.check_in);
    });

    if (!future.length) return 'Sem reservas ativas';
    var next = future[0];
    return (next.resort || 'Resort') + ' · ' + formatDateBr(next.check_in);
  }

  function getLevelByPoints(points) {
    if (points >= 3001) return 'Diamante';
    if (points >= 1501) return 'Ouro';
    if (points >= 501) return 'Prata';
    return 'Bronze';
  }

  function getLevelBadge(level) {
    if (level === 'Diamante') return '💎 Diamante';
    if (level === 'Ouro') return '🥇 Ouro';
    if (level === 'Prata') return '🥈 Prata';
    return '🥉 Bronze';
  }

  function getLevelBenefits(level) {
    if (level === 'Diamante') return 'Transfer VIP, upgrades prioritários e bônus de 15%.';
    if (level === 'Ouro') return 'Upgrade preferencial e check-out estendido quando disponível.';
    if (level === 'Prata') return 'Descontos sazonais e prioridade no atendimento.';
    return 'Acesso inicial ao programa de pontos e ofertas exclusivas.';
  }

  function prepareHistoryRecords(reservas) {
    var today = Date.now();
    return reservas.filter(function (item) {
      var status = normalizeStatus(item.status);
      var checkout = new Date(item.check_out).getTime();
      return status === 'concluido' || status === 'finalizado' || (!Number.isNaN(checkout) && checkout < today);
    });
  }

  function prepareActiveReservations(reservas) {
    return reservas.filter(function (item) {
      var status = normalizeStatus(item.status);
      return status !== 'cancelado' && status !== 'concluido' && status !== 'finalizado';
    });
  }

  function renderSummary(userName, reservas, fidelidade) {
    var totalReservas = document.getElementById('summaryTotalReservas');
    var proximaEstadia = document.getElementById('summaryProximaEstadia');
    var pontos = document.getElementById('summaryPontos');
    var nivel = document.getElementById('summaryNivel');
    var welcomeTitle = document.getElementById('welcomeTitle');

    var totalPoints = Number(fidelidade.pontos || 0);
    var level = (fidelidade.nivel || getLevelByPoints(totalPoints));

    if (welcomeTitle) welcomeTitle.textContent = 'Olá, ' + userName + '! Bem-vindo de volta 👋';
    if (totalReservas) totalReservas.textContent = String(reservas.length);
    if (proximaEstadia) proximaEstadia.textContent = nextStayText(reservas);
    if (pontos) pontos.textContent = totalPoints + ' pts';
    if (nivel) nivel.textContent = level;
  }

  function renderReservations(reservas) {
    var list = document.getElementById('activeReservationsList');
    var empty = document.getElementById('activeReservationsEmpty');
    if (!list || !empty) return;

    var active = prepareActiveReservations(reservas);
    list.innerHTML = '';

    if (!active.length) {
      empty.hidden = false;
      return;
    }

    empty.hidden = true;

    active.forEach(function (item) {
      var card = document.createElement('article');
      card.className = 'portal-reserva-card';
      card.innerHTML =
        '<div class="portal-row-between">' +
          '<h3>' + escapeHtml(item.resort || 'Resort') + '</h3>' +
          '<span class="portal-badge ' + statusClass(item.status) + '">' + escapeHtml(item.status || 'pendente') + '</span>' +
        '</div>' +
        '<p>' + formatDateBr(item.check_in) + ' até ' + formatDateBr(item.check_out) + '</p>' +
        '<p>Valor: ' + formatMoney(item.valor || 0) + '</p>' +
        '<div class="portal-inline-actions">' +
          '<button class="portal-btn portal-btn-secondary" data-action="details" data-reserva="' + item.id + '">Ver detalhes</button>' +
          '<button class="portal-btn portal-btn-secondary" data-action="cancel" data-reserva="' + item.id + '">Cancelar</button>' +
          '<a class="portal-btn portal-btn-secondary" target="_blank" rel="noopener" href="https://wa.me/5517982006382?text=' + encodeURIComponent('Olá, preciso de suporte para a reserva ' + item.id) + '">WhatsApp</a>' +
        '</div>';
      list.appendChild(card);
    });
  }

  function setupReservationActions(sb, userId, refreshData) {
    var list = document.getElementById('activeReservationsList');
    if (!list) return;

    list.addEventListener('click', async function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) return;

      var action = target.getAttribute('data-action');
      var reservaId = target.getAttribute('data-reserva');
      if (!action || !reservaId) return;

      if (action === 'details') {
        showToast('Detalhes da reserva #' + reservaId + ' enviados ao seu atendimento.');
        return;
      }

      if (action === 'cancel') {
        var confirmed = window.confirm('Deseja realmente solicitar o cancelamento desta reserva?');
        if (!confirmed) return;

        withLoading(target, true);
        var response = await sb.from('reservas').update({ status: 'cancelado' }).eq('id', reservaId).eq('user_id', userId);
        withLoading(target, false);

        if (response.error) {
          showToast('Não foi possível cancelar agora. Fale com o suporte no WhatsApp.', 'error');
          return;
        }

        showToast('Reserva cancelada com sucesso.');
        refreshData();
      }
    });
  }

  function createStars(selectedValue) {
    var starsHtml = '';
    for (var i = 1; i <= 5; i += 1) {
      starsHtml += '<button type="button" class="portal-star-btn ' + (selectedValue >= i ? 'is-active' : '') + '" data-star="' + i + '" aria-label="' + i + ' estrelas">★</button>';
    }
    return starsHtml;
  }

  function renderHistory(historyItems) {
    var list = document.getElementById('historyList');
    var empty = document.getElementById('historyEmpty');
    if (!list || !empty) return;

    list.innerHTML = '';

    if (!historyItems.length) {
      empty.hidden = false;
      return;
    }

    empty.hidden = true;

    historyItems.forEach(function (item) {
      var card = document.createElement('article');
      card.className = 'portal-history-card';
      card.innerHTML =
        '<h3>' + escapeHtml(item.resort || 'Resort') + '</h3>' +
        '<p>' + formatDateBr(item.check_in) + ' até ' + formatDateBr(item.check_out) + '</p>' +
        '<div class="portal-stars" data-rating-for="' + item.id + '">' + createStars(0) + '</div>' +
        '<textarea class="portal-rating-comment" id="comment-' + item.id + '" placeholder="Conte como foi sua experiência"></textarea>' +
        '<button class="portal-btn portal-btn-secondary" data-submit-rating="' + item.id + '">Enviar avaliação</button>';
      list.appendChild(card);
    });
  }

  function setupHistoryActions(sb, userId) {
    var list = document.getElementById('historyList');
    if (!list) return;

    var ratings = {};

    list.addEventListener('click', async function (event) {
      var target = event.target;
      if (!(target instanceof HTMLElement)) return;

      var starValue = target.getAttribute('data-star');
      if (starValue) {
        var starContainer = target.closest('.portal-stars');
        if (!starContainer) return;
        var reservaId = starContainer.getAttribute('data-rating-for');
        if (!reservaId) return;

        ratings[reservaId] = Number(starValue);
        starContainer.querySelectorAll('.portal-star-btn').forEach(function (starBtn) {
          var value = Number(starBtn.getAttribute('data-star') || 0);
          starBtn.classList.toggle('is-active', value <= ratings[reservaId]);
        });
        return;
      }

      var submitReservaId = target.getAttribute('data-submit-rating');
      if (!submitReservaId) return;

      var rating = ratings[submitReservaId] || 0;
      var commentField = document.getElementById('comment-' + submitReservaId);
      var comment = commentField ? commentField.value.trim() : '';

      if (!rating) {
        showToast('Escolha de 1 a 5 estrelas para enviar sua avaliação.', 'error');
        return;
      }

      withLoading(target, true);
      var response = await sb.from('avaliacoes').insert({
        reserva_id: submitReservaId,
        user_id: userId,
        nota: rating,
        comentario: comment || null
      });
      withLoading(target, false);

      if (response.error) {
        showToast('Não foi possível enviar a avaliação agora.', 'error');
        return;
      }

      showToast('Avaliação enviada com sucesso. Obrigado!');
      if (commentField) commentField.value = '';
    });
  }

  function renderFidelity(fidelidade) {
    var points = Number(fidelidade.pontos || 0);
    var level = fidelidade.nivel || getLevelByPoints(points);

    var progressBar = document.getElementById('fidelityProgress');
    var currentLevel = document.getElementById('fidelityCurrentLevel');
    var benefits = document.getElementById('fidelityBenefits');
    var pointsText = document.getElementById('fidelityPoints');
    var historyList = document.getElementById('fidelityHistory');

    if (progressBar) progressBar.style.width = Math.min(100, (points / 4000) * 100) + '%';
    if (currentLevel) currentLevel.textContent = getLevelBadge(level);
    if (benefits) benefits.textContent = getLevelBenefits(level);
    if (pointsText) pointsText.textContent = points + ' pontos acumulados';

    if (!historyList) return;
    historyList.innerHTML = '';

    var history = Array.isArray(fidelidade.historico) ? fidelidade.historico : [];
    if (!history.length) {
      var li = document.createElement('li');
      li.textContent = 'Sem movimentações recentes de pontos.';
      historyList.appendChild(li);
      return;
    }

    history.slice(0, 8).forEach(function (item) {
      var li = document.createElement('li');
      var label = item.descricao || 'Movimentação';
      var pointsChange = Number(item.pontos || 0);
      li.textContent = label + ' · ' + (pointsChange >= 0 ? '+' : '') + pointsChange + ' pts';
      historyList.appendChild(li);
    });
  }

  function renderVouchers(vouchers) {
    var grid = document.getElementById('voucherGrid');
    var empty = document.getElementById('voucherEmpty');
    if (!grid || !empty) return;

    grid.innerHTML = '';
    if (!vouchers.length) {
      empty.hidden = false;
      return;
    }

    empty.hidden = true;

    vouchers.forEach(function (voucher) {
      var code = voucher.codigo || 'SEM-CODIGO';
      var svg = createSimpleQrSvg(code);
      var card = document.createElement('article');
      card.className = 'portal-voucher-card';
      card.innerHTML =
        '<h3>' + escapeHtml(voucher.resort || 'Resort parceiro') + '</h3>' +
        '<p><strong>Código:</strong> ' + escapeHtml(code) + '</p>' +
        '<p><strong>Validade:</strong> ' + formatDateBr(voucher.validade) + '</p>' +
        '<div class="portal-qr" aria-hidden="true">' + svg + '</div>' +
        '<button class="portal-btn portal-btn-secondary" data-print-voucher="' + encodeURIComponent(JSON.stringify({
          resort: voucher.resort || 'Resort parceiro',
          codigo: code,
          validade: formatDateBr(voucher.validade)
        })) + '">Baixar voucher</button>';
      grid.appendChild(card);
    });

    grid.querySelectorAll('[data-print-voucher]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var raw = btn.getAttribute('data-print-voucher');
        if (!raw) return;

        var data = JSON.parse(decodeURIComponent(raw));
        var printWindow = window.open('', '_blank', 'width=700,height=760');
        if (!printWindow) {
          showToast('Permita pop-ups para imprimir seu voucher.', 'error');
          return;
        }

        var html =
          '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Voucher</title>' +
          '<style>body{font-family:Poppins,sans-serif;padding:20px;} .card{border:1px solid #d4af37;border-radius:12px;padding:18px;} h1{margin-top:0;} </style>' +
          '</head><body><div class="card"><h1>Voucher HOSPEDAH</h1>' +
          '<p><strong>Resort:</strong> ' + escapeHtml(data.resort) + '</p>' +
          '<p><strong>Código:</strong> ' + escapeHtml(data.codigo) + '</p>' +
          '<p><strong>Validade:</strong> ' + escapeHtml(data.validade) + '</p>' +
          '<p>Apresente este voucher no check-in.</p></div></body></html>';

        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
      });
    });
  }

  function setupFidelityModal() {
    var openBtn = document.getElementById('fidelityHowBtn');
    var modal = document.getElementById('pointsInfoModal');
    var closeBtn = document.getElementById('pointsInfoClose');

    if (!openBtn || !modal || !closeBtn) return;

    openBtn.addEventListener('click', function () {
      openModal(modal);
    });
    closeBtn.addEventListener('click', function () {
      closeModal(modal);
    });

    modal.addEventListener('click', function (event) {
      if (event.target === modal) closeModal(modal);
    });
  }

  async function saveProfile(sb, user, payload) {
    var userRes = await sb.auth.updateUser({
      data: {
        full_name: payload.full_name,
        whatsapp: payload.whatsapp,
        birth_date: payload.birth_date,
        notify_email: payload.notify_email,
        notify_whatsapp: payload.notify_whatsapp
      }
    });

    if (userRes.error) return userRes.error;

    var profileResponse = await sb.from('profiles').upsert({
      id: user.id,
      full_name: payload.full_name,
      whatsapp: payload.whatsapp,
      birth_date: payload.birth_date,
      notify_email: payload.notify_email,
      notify_whatsapp: payload.notify_whatsapp
    });

    return profileResponse.error || null;
  }

  function setupConfigForms(sb, user, refreshData) {
    var profileForm = document.getElementById('profileForm');
    var passwordForm = document.getElementById('passwordForm');
    var deleteBtn = document.getElementById('deleteAccountBtn');

    if (profileForm) {
      profileForm.addEventListener('submit', async function (event) {
        event.preventDefault();

        var name = (document.getElementById('profileName').value || '').trim();
        var whatsapp = (document.getElementById('profileWhatsapp').value || '').replace(/\D/g, '');
        var birthDate = document.getElementById('profileBirthDate').value || null;
        var notifyEmail = document.getElementById('prefEmail').checked;
        var notifyWhatsapp = document.getElementById('prefWhatsapp').checked;
        var saveBtn = document.getElementById('saveProfileBtn');

        if (name.length < 3) {
          showToast('Informe um nome válido para salvar.', 'error');
          return;
        }

        withLoading(saveBtn, true);
        var error = await saveProfile(sb, user, {
          full_name: name,
          whatsapp: whatsapp,
          birth_date: birthDate,
          notify_email: notifyEmail,
          notify_whatsapp: notifyWhatsapp
        });
        withLoading(saveBtn, false);

        if (error) {
          showToast('Não foi possível salvar o perfil agora.', 'error');
          return;
        }

        showToast('Perfil atualizado com sucesso.');
        refreshData();
      });
    }

    if (passwordForm) {
      passwordForm.addEventListener('submit', async function (event) {
        event.preventDefault();

        var newPassword = document.getElementById('newPassword').value || '';
        var confirmNewPassword = document.getElementById('confirmNewPassword').value || '';
        var btn = document.getElementById('savePasswordBtn');

        if (passwordStrength(newPassword) < 3) {
          showToast('Use uma senha mais forte para atualizar.', 'error');
          return;
        }

        if (newPassword !== confirmNewPassword) {
          showToast('A confirmação da senha não corresponde.', 'error');
          return;
        }

        withLoading(btn, true);
        var response = await sb.auth.updateUser({ password: newPassword });
        withLoading(btn, false);

        if (response.error) {
          showToast(mapAuthError(response.error), 'error');
          return;
        }

        passwordForm.reset();
        showToast('Senha alterada com sucesso.');
      });
    }

    if (deleteBtn) {
      deleteBtn.addEventListener('click', async function () {
        var confirmed = window.confirm('Tem certeza que deseja excluir sua conta? Esta ação é irreversível.');
        if (!confirmed) return;

        withLoading(deleteBtn, true);

        var request = await sb.from('account_deletion_requests').insert({
          user_id: user.id,
          requested_at: new Date().toISOString()
        });

        withLoading(deleteBtn, false);

        if (request.error) {
          showToast('Solicitação registrada parcialmente. Contate o suporte via WhatsApp para concluir.', 'error');
        } else {
          showToast('Solicitação de exclusão registrada. Nossa equipe entrará em contato.');
        }
      });
    }
  }

  async function fillProfileForm(sb, user) {
    var profileData = null;
    var profileResponse = await sb.from('profiles').select('full_name,whatsapp,birth_date,notify_email,notify_whatsapp').eq('id', user.id).maybeSingle();
    if (!profileResponse.error) profileData = profileResponse.data;

    var meta = user.user_metadata || {};
    var fullName = (profileData && profileData.full_name) || meta.full_name || user.email || 'Hóspede';
    var whatsapp = (profileData && profileData.whatsapp) || meta.whatsapp || '';
    var birthDate = (profileData && profileData.birth_date) || meta.birth_date || '';
    var notifyEmail = profileData && typeof profileData.notify_email === 'boolean' ? profileData.notify_email : true;
    var notifyWhatsapp = profileData && typeof profileData.notify_whatsapp === 'boolean' ? profileData.notify_whatsapp : true;

    var profileName = document.getElementById('profileName');
    var profileWhatsapp = document.getElementById('profileWhatsapp');
    var profileBirthDate = document.getElementById('profileBirthDate');
    var prefEmail = document.getElementById('prefEmail');
    var prefWhatsapp = document.getElementById('prefWhatsapp');

    if (profileName) profileName.value = fullName;
    if (profileWhatsapp) profileWhatsapp.value = formatWhatsapp(whatsapp);
    if (profileBirthDate) profileBirthDate.value = birthDate || '';
    if (prefEmail) prefEmail.checked = notifyEmail;
    if (prefWhatsapp) prefWhatsapp.checked = notifyWhatsapp;

    return {
      fullName: fullName,
      whatsapp: whatsapp,
      profileData: profileData
    };
  }

  function applyUserIdentity(user, fullName) {
    var userNameEl = document.getElementById('userName');
    var userEmailEl = document.getElementById('userEmail');
    var avatarEl = document.getElementById('userAvatar');

    if (userNameEl) userNameEl.textContent = fullName;
    if (userEmailEl) userEmailEl.textContent = user.email || '';
    if (avatarEl) avatarEl.textContent = (fullName || 'H').trim().charAt(0).toUpperCase();
  }

  async function loadDashboardData(sb, user, fullName, profileData) {
    var reservas = await fetchRowsByUser(sb, 'reservas', 'id,resort,check_in,check_out,status,valor,created_at', user.id);
    var vouchers = await fetchRowsByUser(sb, 'vouchers', 'id,codigo,resort,validade,usado,created_at', user.id);

    var fidelidade = {
      pontos: 0,
      nivel: 'Bronze',
      historico: []
    };

    var fidelidadeRows = await fetchRowsByUser(sb, 'fidelidade', 'pontos,nivel,historico,created_at', user.id);
    if (fidelidadeRows.length) {
      fidelidade = fidelidadeRows[0];
    }

    var pointsFromMeta = user.user_metadata && user.user_metadata.pontos ? Number(user.user_metadata.pontos) : 0;
    var pointsFromProfile = profileData && profileData.pontos ? Number(profileData.pontos) : 0;
    if (!Number(fidelidade.pontos)) {
      fidelidade.pontos = pointsFromMeta || pointsFromProfile || 0;
    }
    if (!fidelidade.nivel) {
      fidelidade.nivel = getLevelByPoints(Number(fidelidade.pontos));
    }

    renderSummary(fullName, reservas, fidelidade);
    renderReservations(reservas);
    renderHistory(prepareHistoryRecords(reservas));
    renderFidelity(fidelidade);
    renderVouchers(vouchers);

    return {
      reservas: reservas
    };
  }

  async function setupDashboardPage(sb) {
    setupDrawer();
    setupSections();
    setupFidelityModal();

    var session = await requireSession(sb);
    if (!session) return;
    var user = session.user;

    var identity = await fillProfileForm(sb, user);
    applyUserIdentity(user, identity.fullName);

    var currentData = await loadDashboardData(sb, user, identity.fullName, identity.profileData);

    async function refreshData() {
      currentData = await loadDashboardData(sb, user, identity.fullName, identity.profileData);
      return currentData;
    }

    setupReservationActions(sb, user.id, refreshData);
    setupHistoryActions(sb, user.id);
    setupConfigForms(sb, user, refreshData);

    var logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async function () {
        withLoading(logoutBtn, true);
        await sb.auth.signOut();
        window.location.replace('/portal/index.html');
      });
    }
  }

  function setupResetPage(sb) {
    var form = document.getElementById('resetPasswordForm');
    if (!form) return;

    form.addEventListener('submit', async function (event) {
      event.preventDefault();

      var newPassword = document.getElementById('resetNewPassword').value || '';
      var confirmPassword = document.getElementById('resetConfirmPassword').value || '';
      var button = document.getElementById('resetPasswordBtn');

      if (passwordStrength(newPassword) < 3) {
        showToast('Use uma senha mais forte para concluir.', 'error');
        return;
      }

      if (newPassword !== confirmPassword) {
        showToast('As senhas não conferem.', 'error');
        return;
      }

      withLoading(button, true);
      var response = await sb.auth.updateUser({ password: newPassword });
      withLoading(button, false);

      if (response.error) {
        showToast(mapAuthError(response.error), 'error');
        return;
      }

      showToast('Senha atualizada com sucesso! Redirecionando...');
      window.setTimeout(function () {
        window.location.replace('/portal/index.html');
      }, 1200);
    });
  }

  async function init() {
    setupPasswordToggles();

    var sb = getSupabaseClient();
    if (!sb) return;

    if (IS_LOGIN) {
      var hasSession = await redirectIfSession(sb);
      if (!hasSession) setupAuthPage(sb);
      return;
    }

    if (IS_DASHBOARD) {
      await setupDashboardPage(sb);
      return;
    }

    if (IS_RESET) {
      setupResetPage(sb);
    }
  }

  init();
})();
