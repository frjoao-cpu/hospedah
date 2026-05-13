'use strict';

(function () {
  function byId(id) {
    return document.getElementById(id);
  }

  function formatDate(value) {
    if (!value) return '—';
    var parsed = new Date(value + 'T00:00:00');
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleDateString('pt-BR');
  }

  function formatMoney(value) {
    return 'R$ ' + Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeStatus(status) {
    var map = {
      pendente: 'portal-badge-pendente',
      confirmada: 'portal-badge-confirmada',
      cancelada: 'portal-badge-cancelada'
    };
    return map[status] || 'portal-badge-pendente';
  }

  function setFeedback(el, text, type) {
    if (!el) return;
    el.textContent = text || '';
    el.classList.remove('is-error', 'is-success');
    if (type === 'error') el.classList.add('is-error');
    if (type === 'success') el.classList.add('is-success');
  }

  function validEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));
  }

  function passwordStrength(password) {
    var score = 0;
    if ((password || '').length >= 8) score += 1;
    if (/[A-Z]/.test(password || '')) score += 1;
    if (/[a-z]/.test(password || '')) score += 1;
    if (/\d/.test(password || '')) score += 1;
    if (/[^A-Za-z0-9]/.test(password || '')) score += 1;
    return score;
  }

  function createClient() {
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error('Supabase SDK não carregado.');
    }
    if (!window.HOSPEDAH_SB_URL || !window.HOSPEDAH_SB_ANON) {
      throw new Error('Configuração do Supabase ausente.');
    }
    return window.supabase.createClient(window.HOSPEDAH_SB_URL, window.HOSPEDAH_SB_ANON);
  }

  function parseSearchNext() {
    var params = new URLSearchParams(window.location.search || '');
    var next = params.get('next');
    if (!next || next.startsWith('http://') || next.startsWith('https://')) return '/portal/dashboard.html';
    if (next.startsWith('/')) return next;
    return '/' + next;
  }

  function getLevelProgress(level, points) {
    var numeric = Number(points || 0);
    if (level === 'diamante') return 100;
    if (level === 'ouro') return Math.min(100, 75 + (numeric % 300) / 12);
    if (level === 'prata') return Math.min(74, 40 + (numeric % 200) / 5);
    return Math.min(39, numeric / 3);
  }

  function generateSimpleQrSvg(content) {
    var text = String(content || 'HOSPEDAH-VOUCHER');
    var hash = 0;
    var i = 0;
    for (i = 0; i < text.length; i += 1) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
    }
    var size = 21;
    var cell = 6;
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (size * cell) + ' ' + (size * cell) + '" role="img" aria-label="QR Code do voucher">';
    svg += '<rect width="100%" height="100%" fill="#fff"/>';

    for (var y = 0; y < size; y += 1) {
      for (var x = 0; x < size; x += 1) {
        var bit = ((hash >> ((x + y) % 31)) & 1) ^ ((x * y) % 3 === 0 ? 1 : 0);
        if (x < 7 && y < 7) bit = (x === 0 || y === 0 || x === 6 || y === 6 || (x > 1 && y > 1 && x < 5 && y < 5)) ? 1 : 0;
        if (x > size - 8 && y < 7) bit = (x === size - 1 || y === 0 || x === size - 7 || y === 6 || (x > size - 6 && y > 1 && x < size - 2 && y < 5)) ? 1 : 0;
        if (x < 7 && y > size - 8) bit = (x === 0 || y === size - 1 || x === 6 || y === size - 7 || (x > 1 && y > size - 6 && x < 5 && y < size - 2)) ? 1 : 0;
        if (bit) {
          svg += '<rect x="' + (x * cell) + '" y="' + (y * cell) + '" width="' + cell + '" height="' + cell + '" fill="#0B1C3D"/>';
        }
      }
    }

    svg += '</svg>';
    return svg;
  }

  async function setupAuthPage(client) {
    var tabButtons = document.querySelectorAll('.portal-tab');
    var tabPanels = document.querySelectorAll('.portal-tab-panel');

    function activateTab(id) {
      tabButtons.forEach(function (btn) {
        var active = btn.id === id;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
      });

      tabPanels.forEach(function (panel) {
        var open = panel.getAttribute('aria-labelledby') === id;
        panel.classList.toggle('is-active', open);
        panel.hidden = !open;
      });
    }

    tabButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        activateTab(btn.id);
      });
    });

    var signupEmail = byId('signupEmail');
    var emailHint = byId('signupEmailHint');
    if (signupEmail && emailHint) {
      signupEmail.addEventListener('input', function () {
        var ok = validEmail(signupEmail.value);
        emailHint.textContent = signupEmail.value ? (ok ? 'E-mail válido.' : 'E-mail inválido.') : '';
        emailHint.style.color = ok ? '#86efac' : '#fecaca';
      });
    }

    var passwordField = byId('signupPassword');
    var bar = byId('passwordStrengthBar');
    var strengthText = byId('passwordStrengthText');
    if (passwordField && bar && strengthText) {
      passwordField.addEventListener('input', function () {
        var score = passwordStrength(passwordField.value);
        var widths = ['10%', '28%', '46%', '70%', '100%'];
        var colors = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#25D366'];
        bar.style.width = widths[Math.max(0, score - 1)] || '10%';
        bar.style.backgroundColor = colors[Math.max(0, score - 1)] || '#ef4444';
        strengthText.textContent = score >= 4 ? 'Senha forte.' : 'Fortaleça sua senha com letras, números e símbolo.';
      });
    }

    var loginForm = byId('loginForm');
    var loginButton = byId('loginButton');
    var loginFeedback = byId('loginFeedback');
    if (loginForm && loginButton && loginFeedback) {
      loginForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        setFeedback(loginFeedback, '', null);

        var email = byId('loginEmail').value.trim();
        var password = byId('loginPassword').value;

        if (!validEmail(email) || !password) {
          setFeedback(loginFeedback, 'Informe e-mail e senha válidos.', 'error');
          return;
        }

        loginButton.classList.add('is-loading');
        loginButton.disabled = true;

        try {
          var signIn = await client.auth.signInWithPassword({ email: email, password: password });
          if (signIn.error) throw signIn.error;
          window.location.href = parseSearchNext();
        } catch (error) {
          setFeedback(loginFeedback, 'Não foi possível entrar: ' + (error.message || 'erro inesperado.'), 'error');
        } finally {
          loginButton.classList.remove('is-loading');
          loginButton.disabled = false;
        }
      });
    }

    var googleLoginButton = byId('googleLoginButton');
    if (googleLoginButton) {
      googleLoginButton.addEventListener('click', async function () {
        setFeedback(loginFeedback, '', null);
        var response = await client.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin + '/portal/dashboard.html'
          }
        });
        if (response.error) {
          setFeedback(loginFeedback, 'Falha no login Google: ' + response.error.message, 'error');
        }
      });
    }

    var forgotPasswordButton = byId('forgotPasswordButton');
    if (forgotPasswordButton) {
      forgotPasswordButton.addEventListener('click', async function () {
        var email = byId('loginEmail').value.trim();
        if (!validEmail(email)) {
          setFeedback(loginFeedback, 'Informe seu e-mail para recuperar a senha.', 'error');
          return;
        }
        var reset = await client.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + '/portal/reset-password.html'
        });
        if (reset.error) {
          setFeedback(loginFeedback, 'Falha no envio: ' + reset.error.message, 'error');
          return;
        }
        setFeedback(loginFeedback, 'E-mail de recuperação enviado.', 'success');
      });
    }

    var signupForm = byId('signupForm');
    var signupFeedback = byId('signupFeedback');
    if (signupForm && signupFeedback) {
      signupForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        setFeedback(signupFeedback, '', null);

        var name = byId('signupName').value.trim();
        var email = byId('signupEmail').value.trim();
        var whatsapp = byId('signupWhatsapp').value.trim();
        var password = byId('signupPassword').value;
        var passwordConfirm = byId('signupPasswordConfirm').value;
        var acceptedTerms = !!byId('signupTerms').checked;

        if (!name || !validEmail(email) || !whatsapp || !acceptedTerms) {
          setFeedback(signupFeedback, 'Preencha todos os campos e aceite os termos.', 'error');
          return;
        }

        if (password !== passwordConfirm) {
          setFeedback(signupFeedback, 'As senhas não conferem.', 'error');
          return;
        }

        if (passwordStrength(password) < 4) {
          setFeedback(signupFeedback, 'Escolha uma senha mais forte.', 'error');
          return;
        }

        var signUp = await client.auth.signUp({
          email: email,
          password: password,
          options: {
            emailRedirectTo: window.location.origin + '/portal/dashboard.html',
            data: {
              full_name: name,
              whatsapp: whatsapp
            }
          }
        });

        if (signUp.error) {
          setFeedback(signupFeedback, 'Erro ao criar conta: ' + signUp.error.message, 'error');
          return;
        }

        setFeedback(signupFeedback, 'Conta criada! Verifique seu e-mail para confirmar acesso.', 'success');
        signupForm.reset();
      });
    }

    var current = await client.auth.getSession();
    if (current && current.data && current.data.session) {
      window.location.replace('/portal/dashboard.html');
    }
  }

  async function setupResetPage(client) {
    var feedback = byId('resetFeedback');
    var form = byId('resetPasswordForm');
    if (!feedback || !form) return;

    var hash = window.location.hash || '';
    var looksRecovery = hash.indexOf('type=recovery') !== -1 || hash.indexOf('access_token=') !== -1;
    if (!looksRecovery) {
      setFeedback(feedback, 'Use o link enviado no e-mail para redefinir a senha.', 'error');
    }

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      setFeedback(feedback, '', null);

      var password = byId('resetNewPassword').value;
      var confirm = byId('resetConfirmPassword').value;

      if (password.length < 8) {
        setFeedback(feedback, 'Use ao menos 8 caracteres.', 'error');
        return;
      }

      if (password !== confirm) {
        setFeedback(feedback, 'As senhas não conferem.', 'error');
        return;
      }

      var update = await client.auth.updateUser({ password: password });
      if (update.error) {
        setFeedback(feedback, 'Erro ao redefinir senha: ' + update.error.message, 'error');
        return;
      }

      setFeedback(feedback, 'Senha atualizada com sucesso. Redirecionando para login...', 'success');
      setTimeout(function () {
        window.location.replace('/portal/');
      }, 1400);
    });
  }

  async function fetchUserProfile(client, user) {
    var fallbackName = (user.user_metadata && user.user_metadata.full_name) || user.email.split('@')[0];
    var fallbackWhatsapp = (user.user_metadata && user.user_metadata.whatsapp) || '';

    var profile = {
      id: user.id,
      nome_completo: fallbackName,
      whatsapp: fallbackWhatsapp
    };

    try {
      var existing = await client.from('profiles').select('id,nome_completo,whatsapp').eq('id', user.id).maybeSingle();
      if (existing && existing.data) {
        profile = Object.assign(profile, existing.data);
      } else {
        await client.from('profiles').upsert([{ id: user.id, nome_completo: fallbackName, whatsapp: fallbackWhatsapp }]);
      }
    } catch (_) {
      // fallback local only
    }

    return profile;
  }

  function buildVoucherCode(reserva) {
    var idPart = (reserva.id || '').toString().replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase();
    return 'HSP-' + idPart.padEnd(6, 'X');
  }

  async function loadDashboardData(client, user, profile) {
    var guestName = byId('guestName');
    var summaryReservas = byId('summaryReservas');
    var summaryProximaEstadia = byId('summaryProximaEstadia');
    var summaryPontos = byId('summaryPontos');
    var summaryNivel = byId('summaryNivel');
    var reservasList = byId('reservasList');
    var historicoBody = byId('historicoBody');
    var fidelidadeResumo = byId('fidelidadeResumo');
    var fidelidadeProgress = byId('fidelidadeProgress');
    var vouchersGrid = byId('vouchersGrid');

    if (guestName) guestName.textContent = profile.nome_completo || user.email;

    var reservas = [];
    try {
      var reservasRes = await client.from('reservas_hospede')
        .select('*')
        .eq('email_hospede', user.email)
        .order('data_entrada', { ascending: true })
        .limit(100);
      if (reservasRes && reservasRes.data) reservas = reservasRes.data;
    } catch (_) {
      reservas = [];
    }

    var activeReservas = reservas.filter(function (row) {
      return row.status !== 'cancelada';
    });

    if (summaryReservas) summaryReservas.textContent = String(activeReservas.length);

    var proxima = activeReservas.find(function (row) {
      return row.data_entrada;
    });
    if (summaryProximaEstadia) summaryProximaEstadia.textContent = proxima ? formatDate(proxima.data_entrada) : 'Sem agenda';

    if (reservasList) {
      reservasList.innerHTML = activeReservas.length ? activeReservas.map(function (reserva) {
        var detailsPayload = encodeURIComponent([
          'Reserva: ' + (reserva.resort_nome || 'HOSPEDAH'),
          'Check-in: ' + formatDate(reserva.data_entrada),
          'Check-out: ' + formatDate(reserva.data_saida),
          'Valor: ' + formatMoney(reserva.valor_total)
        ].join('\n'));

        var phone = (reserva.telefone || '').replace(/\D/g, '');
        var whatsappLink = phone ? 'https://wa.me/55' + phone : 'https://wa.me/5517982006382';

        return '<article class="portal-reserva-card">'
          + '<h3>' + escapeHtml(reserva.resort_nome || 'Reserva HOSPEDAH') + '</h3>'
          + '<p>Check-in: ' + formatDate(reserva.data_entrada) + ' · Check-out: ' + formatDate(reserva.data_saida) + '</p>'
          + '<p>Valor estimado: <strong>' + formatMoney(reserva.valor_total) + '</strong></p>'
          + '<span class="portal-badge ' + normalizeStatus(reserva.status || 'pendente') + '">' + escapeHtml(reserva.status || 'pendente') + '</span>'
          + '<div class="portal-reserva-actions">'
          + '<a href="' + whatsappLink + '" target="_blank" rel="noopener">WhatsApp</a>'
          + '<a href="https://wa.me/5517982006382?text=' + detailsPayload + '" target="_blank" rel="noopener">Detalhes</a>'
          + '<button type="button" data-cancel-reserva="' + escapeHtml(reserva.id) + '">Cancelar</button>'
          + '</div>'
          + '</article>';
      }).join('') : '<p>Nenhuma reserva ativa encontrada.</p>';
    }

    if (historicoBody) {
      historicoBody.innerHTML = reservas.length ? reservas.map(function (row) {
        return '<tr>'
          + '<td>' + escapeHtml(row.resort_nome || '—') + '</td>'
          + '<td>' + formatDate(row.data_entrada) + '</td>'
          + '<td>' + formatDate(row.data_saida) + '</td>'
          + '<td><span class="portal-badge ' + normalizeStatus(row.status || 'pendente') + '">' + escapeHtml(row.status || 'pendente') + '</span></td>'
          + '<td>' + formatMoney(row.valor_total) + '</td>'
          + '</tr>';
      }).join('') : '<tr><td colspan="5">Sem histórico disponível.</td></tr>';
    }

    var fidelidade = null;
    try {
      var fidelidadeRes = await client.from('fidelidade').select('*').eq('email_hospede', user.email).maybeSingle();
      fidelidade = fidelidadeRes && fidelidadeRes.data ? fidelidadeRes.data : null;
      if (!fidelidade) {
        var inserted = await client.from('fidelidade').insert([{ email_hospede: user.email, pontos: 0, nivel: 'bronze', total_estadias: 0 }]).select('*').maybeSingle();
        fidelidade = inserted && inserted.data ? inserted.data : { pontos: 0, nivel: 'bronze', total_estadias: 0 };
      }
    } catch (_) {
      fidelidade = { pontos: 0, nivel: 'bronze', total_estadias: 0 };
    }

    if (summaryPontos) summaryPontos.textContent = String(fidelidade.pontos || 0);
    if (summaryNivel) summaryNivel.textContent = String(fidelidade.nivel || 'bronze').replace(/^./, function (s) { return s.toUpperCase(); });
    if (fidelidadeResumo) {
      fidelidadeResumo.textContent = 'Você possui ' + (fidelidade.pontos || 0) + ' pontos e ' + (fidelidade.total_estadias || 0) + ' estadias registradas.';
    }
    if (fidelidadeProgress) {
      fidelidadeProgress.style.width = getLevelProgress(fidelidade.nivel || 'bronze', fidelidade.pontos || 0) + '%';
    }

    if (vouchersGrid) {
      var voucherRows = [];
      try {
        var vouchersRes = await client.from('vouchers').select('*').eq('email_hospede', user.email).order('criado_em', { ascending: false }).limit(24);
        voucherRows = vouchersRes && vouchersRes.data ? vouchersRes.data : [];
      } catch (_) {
        voucherRows = [];
      }

      if (!voucherRows.length) {
        voucherRows = activeReservas.slice(0, 8).map(function (reserva) {
          return {
            id: null,
            reserva_id: reserva.id,
            resort_nome: reserva.resort_nome,
            codigo: buildVoucherCode(reserva),
            status: reserva.status || 'pendente',
            criado_em: reserva.criado_em || new Date().toISOString()
          };
        });
      }

      vouchersGrid.innerHTML = voucherRows.length ? voucherRows.map(function (voucher) {
        var payload = 'HOSPEDAH|' + (voucher.codigo || '') + '|' + (voucher.reserva_id || '');
        var voucherId = voucher.id ? String(voucher.id) : '';
        return '<article class="portal-voucher-card">'
          + '<h3>' + escapeHtml(voucher.resort_nome || 'Voucher HOSPEDAH') + '</h3>'
          + '<p class="portal-voucher-code">' + escapeHtml(voucher.codigo || 'HSP-XXXXXX') + '</p>'
          + '<span class="portal-badge ' + normalizeStatus(voucher.status || 'confirmada') + '">' + escapeHtml(voucher.status || 'confirmada') + '</span>'
          + '<div>' + generateSimpleQrSvg(payload) + '</div>'
          + (voucherId ? '<div class="portal-reserva-actions"><button type="button" data-use-voucher="' + escapeHtml(voucherId) + '">Marcar como usado</button><button type="button" data-delete-voucher="' + escapeHtml(voucherId) + '">Excluir</button></div>' : '')
          + '</article>';
      }).join('') : '<p>Sem vouchers disponíveis.</p>';

      vouchersGrid.querySelectorAll('[data-use-voucher]').forEach(function (button) {
        button.addEventListener('click', async function () {
          var voucherId = button.getAttribute('data-use-voucher');
          if (!voucherId) return;
          try {
            await client.from('vouchers').update({ status: 'usado', atualizado_em: new Date().toISOString() }).eq('id', voucherId).eq('email_hospede', user.email);
            await loadDashboardData(client, user, profile);
          } catch (_) {
            // ignore update errors from missing table/permission
          }
        });
      });

      vouchersGrid.querySelectorAll('[data-delete-voucher]').forEach(function (button) {
        button.addEventListener('click', async function () {
          var voucherId = button.getAttribute('data-delete-voucher');
          if (!voucherId) return;
          try {
            await client.from('vouchers').delete().eq('id', voucherId).eq('email_hospede', user.email);
            await loadDashboardData(client, user, profile);
          } catch (_) {
            // ignore delete errors from missing table/permission
          }
        });
      });
    }

    if (reservasList) {
      reservasList.querySelectorAll('[data-cancel-reserva]').forEach(function (button) {
        button.addEventListener('click', async function () {
          var reservaId = button.getAttribute('data-cancel-reserva');
          if (!reservaId) return;
          button.disabled = true;
          try {
            await client.from('reservas_hospede').update({ status: 'cancelada', atualizado_em: new Date().toISOString() }).eq('id', reservaId).eq('email_hospede', user.email);
            await loadDashboardData(client, user, profile);
          } catch (_) {
            button.disabled = false;
          }
        });
      });
    }

    var createVoucherButton = byId('createVoucherButton');
    if (createVoucherButton) {
      createVoucherButton.onclick = async function () {
        if (!activeReservas.length) return;
        var reserva = activeReservas[0];
        var codigo = buildVoucherCode(reserva) + '-' + Date.now().toString().slice(-4);
        var insert = await client.from('vouchers').insert([{
          email_hospede: user.email,
          reserva_id: reserva.id,
          resort_nome: reserva.resort_nome || null,
          codigo: codigo,
          status: 'ativo',
          criado_em: new Date().toISOString()
        }]).select('*');

        if (insert.error) return;
        await loadDashboardData(client, user, profile);
      };
    }
  }

  async function setupDashboardPage(client) {
    var sessionRes = await client.auth.getSession();
    var session = sessionRes && sessionRes.data ? sessionRes.data.session : null;
    if (!session || !session.user) {
      window.location.replace('/portal/');
      return;
    }

    var user = session.user;
    var profile = await fetchUserProfile(client, user);

    var sectionButtons = document.querySelectorAll('[data-section-target]');
    function openSection(section) {
      sectionButtons.forEach(function (button) {
        var active = button.getAttribute('data-section-target') === section;
        button.classList.toggle('is-active', active);
      });

      document.querySelectorAll('.portal-section').forEach(function (panel) {
        var panelId = 'section-' + section;
        var active = panel.id === panelId;
        panel.classList.toggle('is-active', active);
        panel.hidden = !active;
      });
    }

    sectionButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        openSection(button.getAttribute('data-section-target'));
      });
    });

    var logoutButton = byId('logoutButton');
    if (logoutButton) {
      logoutButton.addEventListener('click', async function () {
        await client.auth.signOut();
        window.location.replace('/portal/');
      });
    }

    var menuToggle = byId('portalMenuToggle');
    var sidebar = byId('portalSidebar');
    if (menuToggle && sidebar) {
      menuToggle.addEventListener('click', function () {
        var open = sidebar.classList.toggle('is-open');
        menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }

    var profileName = byId('profileName');
    var profileWhatsapp = byId('profileWhatsapp');
    if (profileName) profileName.value = profile.nome_completo || '';
    if (profileWhatsapp) profileWhatsapp.value = profile.whatsapp || '';

    var settingsFeedback = byId('settingsFeedback');
    var profileForm = byId('profileForm');
    if (profileForm) {
      profileForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        setFeedback(settingsFeedback, '', null);
        var name = (profileName ? profileName.value : '').trim();
        var whatsapp = (profileWhatsapp ? profileWhatsapp.value : '').trim();
        if (!name) {
          setFeedback(settingsFeedback, 'Informe seu nome.', 'error');
          return;
        }

        var profileUpdate = await client.from('profiles')
          .upsert([{ id: user.id, nome_completo: name, whatsapp: whatsapp, atualizado_em: new Date().toISOString() }]);

        if (profileUpdate.error) {
          setFeedback(settingsFeedback, 'Erro ao salvar perfil: ' + profileUpdate.error.message, 'error');
          return;
        }

        var authUpdate = await client.auth.updateUser({
          data: {
            full_name: name,
            whatsapp: whatsapp
          }
        });
        if (authUpdate.error) {
          setFeedback(settingsFeedback, 'Perfil salvo, mas metadados não atualizaram.', 'error');
        } else {
          setFeedback(settingsFeedback, 'Perfil atualizado com sucesso.', 'success');
        }

        profile.nome_completo = name;
        profile.whatsapp = whatsapp;
        var guestName = byId('guestName');
        if (guestName) guestName.textContent = name;
      });
    }

    var passwordForm = byId('passwordForm');
    if (passwordForm) {
      passwordForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        setFeedback(settingsFeedback, '', null);

        var password = byId('newPassword').value;
        var confirm = byId('confirmNewPassword').value;

        if (password.length < 8) {
          setFeedback(settingsFeedback, 'A senha deve ter no mínimo 8 caracteres.', 'error');
          return;
        }
        if (password !== confirm) {
          setFeedback(settingsFeedback, 'As senhas não conferem.', 'error');
          return;
        }

        var update = await client.auth.updateUser({ password: password });
        if (update.error) {
          setFeedback(settingsFeedback, 'Erro ao atualizar senha: ' + update.error.message, 'error');
          return;
        }

        passwordForm.reset();
        setFeedback(settingsFeedback, 'Senha atualizada com sucesso.', 'success');
      });
    }

    var preferencesForm = byId('preferencesForm');
    var prefEmail = byId('prefEmail');
    var prefWhatsapp = byId('prefWhatsapp');

    try {
      var savedPrefs = JSON.parse(localStorage.getItem('hospedah_portal_preferences') || '{}');
      if (prefEmail) prefEmail.checked = !!savedPrefs.email;
      if (prefWhatsapp) prefWhatsapp.checked = !!savedPrefs.whatsapp;
    } catch (_) {
      // ignore
    }

    if (preferencesForm && prefEmail && prefWhatsapp) {
      preferencesForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        setFeedback(settingsFeedback, '', null);

        var prefs = {
          email: !!prefEmail.checked,
          whatsapp: !!prefWhatsapp.checked
        };

        localStorage.setItem('hospedah_portal_preferences', JSON.stringify(prefs));

        try {
          await client.from('profiles').update({
            notifica_email: prefs.email,
            notifica_whatsapp: prefs.whatsapp,
            atualizado_em: new Date().toISOString()
          }).eq('id', user.id);
        } catch (_) {
          // optional columns may not exist
        }

        setFeedback(settingsFeedback, 'Preferências salvas.', 'success');
      });
    }

    await loadDashboardData(client, user, profile);
  }

  async function init() {
    var page = document.body && document.body.getAttribute('data-portal-page');
    if (!page) return;

    try {
      var client = createClient();

      if (page === 'auth') {
        await setupAuthPage(client);
      } else if (page === 'dashboard') {
        await setupDashboardPage(client);
      } else if (page === 'reset') {
        await setupResetPage(client);
      }
    } catch (error) {
      var feedback = byId('loginFeedback') || byId('settingsFeedback') || byId('resetFeedback');
      setFeedback(feedback, 'Erro de inicialização: ' + error.message, 'error');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
