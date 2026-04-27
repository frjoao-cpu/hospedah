// ============================================================
// HOSPEDAH — Concierge IA (Google Gemini 2.5 Flash)
// Chamada direta à API Gemini a partir do navegador.
//
// Pré-requisito: window.GEMINI_API_KEY deve estar definido
// antes deste script ser executado. O CI gera o arquivo
// assets/ai-config.js com o valor do GitHub Secret GEMINI_API_KEY.
//
// Restrinja a chave ao domínio hospedah.tur.br no Google Cloud
// Console (APIs & Services → Credentials) para evitar uso
// não autorizado caso a chave seja lida no código-fonte.
// ============================================================
/* global window, fetch */
(function () {
  var GEMINI_MODEL = 'gemini-2.5-flash';
  var GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL;
  var EDGE_FN_URL = 'https://ydrmjoppjxtmnwtvtinb.supabase.co/functions/v1/ai-concierge';
  var FALLBACK_COUNTER = 0;

  var SYSTEM_PROMPT = 'Você é o Concierge IA da HOSPEDAH, uma agência de turismo especializada em resorts e hospedagens de luxo no Brasil.\n\nInformações sobre a HOSPEDAH:\n- Site: hospedah.tur.br\n- WhatsApp Flávio: +55 17 98200-6382\n- WhatsApp Juliana: +55 17 99206-8296\n- Instagram: @julianasilvaoliveira.joao\n- Atendimento humano: segunda a sábado, 8h–20h (horário de Brasília)\n\nPolítica geral de reservas:\n- Check-in: a partir das 14h (Hot Beach Suites: a partir das 15h) | Check-out: até as 11h\n- Para horários especiais, solicitar com antecedência\n- Cancelamento com mais de 7 dias: reembolso integral\n- Cancelamento entre 3–7 dias: 50% de reembolso\n- Cancelamento com menos de 3 dias: sem reembolso\n\nFormas de pagamento aceitas:\n- PIX (desconto de 5%)\n- Cartão de crédito (em até 12x)\n- Boleto bancário\n- Transferência bancária\n\nResorts disponíveis (detalhes):\n\n🏖️ HOT BEACH SUITES — Olímpia/SP:\n- Piscinas termais, área de lazer completa e acomodações premium. Ideal para famílias e casais.\n- Check-in a partir das 15h | Check-out até as 11h\n- Estacionamento: 1 vaga na garagem gratuita por apartamento (inclusa na diária, sem custo adicional)\n- Apartamento equipado com utensílios completos de cozinha (panelas, cafeteira, talheres, pratos, copos, etc.), cooktop, forno microondas, geladeira e varanda gourmet com tela de proteção\n- É permitido trazer alimentos e bebidas; devem ser consumidos dentro do apartamento\n- Roupas de cama e banho fornecidas pelo resort\n- Acesso gratuito à Vila Guarani para hóspedes\n- Wi-Fi gratuito no apartamento e áreas comuns\n- Serviço de limpeza básica durante a estadia (retirada de lixo, arrumação das camas e troca de toalhas deixadas separadas pelo hóspede)\n- Taxa de higienização da churrasqueira: R$40,00; o resort disponibiliza kit churrasco (1 tábua, 1 faca, 1 pegador, 1 garfo)\n- Taxa do parque aquático — Apartamento de 1 dormitório: R$129,00/dia (acima de 2 dias), valor total independente do número de hóspedes (ex.: 6 pessoas = R$129,00/dia)\n- Taxa do parque aquático — Apartamento de 2 dormitórios: R$169,00/dia (acima de 2 dias), valor total independente do número de hóspedes (ex.: 8 pessoas = R$169,00/dia); valores sujeitos a alterações\n- A taxa do parque aquático é paga diretamente ao resort no momento do check-in\n- Pré check-in possível para uso do parque aquático mediante taxa adicional de R$15,00/pessoa; acesso ao apartamento somente a partir das 15h\n- Alimentação paga à parte diretamente no restaurante; pacotes de meia-pensão ou pensão completa podem ser negociados com a central de reservas após a confirmação da reserva\n- Aceita pets: não informado — orientar o cliente a confirmar via WhatsApp\n- Dados necessários para reserva: nome, CPF, RG, data de nascimento, e-mail, endereço completo\n\n♨️ SÃO PEDRO THERMAS — São Pedro/SP:\n- Águas termais naturais, piscinas aquecidas e acomodações premium.\n- Check-in a partir das 14h | Check-out até as 11h\n- Estacionamento: 1 vaga na garagem gratuita por apartamento (inclusa na diária, sem custo adicional)\n- Apartamento com roupas de cama e banho; NÃO inclui talheres, pratos, copos ou utensílios de cozinha\n- Voltagem do apartamento: 220V\n- Wi-Fi gratuito disponível\n- Não aceita pets\n- Menores desacompanhados dos pais necessitam de autorização prévia (informar no momento da reserva)\n- É proibido ultrapassar a capacidade máxima de hóspedes do apartamento (crianças e bebês contam como hóspedes)\n- O hóspede deve entregar o apartamento no mesmo estado em que recebeu, sem multas, taxas ou despesas geradas durante a estadia\n\n🎢 OLIMPIA PARK RESORT — Olímpia/SP:\n- Parque aquático com tobogãs e atrações, piscinas e acomodações premium.\n- Check-in a partir das 14h | Check-out até as 11h\n- Estacionamento: 1 vaga na garagem gratuita por apartamento (inclusa na diária, sem custo adicional)\n- Apartamento com roupas de cama e banho; NÃO inclui talheres, pratos, copos ou utensílios de cozinha\n- Voltagem do apartamento: 220V\n- Wi-Fi gratuito disponível\n- Não aceita pets\n- Menores desacompanhados dos pais necessitam de autorização prévia (informar no momento da reserva)\n- É proibido ultrapassar a capacidade máxima de hóspedes do apartamento (crianças e bebês contam como hóspedes)\n- O hóspede deve entregar o apartamento no mesmo estado em que recebeu, sem multas, taxas ou despesas geradas durante a estadia\n\n☀️ SOLAR DAS ÁGUAS (localização: consulte via WhatsApp):\n- Resort com piscinas, área de lazer completa e acomodações exclusivas.\n- Check-in a partir das 14h | Check-out até as 11h\n- Estacionamento: 1 vaga na garagem gratuita por apartamento (inclusa na diária, sem custo adicional)\n- Apartamento com roupas de cama e banho; NÃO inclui talheres, pratos, copos ou utensílios de cozinha\n- Voltagem do apartamento: 220V\n- Wi-Fi gratuito disponível\n- Não aceita pets\n- Menores desacompanhados dos pais necessitam de autorização prévia (informar no momento da reserva)\n- É proibido ultrapassar a capacidade máxima de hóspedes do apartamento (crianças e bebês contam como hóspedes)\n- O hóspede deve entregar o apartamento no mesmo estado em que recebeu, sem multas, taxas ou despesas geradas durante a estadia\n\n👑 WYNDHAM ROYAL (localização: consulte via WhatsApp):\n- Suítes de luxo, piscinas premium e lazer exclusivo.\n\n🌊 PRAIA DE JUQUEHY — São Sebastião/SP:\n- Hospedagem à beira-mar, mar azul e natureza exuberante. Ideal para quem busca praia e descanso.\n\n🌊 IPIOCA BEACH RESORT — Maceió/AL:\n- Resort à beira-mar com praia exclusiva, natureza exuberante e infraestrutura completa para toda a família.\n\n⚓ PORTO 2 LIFE (localização: consulte via WhatsApp):\n- Resort moderno com lazer completo, piscinas e acomodações de alto padrão para toda a família.\n\nPara orçamentos e reservas de todos os resorts, entre em contato via WhatsApp: (17) 98200-6382 (Flávio) ou (17) 99206-8296 (Juliana).\n\nInstruções de comportamento:\n- Responda SEMPRE em português do Brasil, de forma calorosa, educada e profissional.\n- Seja conciso e objetivo — respostas curtas e claras são preferidas.\n- Use emojis com moderação para tornar a conversa mais amigável.\n- Se não souber a resposta com certeza, oriente o cliente a entrar em contato pelo WhatsApp ou acessar o site.\n- Nunca invente preços, datas de disponibilidade ou políticas não mencionadas acima.\n- Não discuta tópicos fora de turismo, hospedagem e serviços da HOSPEDAH.';

  function buildPayload(lead, mensagens, intencao, temperature, faqExtras) {
    var rawContents = (mensagens || []).map(function (m) {
      return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] };
    });

    var firstUserIdx = -1;
    for (var i = 0; i < rawContents.length; i++) {
      if (rawContents[i].role === 'user') { firstUserIdx = i; break; }
    }
    var trimmed = firstUserIdx >= 0 ? rawContents.slice(firstUserIdx) : [];

    var contents = [];
    for (var j = 0; j < trimmed.length; j++) {
      var c = trimmed[j];
      if (!c.parts.length) continue;
      if (contents.length > 0 && contents[contents.length - 1].role === c.role) {
        contents[contents.length - 1].parts[0].text += '\n' + c.parts[0].text;
      } else {
        contents.push({ role: c.role, parts: [{ text: c.parts[0].text }] });
      }
    }

    var leadLines = [];
    if (lead && lead.nome)    leadLines.push('Nome do cliente: ' + lead.nome);
    if (lead && lead.assunto) leadLines.push('Assunto de interesse: ' + lead.assunto);
    if (intencao) {
      if (intencao.resort_interesse) leadLines.push('Resort de interesse: ' + intencao.resort_interesse);
      if (intencao.data_entrada)     leadLines.push('Data de entrada desejada: ' + intencao.data_entrada);
      if (intencao.data_saida)       leadLines.push('Data de saída desejada: ' + intencao.data_saida);
      if (intencao.num_hospedes != null) leadLines.push('Número de hóspedes: ' + intencao.num_hospedes);
      if (intencao.pagina_origem && intencao.pagina_origem !== 'direto') {
        leadLines.push('Página de origem: ' + intencao.pagina_origem);
      }
    }

    var systemText = leadLines.length > 0
      ? SYSTEM_PROMPT + '\n\n---\nContexto da conversa atual:\n' + leadLines.join('\n')
      : SYSTEM_PROMPT;

    if (faqExtras && faqExtras.length > 0) {
      systemText += '\n\n---\nInformações adicionais registradas pela equipe HOSPEDAH:\n' + faqExtras;
    }

    var temp = typeof temperature === 'number' ? Math.max(0, Math.min(1, temperature)) : 0.7;

    return {
      system_instruction: { parts: [{ text: systemText }] },
      contents: contents,
      generationConfig: {
        temperature: temp,
        // 8192 tokens acomodam respostas detalhadas sobre resorts mais o FAQ injetado no contexto
        maxOutputTokens: 8192
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
      ]
    };
  }

  function buildEdgePayload(lead, mensagens, intencao, temperature, faqExtras) {
    return {
      lead: lead || { nome: '', assunto: '' },
      conversa_id: 'web_' + buildConversationId(),
      mensagens: mensagens || [],
      timestamp_inicio: new Date().toISOString(),
      contexto_intencao: intencao || {},
      temperature: typeof temperature === 'number' ? temperature : undefined,
      faq_extras: faqExtras || ''
    };
  }

  function getKey() {
    return (typeof window !== 'undefined' && window.GEMINI_API_KEY) || '';
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

  function chamarEdge(lead, mensagens, intencao, temperature, faqExtras) {
    var payload = buildEdgePayload(lead, mensagens, intencao, temperature, faqExtras);
    return fetch(EDGE_FN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          console.error('[HOSPEDAH_AI] Edge function ' + res.status + ':', JSON.stringify(data).slice(0, 500));
          return null;
        }
        return data && data.resposta ? data.resposta.trim() : null;
      }).catch(function () {
        if (!res.ok) {
          console.warn('[HOSPEDAH_AI] Não foi possível ler o corpo do erro da Edge Function (' + res.status + ').');
        }
        return null;
      });
    })
    .catch(function () { return null; });
  }

  function chamar(lead, mensagens, intencao, temperature, faqExtras) {
    var key = getKey();
    if (!mensagens || !mensagens.length) return Promise.resolve(null);
    if (!key) {
      console.warn('[HOSPEDAH_AI] GEMINI_API_KEY não configurada — usando Edge Function.');
      return chamarEdge(lead, mensagens, intencao, temperature, faqExtras);
    }
    var payload = buildPayload(lead, mensagens, intencao, temperature, faqExtras);
    if (!payload.contents.length) return chamarEdge(lead, mensagens, intencao, temperature, faqExtras);
    return fetch(GEMINI_BASE + ':generateContent?key=' + key, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(function (res) {
      if (!res.ok) {
        return res.text().then(function (body) {
          console.error('[HOSPEDAH_AI] Gemini API ' + res.status + ':', body.slice(0, 500));
        }).catch(function () {
          console.warn('[HOSPEDAH_AI] Não foi possível ler o corpo do erro do Gemini.');
        }).then(function () {
          return chamarEdge(lead, mensagens, intencao, temperature, faqExtras);
        });
      }
      // Parse e processa a resposta dentro do mesmo .then para evitar que o resultado
      // de chamarEdge (string) seja passado ao bloco de parse do Gemini como se fosse JSON.
      return res.json().then(function (data) {
        if (!data || !data.candidates || !data.candidates.length) {
          console.warn('[HOSPEDAH_AI] Gemini retornou sem candidatos.');
          return chamarEdge(lead, mensagens, intencao, temperature, faqExtras);
        }
        var parts = (data.candidates[0].content && data.candidates[0].content.parts) || [];
        var textPart = null;
        for (var i = 0; i < parts.length; i++) {
          if (parts[i].text && !parts[i].thought) { textPart = parts[i]; break; }
        }
        if (!textPart || !textPart.text) {
          console.warn('[HOSPEDAH_AI] Gemini retornou sem texto.');
          return chamarEdge(lead, mensagens, intencao, temperature, faqExtras);
        }
        return textPart.text.trim();
      });
    })
    .catch(function () {
      return chamarEdge(lead, mensagens, intencao, temperature, faqExtras);
    });
  }

  function streamUrl() {
    return GEMINI_BASE + ':streamGenerateContent?alt=sse&key=' + getKey();
  }

  window.HOSPEDAH_AI = { chamar: chamar, buildPayload: buildPayload, streamUrl: streamUrl };
})();
