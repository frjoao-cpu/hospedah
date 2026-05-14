// ============================================================
// HOSPEDAH — Concierge IA (v2)
//
// Todas as chamadas à IA são feitas exclusivamente via
// Supabase Edge Function, mantendo a chave Gemini no servidor.
//
// Não é necessário configurar window.GEMINI_API_KEY no browser;
// a chave fica configurada apenas nas variáveis de ambiente da
// Edge Function (Supabase Dashboard → Settings → Edge Functions).
// ============================================================
/* global window, fetch */
(function () {
  var EDGE_FN_URL = (window.HOSPEDAH_SB_URL || 'https://ydrmjoppjxtmnwtvtinb.supabase.co') + '/functions/v1/ai-concierge';
  var SUPPORT_WHATSAPP = '(17) 98200-6382';
  var KEY_MISSING_ERROR = 'gemini_api_key';
  var SERVICE_DOWN_ERROR = 'temporariamente indisponível';
  var MSG_SERVICE_UNSTABLE = 'Estou com instabilidade temporária no atendimento automático. Tente novamente em instantes ou fale pelo WhatsApp 📱 ' + SUPPORT_WHATSAPP + '.';
  var MSG_SERVICE_UNSTABLE_GENERIC = 'Estou com instabilidade temporária no atendimento automático. Fale pelo WhatsApp 📱 ' + SUPPORT_WHATSAPP + '.';
  var MSG_NETWORK_UNSTABLE = 'Estou com instabilidade de conexão no atendimento automático. Fale pelo WhatsApp 📱 ' + SUPPORT_WHATSAPP + '.';
  var LOCAL_RESORT_FALLBACKS = [
    {
      terms: ['olimpia park', 'olímpia park', 'olimpia', 'olímpia'],
      response: 'Ótima escolha! 🎢 O Olimpia Park Resort fica em Olímpia/SP e é uma opção com parque aquático, piscinas e acomodações premium.\n\n' +
        '• Check-in a partir das 14h e check-out até as 11h\n' +
        '• Apartamentos de 1 dormitório para até 6 pessoas ou 2 dormitórios para até 8 pessoas\n' +
        '• 1 vaga gratuita na garagem por apartamento\n' +
        '• Não aceita pets\n' +
        '• Refeições não estão incluídas na diária; são pagas diretamente no restaurante/lanchonete do resort\n\n' +
        'Para eu te ajudar melhor, quais datas e quantas pessoas vão viajar? 😊'
    },
    {
      terms: ['hot beach', 'hotbeach'],
      response: 'Ótima escolha! 🏖️ O Hot Beach Suites fica em Olímpia/SP, tem piscinas termais, lazer completo e apartamentos com cozinha completa.\n\n' +
        '• Check-in a partir das 15h e check-out até as 11h\n' +
        '• Apartamento de 1 dormitório para até 6 pessoas ou 2 dormitórios para até 8 pessoas\n' +
        '• 1 vaga gratuita na garagem por apartamento\n' +
        '• Refeições não estão incluídas na diária\n\n' +
        'Quais datas e quantas pessoas vão viajar? 😊'
    },
    {
      terms: ['sao pedro', 'são pedro', 'thermas'],
      response: 'Ótima escolha! ♨️ O São Pedro Thermas tem águas termais naturais, piscinas aquecidas e acomodações premium.\n\n' +
        '• Check-in a partir das 14h e check-out até as 11h\n' +
        '• 1 vaga gratuita na garagem por apartamento\n' +
        '• Não aceita pets\n' +
        '• Refeições não estão incluídas na diária e alimentos de fora não são permitidos\n\n' +
        'Quais datas e quantas pessoas vão viajar? 😊'
    },
    {
      terms: ['solar das aguas', 'solar das águas', 'solar'],
      response: 'Ótima escolha! ☀️ O Solar das Águas é um resort completo, com piscinas, lazer e acomodações para famílias.\n\n' +
        '• Check-in a partir das 14h e check-out até as 11h\n' +
        '• Apartamento de 1 dormitório para até 5 pessoas ou 2 dormitórios para até 7 pessoas\n' +
        '• 1 vaga gratuita na garagem por apartamento\n' +
        '• Refeições não estão incluídas na diária\n\n' +
        'Quais datas e quantas pessoas vão viajar? 😊'
    },
    {
      terms: ['wyndham', 'royal'],
      response: 'Ótima escolha! 👑 O Wyndham Royal é uma opção de alto padrão, com suítes de luxo, piscinas premium e lazer exclusivo.\n\n' +
        'Para consultar detalhes, valores e disponibilidade, me diga as datas desejadas e quantas pessoas vão viajar. 😊'
    },
    {
      terms: ['juquehy', 'juquei'],
      response: 'Ótima escolha! 🌊 A Praia de Juquehy, em São Sebastião/SP, é ideal para quem busca praia, descanso e natureza.\n\n' +
        'Para consultar detalhes, valores e disponibilidade, me diga as datas desejadas e quantas pessoas vão viajar. 😊'
    },
    {
      terms: ['ipioca'],
      response: 'Ótima escolha! 🌊 O Ipioca Beach Resort fica em Maceió/AL, à beira-mar, com praia exclusiva e estrutura para toda a família.\n\n' +
        'Para consultar detalhes, valores e disponibilidade, me diga as datas desejadas e quantas pessoas vão viajar. 😊'
    },
    {
      terms: ['porto 2 life', 'porto i2', 'porto'],
      response: 'Ótima escolha! ⚓ O Porto 2 Life é um resort moderno, com lazer completo, piscinas e acomodações de alto padrão.\n\n' +
        'Para consultar detalhes, valores e disponibilidade, me diga as datas desejadas e quantas pessoas vão viajar. 😊'
    }
  ];
  // Chave anon pública centralizada em assets/supabase-config.js.
  // Segurança garantida pelo RLS do Supabase, não pela ocultação da chave.
  var SUPABASE_ANON_KEY = window.HOSPEDAH_SB_ANON || '';
  var DEFAULT_TEMPERATURE = 0.7;
  var FALLBACK_COUNTER = 0;

  function serviceFallbackMessage(detail) {
    var d = (detail || '').toLowerCase();
    if (d.indexOf(KEY_MISSING_ERROR) !== -1 || d.indexOf(SERVICE_DOWN_ERROR) !== -1) {
      return MSG_SERVICE_UNSTABLE;
    }
    return null;
  }

  function normalizeText(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function getLastUserText(mensagens) {
    for (var i = mensagens.length - 1; i >= 0; i--) {
      if (mensagens[i] && mensagens[i].role === 'user') {
        return mensagens[i].content || '';
      }
    }
    return '';
  }

  function localFallbackResponse(mensagens) {
    var text = normalizeText(getLastUserText(mensagens));
    if (!text) return null;
    for (var i = 0; i < LOCAL_RESORT_FALLBACKS.length; i++) {
      var item = LOCAL_RESORT_FALLBACKS[i];
      for (var j = 0; j < item.terms.length; j++) {
        if (text.indexOf(normalizeText(item.terms[j])) !== -1) {
          return item.response;
        }
      }
    }
    return null;
  }

  function buildConversationId() {
    if (typeof crypto !== 'undefined') {
      if (crypto.randomUUID) return crypto.randomUUID();
      if (crypto.getRandomValues) {
        var bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        return Array.prototype.map.call(bytes, function (b) {
          return b.toString(16).padStart(2, '0');
        }).join('');
      }
    }
    FALLBACK_COUNTER = (FALLBACK_COUNTER + 1) % 1679616;
    return Date.now().toString(36) + '_' + FALLBACK_COUNTER.toString(36);
  }

  /**
   * Envia uma mensagem para o Concierge IA via Edge Function.
   * @param {{ nome: string, assunto: string }} lead
   * @param {Array<{ role: string, content: string, ts: string }>} mensagens
   * @param {object} [intencao]
   * @param {number} [temperature]
   * @param {string} [faqExtras]
   * @returns {Promise<string|null>}
   */
  function chamar(lead, mensagens, intencao, temperature, faqExtras) {
    // Sem mensagens não há contexto para a IA responder.
    if (!mensagens || !mensagens.length) return Promise.resolve(null);

    var payload = {
      lead: lead || { nome: '', assunto: '' },
      conversa_id: 'web_' + buildConversationId(),
      mensagens: mensagens,
      timestamp_inicio: new Date().toISOString(),
      contexto_intencao: intencao || {},
      temperature: typeof temperature === 'number' ? temperature : DEFAULT_TEMPERATURE,
      faq_extras: faqExtras || ''
    };

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeoutId = controller
      ? setTimeout(function () { controller.abort(); }, 45000)
      : null;

    return fetch(EDGE_FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
      },
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      if (timeoutId) clearTimeout(timeoutId);
      return res.json().then(function (data) {
        if (!res.ok) {
          var detail = data && data.error ? data.error : '(sem detalhe)';
          var model  = data && data.model  ? data.model  : '';
          var gStatus = data && data.geminiStatus ? data.geminiStatus : '';
          var friendly = serviceFallbackMessage(detail);
          console.error(
            '[HOSPEDAH_AI] Edge function HTTP ' + res.status +
            (model  ? ' | modelo: ' + model   : '') +
            (gStatus ? ' | Gemini: ' + gStatus : '') +
            ' | erro: ' + detail
          );
          return friendly || localFallbackResponse(mensagens) || MSG_SERVICE_UNSTABLE_GENERIC;
        }
        return (data && data.resposta) ? data.resposta.trim() : null;
      }).catch(function () {
        console.warn('[HOSPEDAH_AI] Não foi possível ler a resposta da Edge Function.');
        return localFallbackResponse(mensagens) || MSG_SERVICE_UNSTABLE_GENERIC;
      });
    }).catch(function () {
      if (timeoutId) clearTimeout(timeoutId);
      console.error('[HOSPEDAH_AI] Erro de rede ao chamar a Edge Function.');
      return localFallbackResponse(mensagens) || MSG_NETWORK_UNSTABLE;
    });
  }

  /**
   * Escapa HTML e converte markdown básico (bold e quebras de linha) para HTML seguro.
   * Usada pelos widgets inline para renderizar respostas da IA.
   * @param {string} text
   * @returns {string}
   */
  function renderMarkdown(text) {
    var safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    return safe;
  }

  /**
   * Chama a IA com streaming SSE, renderizando tokens conforme chegam.
   * @param {{ nome: string, assunto: string }} lead
   * @param {Array<{ role: string, content: string, ts: string }>} mensagens
   * @param {object} [intencao]
   * @param {number} [temperature]
   * @param {string} [faqExtras]
   * @param {function} onToken - chamado com (chunk, textoAcumulado) a cada token recebido
   * @param {function} onDone - chamado com (textoFinal|null) ao terminar ou em caso de erro
   */
  function chamarStream(lead, mensagens, intencao, temperature, faqExtras, onToken, onDone) {
    if (!mensagens || !mensagens.length) {
      if (onDone) onDone(null);
      return;
    }

    var payload = {
      lead: lead || { nome: '', assunto: '' },
      conversa_id: 'web_' + buildConversationId(),
      mensagens: mensagens,
      timestamp_inicio: new Date().toISOString(),
      contexto_intencao: intencao || {},
      temperature: typeof temperature === 'number' ? temperature : DEFAULT_TEMPERATURE,
      faq_extras: faqExtras || '',
      stream: true
    };

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeoutId = controller
      ? setTimeout(function () { controller.abort(); }, 45000)
      : null;

    fetch(EDGE_FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
      },
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      if (timeoutId) clearTimeout(timeoutId);
      if (!res.ok || !res.body) {
        console.error('[HOSPEDAH_AI] Stream: HTTP ' + res.status);
        if (onDone) onDone(null);
        return;
      }
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';
      var fullText = '';
      function readChunk() {
        reader.read().then(function (result) {
          if (result.done) {
            if (onDone) onDone(fullText || null);
            return;
          }
          buffer += decoder.decode(result.value, { stream: true });
          var lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (!line.startsWith('data: ')) continue;
            var jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === '[DONE]') continue;
            try {
              var parsed = JSON.parse(jsonStr);
              var parts = (parsed && parsed.candidates && parsed.candidates[0] &&
                parsed.candidates[0].content && parsed.candidates[0].content.parts) || [];
              for (var k = 0; k < parts.length; k++) {
                var p = parts[k];
                if (p.text && !p.thought) {
                  fullText += p.text;
                  if (onToken) onToken(p.text, fullText);
                }
              }
            } catch (e) { /* skip malformed chunk */ }
          }
          readChunk();
        }).catch(function () {
          if (onDone) onDone(fullText || null);
        });
      }
      readChunk();
    }).catch(function () {
      if (timeoutId) clearTimeout(timeoutId);
      console.error('[HOSPEDAH_AI] Erro de rede ao chamar a Edge Function (stream).');
      if (onDone) onDone(null);
    });
  }

  window.HOSPEDAH_AI = {
    chamar: chamar,
    chamarStream: chamarStream,
    renderMarkdown: renderMarkdown,
    edgeUrl: EDGE_FN_URL,
    edgeAnon: SUPABASE_ANON_KEY
  };
})();
