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
  var EDGE_FN_URL = 'https://ydrmjoppjxtmnwtvtinb.supabase.co/functions/v1/ai-concierge';
  // Chave anon pública do projeto Supabase — necessária no header
  // para que o gateway do Supabase aceite chamadas à Edge Function.
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlkcm1qb3Bwanh0bW53dHZ0aW5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNzA3MzksImV4cCI6MjA5MTg0NjczOX0.Gp4ed332v62sC5e5GXXbPqOIBNpS4EzMCFawnBJE_Cw';
  var DEFAULT_TEMPERATURE = 0.7;
  var FALLBACK_COUNTER = 0;

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
          console.error(
            '[HOSPEDAH_AI] Edge function HTTP ' + res.status +
            (model  ? ' | modelo: ' + model   : '') +
            (gStatus ? ' | Gemini: ' + gStatus : '') +
            ' | erro: ' + detail
          );
          return null;
        }
        return (data && data.resposta) ? data.resposta.trim() : null;
      }).catch(function () {
        console.warn('[HOSPEDAH_AI] Não foi possível ler a resposta da Edge Function.');
        return null;
      });
    }).catch(function () {
      if (timeoutId) clearTimeout(timeoutId);
      console.error('[HOSPEDAH_AI] Erro de rede ao chamar a Edge Function.');
      return null;
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
