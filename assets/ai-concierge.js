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
  var LOCAL_RESORT_FALLBACK_MATCHES = [];
  var LOCAL_RESORT_FACT_MATCHES = [];
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
      terms: ['solar das aguas', 'solar das águas', 'solar das aguas resort', 'solar das águas resort'],
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
      terms: ['porto 2 life', 'porto 2', 'porto dois', 'porto life'],
      response: 'Ótima escolha! ⚓ O Porto 2 Life é um resort moderno, com lazer completo, piscinas e acomodações de alto padrão.\n\n' +
        'Para consultar detalhes, valores e disponibilidade, me diga as datas desejadas e quantas pessoas vão viajar. 😊'
    }
  ];
  var LOCAL_RESORT_FACTS = [
    {
      terms: ['hot beach', 'hotbeach', 'hot beach suites'],
      facts: {
        parque: 'No Hot Beach Suites, a taxa do parque aquático é paga diretamente ao resort no check-in:\n\n' +
          '• Apartamento de 1 dormitório: R$129,00/dia acima de 2 dias\n' +
          '• Apartamento de 2 dormitórios: R$169,00/dia acima de 2 dias\n' +
          '• O valor é por apartamento, independente do número de hóspedes\n\n' +
          'Valores sujeitos a alterações pelo resort. 😊',
        estacionamento: 'Sim! No Hot Beach Suites há 1 vaga gratuita na garagem por apartamento, inclusa na diária. 🚗',
        checkin: 'No Hot Beach Suites, o check-in é a partir das 15h e o check-out até as 11h. 🔑',
        alimentacao: 'No Hot Beach Suites, as refeições não estão incluídas na diária. O apartamento tem cozinha completa e o resort também possui restaurante com refeições pagas à parte. 🍽️',
        cozinha: 'Sim! O Hot Beach Suites tem cozinha completa no apartamento, com panelas, cafeteira, talheres, pratos, copos, cooktop, micro-ondas, geladeira e varanda gourmet. 🍳',
        capacidade: 'No Hot Beach Suites, o apartamento de 1 dormitório acomoda até 6 pessoas e o de 2 dormitórios acomoda até 8 pessoas. 👨‍👩‍👧‍👦',
        pets: 'Sobre pets no Hot Beach Suites, essa informação precisa ser confirmada pelo WhatsApp 📱 ' + SUPPORT_WHATSAPP + '.'
      }
    },
    {
      terms: ['olimpia park', 'olímpia park', 'olimpia park resort'],
      facts: {
        estacionamento: 'Sim! No Olimpia Park Resort há 1 vaga gratuita na garagem por apartamento, inclusa na diária. 🚗',
        checkin: 'No Olimpia Park Resort, o check-in é a partir das 14h e o check-out até as 11h. 🔑',
        alimentacao: 'No Olimpia Park Resort, as refeições não estão incluídas na diária. O resort tem restaurante e lanchonete com refeições pagas à parte. 🍽️',
        cozinha: 'No Olimpia Park Resort, o apartamento possui roupas de cama e banho, mas não inclui talheres, pratos, copos ou utensílios de cozinha.',
        capacidade: 'No Olimpia Park Resort, o apartamento de 1 dormitório acomoda até 6 pessoas e o de 2 dormitórios acomoda até 8 pessoas. 👨‍👩‍👧‍👦',
        pets: 'O Olimpia Park Resort não aceita pets. 🐾'
      }
    },
    {
      terms: ['sao pedro', 'são pedro', 'sao pedro thermas', 'são pedro thermas'],
      facts: {
        estacionamento: 'Sim! No São Pedro Thermas há 1 vaga gratuita na garagem por apartamento, inclusa na diária. 🚗',
        checkin: 'No São Pedro Thermas, o check-in é a partir das 14h e o check-out até as 11h. 🔑',
        alimentacao: 'No São Pedro Thermas, as refeições não estão incluídas na diária. O resort tem restaurante e lanchonete com refeições pagas diretamente no local; alimentos de fora não são permitidos. 🍽️',
        cozinha: 'No São Pedro Thermas, o apartamento possui roupas de cama e banho, mas não inclui talheres, pratos, copos ou utensílios de cozinha.',
        pets: 'O São Pedro Thermas não aceita pets. 🐾'
      }
    },
    {
      terms: ['solar das aguas', 'solar das águas'],
      facts: {
        estacionamento: 'Sim! No Solar das Águas há 1 vaga gratuita na garagem por apartamento, inclusa na diária. 🚗',
        checkin: 'No Solar das Águas, o check-in é a partir das 14h e o check-out até as 11h. 🔑',
        alimentacao: 'No Solar das Águas, as refeições não estão incluídas na diária. O resort tem restaurante com refeições pagas à parte. 🍽️',
        cozinha: 'No Solar das Águas, o apartamento possui roupas de cama e banho, mas não inclui talheres, pratos, copos ou utensílios de cozinha.',
        capacidade: 'No Solar das Águas, o apartamento de 1 dormitório acomoda até 5 pessoas e o de 2 dormitórios acomoda até 7 pessoas. 👨‍👩‍👧‍👦',
        pets: 'O Solar das Águas não aceita pets. 🐾'
      }
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
    // Permite comparar nomes com e sem acentos, como "Olímpia" e "Olimpia".
    return String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  LOCAL_RESORT_FALLBACK_MATCHES = LOCAL_RESORT_FALLBACKS.map(function (item) {
    return {
      normalizedTerms: item.terms.map(normalizeText),
      response: item.response
    };
  });

  LOCAL_RESORT_FACT_MATCHES = LOCAL_RESORT_FACTS.map(function (item) {
    return {
      normalizedTerms: item.terms.map(normalizeText),
      facts: item.facts
    };
  });

  function getLastUserText(mensagens) {
    for (var i = mensagens.length - 1; i >= 0; i--) {
      if (mensagens[i] && mensagens[i].role === 'user') {
        return mensagens[i].content || '';
      }
    }
    return '';
  }

  function textHasAny(text, terms) {
    for (var i = 0; i < terms.length; i++) {
      if (text.indexOf(terms[i]) !== -1) return true;
    }
    return false;
  }

  function detectFactIntent(text) {
    if (textHasAny(text, ['parque', 'taxa do parque', 'valor do parque', 'preco do parque', 'preço do parque', 'ingresso'])) return 'parque';
    if (textHasAny(text, ['estacionamento', 'estrcionamento', 'garagem', 'vaga'])) return 'estacionamento';
    if (textHasAny(text, ['check-in', 'checkin', 'check out', 'checkout', 'entrada', 'saida', 'saída', 'horario', 'horário'])) return 'checkin';
    if (textHasAny(text, ['alimentacao', 'alimentação', 'refeicao', 'refeição', 'refeicoes', 'refeições', 'cafe', 'café', 'almoco', 'almoço', 'jantar', 'comida'])) return 'alimentacao';
    if (textHasAny(text, ['cozinha', 'utensilio', 'utensílio', 'talher', 'panela', 'microondas', 'micro-ondas', 'geladeira'])) return 'cozinha';
    if (textHasAny(text, ['quantas pessoas', 'capacidade', 'hospedes', 'hóspedes', 'pessoas'])) return 'capacidade';
    if (textHasAny(text, ['pet', 'pets', 'cachorro', 'gato', 'animal'])) return 'pets';
    return null;
  }

  function detectResortFact(mensagens, intencao) {
    var candidates = [];
    if (intencao && intencao.resort_interesse) candidates.push(normalizeText(intencao.resort_interesse));
    for (var i = mensagens.length - 1; i >= 0 && candidates.length < 8; i--) {
      if (mensagens[i] && mensagens[i].content) candidates.push(normalizeText(mensagens[i].content));
    }
    for (var c = 0; c < candidates.length; c++) {
      for (var r = 0; r < LOCAL_RESORT_FACT_MATCHES.length; r++) {
        if (textHasAny(candidates[c], LOCAL_RESORT_FACT_MATCHES[r].normalizedTerms)) {
          return LOCAL_RESORT_FACT_MATCHES[r];
        }
      }
    }
    return null;
  }

  function localFactResponse(mensagens, intencao) {
    var text = normalizeText(getLastUserText(mensagens));
    var intent = detectFactIntent(text);
    if (!intent) return null;
    var resort = detectResortFact(mensagens, intencao);
    if (!resort || !resort.facts[intent]) return null;
    return resort.facts[intent];
  }

  function localFallbackResponse(mensagens) {
    var text = normalizeText(getLastUserText(mensagens));
    if (!text) return null;
    for (var i = 0; i < LOCAL_RESORT_FALLBACK_MATCHES.length; i++) {
      var item = LOCAL_RESORT_FALLBACK_MATCHES[i];
      for (var j = 0; j < item.normalizedTerms.length; j++) {
        if (text.indexOf(item.normalizedTerms[j]) !== -1) {
          return item.response;
        }
      }
    }
    return null;
  }

  function localResponse(mensagens, intencao) {
    return localFactResponse(mensagens, intencao) || localFallbackResponse(mensagens);
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

    var local = localResponse(mensagens, intencao);
    if (local) return Promise.resolve(local);

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

    var local = localResponse(mensagens, intencao);
    if (local) {
      if (onToken) onToken(local, local);
      if (onDone) onDone(local);
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
    responderLocal: localResponse,
    renderMarkdown: renderMarkdown,
    edgeUrl: EDGE_FN_URL,
    edgeAnon: SUPABASE_ANON_KEY
  };
})();
